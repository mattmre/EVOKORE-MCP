/**
 * ContainerSandbox: Container-based skill execution isolation layer.
 *
 * Provides materially stronger execution boundaries than the default
 * subprocess sandbox by running skill code inside a Docker/Podman container
 * with:
 *   - Read-only root filesystem (writable /tmp only)
 *   - No network access (--network=none)
 *   - Memory limit (default 256MB)
 *   - CPU limit (default 1 CPU)
 *   - PID limit (100)
 *   - No new-privileges flag
 *   - Non-root user
 *   - Timeout enforcement
 *
 * Falls back gracefully to the existing subprocess model when no container
 * runtime is available.
 */

import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import fsSync from "fs";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFileCb);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SandboxLanguage = "bash" | "sh" | "javascript" | "js" | "python" | "py" | "typescript" | "ts";

export interface SandboxOptions {
  language: SandboxLanguage;
  code: string;
  /** Execution timeout in milliseconds. */
  timeout: number;
  /** Maximum combined stdout+stderr in bytes. */
  maxOutputSize: number;
  /** Optional working directory inside the container (defaults to /tmp/sandbox). */
  workdir?: string;
  /** Optional environment variables passed to the sandbox process. */
  env?: Record<string, string>;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  /** Wall-clock execution time in milliseconds. */
  executionMs: number;
  /** Which sandbox backend was used. */
  sandboxType: "container" | "process";
}

export type SandboxMode = "container" | "process" | "auto";

// ---------------------------------------------------------------------------
// Image mapping
// ---------------------------------------------------------------------------

/** Maps normalized language keys to container images and in-container commands. */
export interface ContainerImageSpec {
  image: string;
  command: string[];
  /** File extension for the temp script file. */
  ext: string;
}

export function getImageSpec(language: SandboxLanguage): ContainerImageSpec {
  const normalized = language.toLowerCase() as SandboxLanguage;
  switch (normalized) {
    case "bash":
    case "sh":
      return { image: "alpine:latest", command: ["sh", "-e"], ext: ".sh" };
    case "javascript":
    case "js":
      return { image: "node:20-alpine", command: ["node"], ext: ".js" };
    case "typescript":
    case "ts":
      // TypeScript runs via npx tsx inside the node image.
      // The container must have npx available (node:20-alpine ships it).
      return { image: "node:20-alpine", command: ["npx", "tsx"], ext: ".ts" };
    case "python":
    case "py":
      return { image: "python:3.12-alpine", command: ["python3"], ext: ".py" };
    default:
      throw new Error("Unsupported container sandbox language: " + language);
  }
}

// ---------------------------------------------------------------------------
// Container runtime detection
// ---------------------------------------------------------------------------

export type ContainerRuntime = "docker" | "podman";

let cachedRuntime: { runtime: ContainerRuntime; binary: string } | null | undefined;

/**
 * Detect whether a container runtime (Docker or Podman) is available and
 * responsive. Returns the runtime name and binary path, or null if neither
 * is available.
 *
 * The result is cached for the lifetime of the process so repeated calls
 * are essentially free.
 */
export async function detectContainerRuntime(): Promise<{ runtime: ContainerRuntime; binary: string } | null> {
  if (cachedRuntime !== undefined) return cachedRuntime;

  for (const candidate of ["docker", "podman"] as const) {
    try {
      await execFileAsync(candidate, ["info", "--format", "{{.ID}}"], {
        timeout: 5000,
        encoding: "utf8",
      });
      cachedRuntime = { runtime: candidate, binary: candidate };
      return cachedRuntime;
    } catch {
      // Not available or not responsive — try next.
    }
  }

  cachedRuntime = null;
  return null;
}

/**
 * Convenience boolean wrapper used by tests and quick-checks.
 */
export async function isContainerRuntimeAvailable(): Promise<boolean> {
  return (await detectContainerRuntime()) !== null;
}

/**
 * Reset the cached runtime detection (useful for tests).
 */
export function resetRuntimeCache(): void {
  cachedRuntime = undefined;
}

// ---------------------------------------------------------------------------
// Security flag builder
// ---------------------------------------------------------------------------

export interface ContainerSecurityFlags {
  network: string;
  readOnly: boolean;
  memoryMb: number;
  cpuLimit: number;
  pidsLimit: number;
  noNewPrivileges: boolean;
  user: string;
}

/**
 * Build the Docker/Podman CLI security flags from options.
 * Exported for testing so that assertions can verify the exact flags without
 * needing a live container runtime.
 */
export function buildSecurityArgs(
  memoryMb: number = 256,
  cpuLimit: number = 1,
): string[] {
  return [
    "--network=none",
    "--read-only",
    "--tmpfs", "/tmp:rw,noexec,size=64m",
    `--memory=${memoryMb}m`,
    `--cpus=${cpuLimit}`,
    "--pids-limit=100",
    "--security-opt=no-new-privileges",
    "--user=1000:1000",
  ];
}

/**
 * Returns a descriptor of the security flags for test assertions
 * without requiring a live runtime.
 */
export function getSecurityFlagDescriptor(
  memoryMb: number = 256,
  cpuLimit: number = 1,
): ContainerSecurityFlags {
  return {
    network: "none",
    readOnly: true,
    memoryMb,
    cpuLimit,
    pidsLimit: 100,
    noNewPrivileges: true,
    user: "1000:1000",
  };
}

// ---------------------------------------------------------------------------
// ContainerSandbox
// ---------------------------------------------------------------------------

export class ContainerSandbox {
  private memoryMb: number;
  private cpuLimit: number;

  constructor(opts?: { memoryMb?: number; cpuLimit?: number }) {
    this.memoryMb = opts?.memoryMb ?? parseInt(process.env.EVOKORE_SANDBOX_MEMORY_MB || "256", 10);
    this.cpuLimit = opts?.cpuLimit ?? parseFloat(process.env.EVOKORE_SANDBOX_CPU_LIMIT || "1");

    if (!Number.isFinite(this.memoryMb) || this.memoryMb < 16) this.memoryMb = 256;
    if (!Number.isFinite(this.cpuLimit) || this.cpuLimit <= 0) this.cpuLimit = 1;
  }

  /**
   * Execute code in a container sandbox.
   *
   * Throws if no container runtime is available (caller should handle
   * fallback or call `isContainerRuntimeAvailable()` first).
   */
  async execute(options: SandboxOptions): Promise<SandboxResult> {
    const runtime = await detectContainerRuntime();
    if (!runtime) {
      throw new Error("No container runtime (Docker/Podman) available");
    }

    return this.executeInContainer(runtime, options);
  }

  private async executeInContainer(
    runtime: { runtime: ContainerRuntime; binary: string },
    options: SandboxOptions,
  ): Promise<SandboxResult> {
    const spec = getImageSpec(options.language);

    // Create a temp directory on the host to hold the script file.
    // This directory will be bind-mounted read-only into the container.
    const hostDir = fsSync.mkdtempSync(path.join(os.tmpdir(), "evokore-csandbox-"));
    const scriptName = `script${spec.ext}`;
    const scriptPath = path.join(hostDir, scriptName);
    fsSync.writeFileSync(scriptPath, options.code, "utf8");

    const containerWorkdir = options.workdir || "/tmp/sandbox";
    const containerScript = `${containerWorkdir}/${scriptName}`;

    // Build docker/podman run command
    const runArgs: string[] = [
      "run",
      "--rm",
      ...buildSecurityArgs(this.memoryMb, this.cpuLimit),
      // Bind-mount the host script directory as read-only
      "-v", `${hostDir}:${containerWorkdir}:ro`,
      "-w", "/tmp",
    ];

    // Ensure standard container PATH is set so executables like node, python3
    // are found even when running as non-root user with --entrypoint override.
    runArgs.push("-e", "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin");

    // Inject environment variables
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        // Skip host PATH — container has its own PATH set above
        if (key === "PATH") continue;
        runArgs.push("-e", `${key}=${value}`);
      }
    }
    runArgs.push("-e", "EVOKORE_SANDBOX=true");

    // Override the default entrypoint to run the command directly.
    // Images like node:20-alpine and python:3.12-alpine have
    // docker-entrypoint.sh which may not be accessible under --user
    // or --read-only constraints.
    runArgs.push("--entrypoint", spec.command[0]);

    // Image and remaining command args (skip command[0] since it's the entrypoint)
    runArgs.push(spec.image, ...spec.command.slice(1), containerScript);

    const start = Date.now();
    try {
      const result = await execFileAsync(runtime.binary, runArgs, {
        encoding: "utf8",
        timeout: options.timeout,
        maxBuffer: options.maxOutputSize,
      });

      return {
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        exitCode: 0,
        timedOut: false,
        executionMs: Date.now() - start,
        sandboxType: "container",
      };
    } catch (err: any) {
      const timedOut = !!err.killed;
      return {
        stdout: truncateOutput(err.stdout || "", options.maxOutputSize),
        stderr: truncateOutput(err.stderr || err.message || "", options.maxOutputSize),
        exitCode: timedOut ? -1 : (err.code ?? err.status ?? 1),
        timedOut,
        executionMs: Date.now() - start,
        sandboxType: "container",
      };
    } finally {
      try {
        fsSync.rmSync(hostDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Process fallback sandbox
// ---------------------------------------------------------------------------

/**
 * ProcessSandbox replicates the existing `executeCodeBlock` subprocess
 * model from SkillManager but implements the SandboxResult interface
 * so callers can use either backend interchangeably.
 */
export class ProcessSandbox {
  async execute(options: SandboxOptions): Promise<SandboxResult> {
    const executors: Record<string, { command: string; args: string[]; ext: string }> = {
      "bash": { command: "bash", args: ["-e"], ext: ".sh" },
      "sh": { command: "sh", args: ["-e"], ext: ".sh" },
      "javascript": { command: "node", args: ["--max-old-space-size=128"], ext: ".js" },
      "js": { command: "node", args: ["--max-old-space-size=128"], ext: ".js" },
      "python": { command: "python3", args: [], ext: ".py" },
      "py": { command: "python3", args: [], ext: ".py" },
      "typescript": { command: "npx", args: ["tsx", "--max-old-space-size=128"], ext: ".ts" },
      "ts": { command: "npx", args: ["tsx", "--max-old-space-size=128"], ext: ".ts" },
    };

    const lang = options.language.toLowerCase();
    const executor = executors[lang];
    if (!executor) {
      throw new Error("Unsupported language for execution: " + options.language);
    }

    const sandboxDir = fsSync.mkdtempSync(path.join(os.tmpdir(), "evokore-sandbox-"));
    const tmpFile = path.join(sandboxDir, `script${executor.ext}`);
    fsSync.writeFileSync(tmpFile, options.code, "utf8");

    const env: Record<string, string> = {};
    if (options.env) {
      Object.assign(env, options.env);
    }
    env.EVOKORE_SANDBOX = "true";
    env.EVOKORE_SANDBOX_DIR = sandboxDir;

    // Carry over PATH and basic OS keys so executors resolve correctly.
    for (const key of ["PATH", "HOME", "USER", "SHELL", "LANG", "TERM", "TMPDIR", "TMP", "TEMP",
      "SYSTEMROOT", "COMSPEC", "WINDIR", "PROGRAMFILES", "APPDATA", "LOCALAPPDATA",
      "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS", "NODE_ENV"]) {
      if (process.env[key]) {
        env[key] = process.env[key]!;
      }
    }

    const start = Date.now();
    try {
      const result = await execFileAsync(executor.command, [...executor.args, tmpFile], {
        encoding: "utf8",
        timeout: options.timeout,
        maxBuffer: options.maxOutputSize,
        env,
        cwd: sandboxDir,
      });

      return {
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        exitCode: 0,
        timedOut: false,
        executionMs: Date.now() - start,
        sandboxType: "process",
      };
    } catch (err: any) {
      const timedOut = !!err.killed;
      return {
        stdout: truncateOutput(err.stdout || "", options.maxOutputSize),
        stderr: truncateOutput(err.stderr || err.message || "", options.maxOutputSize),
        exitCode: timedOut ? -1 : (err.status || 1),
        timedOut,
        executionMs: Date.now() - start,
        sandboxType: "process",
      };
    } finally {
      try {
        fsSync.rmSync(sandboxDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Unified sandbox factory
// ---------------------------------------------------------------------------

/**
 * Resolve the effective sandbox mode from environment or explicit override.
 */
export function resolveSandboxMode(explicit?: SandboxMode): SandboxMode {
  if (explicit) return explicit;
  const envVal = (process.env.EVOKORE_SANDBOX_MODE || "auto").toLowerCase();
  if (envVal === "container" || envVal === "process" || envVal === "auto") {
    return envVal as SandboxMode;
  }
  console.error(`[EVOKORE] Unknown EVOKORE_SANDBOX_MODE '${envVal}', falling back to 'auto'.`);
  return "auto";
}

/**
 * Create a sandbox executor based on the resolved mode.
 *
 * - "container": always use ContainerSandbox (throws if runtime unavailable)
 * - "process": always use ProcessSandbox
 * - "auto": try ContainerSandbox, fall back to ProcessSandbox with a warning
 */
export async function createSandbox(
  mode?: SandboxMode,
  opts?: { memoryMb?: number; cpuLimit?: number },
): Promise<{ sandbox: ContainerSandbox | ProcessSandbox; mode: SandboxMode }> {
  const resolved = resolveSandboxMode(mode);

  if (resolved === "process") {
    return { sandbox: new ProcessSandbox(), mode: "process" };
  }

  const runtimeAvailable = await isContainerRuntimeAvailable();

  if (resolved === "container") {
    if (!runtimeAvailable) {
      throw new Error(
        "EVOKORE_SANDBOX_MODE=container but no container runtime (Docker/Podman) is available."
      );
    }
    return { sandbox: new ContainerSandbox(opts), mode: "container" };
  }

  // auto mode
  if (runtimeAvailable) {
    return { sandbox: new ContainerSandbox(opts), mode: "container" };
  }

  console.error(
    "[EVOKORE] No container runtime detected. Falling back to process-based sandbox. " +
    "Install Docker or Podman for stronger isolation."
  );
  return { sandbox: new ProcessSandbox(), mode: "process" };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateOutput(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  // Truncate by converting to buffer, slicing, and converting back.
  // This is a rough truncation that may break multi-byte characters at the
  // boundary, but for log output that is acceptable.
  const buf = Buffer.from(text, "utf8").subarray(0, maxBytes);
  return buf.toString("utf8") + "\n[output truncated]";
}
