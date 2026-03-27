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

export type CanonicalSandboxLanguage = "bash" | "javascript" | "typescript" | "python";

export interface ContainerResourceProfile {
  language: CanonicalSandboxLanguage;
  memoryMb: number;
  cpuLimit: number;
}

export interface ContainerSandboxWarmupResult {
  mode: SandboxMode;
  runtime: ContainerRuntime | null;
  attempted: boolean;
  candidateImages: string[];
  warmedImages: string[];
  failures: string[];
  skippedReason?: string;
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

export function normalizeSandboxLanguage(language: SandboxLanguage): CanonicalSandboxLanguage {
  const normalized = language.toLowerCase() as SandboxLanguage;
  switch (normalized) {
    case "bash":
    case "sh":
      return "bash";
    case "javascript":
    case "js":
      return "javascript";
    case "typescript":
    case "ts":
      return "typescript";
    case "python":
    case "py":
      return "python";
    default:
      throw new Error("Unsupported container sandbox language: " + language);
  }
}

export function getSandboxImageNames(): string[] {
  return Array.from(new Set([
    getImageSpec("bash").image,
    getImageSpec("javascript").image,
    getImageSpec("typescript").image,
    getImageSpec("python").image,
  ]));
}

export function resolveSeccompProfilePath(explicit?: string): string | null {
  const rawValue = explicit ?? process.env.EVOKORE_SANDBOX_SECCOMP_PROFILE;
  const trimmedValue = rawValue?.trim();

  if (!trimmedValue) {
    return null;
  }

  const resolvedPath = path.isAbsolute(trimmedValue)
    ? trimmedValue
    : path.resolve(process.cwd(), trimmedValue);

  if (!fsSync.existsSync(resolvedPath)) {
    throw new Error(`EVOKORE_SANDBOX_SECCOMP_PROFILE does not exist: ${resolvedPath}`);
  }

  if (!fsSync.statSync(resolvedPath).isFile()) {
    throw new Error(`EVOKORE_SANDBOX_SECCOMP_PROFILE must point to a file: ${resolvedPath}`);
  }

  return resolvedPath;
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
  seccompProfile: string | null;
  user: string;
}

function parseMemoryLimit(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed >= 16 ? parsed : fallback;
}

function parseCpuLimit(value: string | undefined, fallback: number): number {
  const parsed = parseFloat(value || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getLanguageResourceEnvKeys(language: CanonicalSandboxLanguage): { memory: string; cpu: string } {
  const prefix = `EVOKORE_SANDBOX_${language.toUpperCase()}`;
  return {
    memory: `${prefix}_MEMORY_MB`,
    cpu: `${prefix}_CPU_LIMIT`,
  };
}

export function resolveContainerResourceProfile(
  language: SandboxLanguage,
  opts?: { defaultMemoryMb?: number; defaultCpuLimit?: number },
): ContainerResourceProfile {
  const normalizedLanguage = normalizeSandboxLanguage(language);
  const defaultMemoryMb = parseMemoryLimit(
    opts?.defaultMemoryMb !== undefined ? String(opts.defaultMemoryMb) : process.env.EVOKORE_SANDBOX_MEMORY_MB,
    256,
  );
  const defaultCpuLimit = parseCpuLimit(
    opts?.defaultCpuLimit !== undefined ? String(opts.defaultCpuLimit) : process.env.EVOKORE_SANDBOX_CPU_LIMIT,
    1,
  );
  const envKeys = getLanguageResourceEnvKeys(normalizedLanguage);

  return {
    language: normalizedLanguage,
    memoryMb: parseMemoryLimit(process.env[envKeys.memory], defaultMemoryMb),
    cpuLimit: parseCpuLimit(process.env[envKeys.cpu], defaultCpuLimit),
  };
}

/**
 * Build the Docker/Podman CLI security flags from options.
 * Exported for testing so that assertions can verify the exact flags without
 * needing a live container runtime.
 */
export function buildSecurityArgs(
  memoryMb: number = 256,
  cpuLimit: number = 1,
  seccompProfilePath: string | null = null,
): string[] {
  const args = [
    "--network=none",
    "--read-only",
    "--tmpfs", "/tmp:rw,noexec,size=64m",
    `--memory=${memoryMb}m`,
    `--cpus=${cpuLimit}`,
    "--pids-limit=100",
    "--security-opt=no-new-privileges",
  ];

  if (seccompProfilePath) {
    args.push(`--security-opt=seccomp=${seccompProfilePath}`);
  }

  args.push("--user=1000:1000");
  return args;
}

/**
 * Returns a descriptor of the security flags for test assertions
 * without requiring a live runtime.
 */
export function getSecurityFlagDescriptor(
  memoryMb: number = 256,
  cpuLimit: number = 1,
  seccompProfilePath: string | null = null,
): ContainerSecurityFlags {
  return {
    network: "none",
    readOnly: true,
    memoryMb,
    cpuLimit,
    pidsLimit: 100,
    noNewPrivileges: true,
    seccompProfile: seccompProfilePath,
    user: "1000:1000",
  };
}

// ---------------------------------------------------------------------------
// ContainerSandbox
// ---------------------------------------------------------------------------

export class ContainerSandbox {
  private defaultMemoryMb: number;
  private defaultCpuLimit: number;
  private seccompProfilePath: string | null;

  constructor(opts?: { memoryMb?: number; cpuLimit?: number; seccompProfilePath?: string | null }) {
    this.defaultMemoryMb = parseMemoryLimit(
      opts?.memoryMb !== undefined ? String(opts.memoryMb) : process.env.EVOKORE_SANDBOX_MEMORY_MB,
      256,
    );
    this.defaultCpuLimit = parseCpuLimit(
      opts?.cpuLimit !== undefined ? String(opts.cpuLimit) : process.env.EVOKORE_SANDBOX_CPU_LIMIT,
      1,
    );
    this.seccompProfilePath = opts?.seccompProfilePath ?? resolveSeccompProfilePath();
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
    const resourceProfile = resolveContainerResourceProfile(options.language, {
      defaultMemoryMb: this.defaultMemoryMb,
      defaultCpuLimit: this.defaultCpuLimit,
    });

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
      ...buildSecurityArgs(resourceProfile.memoryMb, resourceProfile.cpuLimit, this.seccompProfilePath),
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
  opts?: { memoryMb?: number; cpuLimit?: number; seccompProfilePath?: string | null },
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

async function isContainerImagePresent(
  runtime: { runtime: ContainerRuntime; binary: string },
  image: string,
): Promise<boolean> {
  try {
    await execFileAsync(runtime.binary, ["image", "inspect", image], {
      timeout: 10000,
      encoding: "utf8",
    });
    return true;
  } catch {
    return false;
  }
}

export async function warmContainerSandboxImages(
  mode?: SandboxMode,
): Promise<ContainerSandboxWarmupResult> {
  const resolvedMode = resolveSandboxMode(mode);
  const candidateImages = getSandboxImageNames();

  if (resolvedMode === "process") {
    return {
      mode: resolvedMode,
      runtime: null,
      attempted: false,
      candidateImages,
      warmedImages: [],
      failures: [],
      skippedReason: "sandbox mode is set to process",
    };
  }

  const runtime = await detectContainerRuntime();
  if (!runtime) {
    return {
      mode: resolvedMode,
      runtime: null,
      attempted: false,
      candidateImages,
      warmedImages: [],
      failures: [],
      skippedReason: "no container runtime detected",
    };
  }

  const warmedImages: string[] = [];
  const failures: string[] = [];

  for (const image of candidateImages) {
    if (await isContainerImagePresent(runtime, image)) {
      warmedImages.push(image);
      continue;
    }

    try {
      await execFileAsync(runtime.binary, ["pull", image], {
        timeout: 300000,
        encoding: "utf8",
      });
      warmedImages.push(image);
    } catch (error: any) {
      failures.push(`${image}: ${error?.stderr || error?.message || "pull failed"}`);
    }
  }

  return {
    mode: resolvedMode,
    runtime: runtime.runtime,
    attempted: true,
    candidateImages,
    warmedImages,
    failures,
  };
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
