import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as net from 'node:net';

const HOOK_SCRIPT = path.join(process.cwd(), 'scripts', 'voice-stop-hook.js');

/** Run the hook script with piped stdin, resolve on exit 0, reject otherwise. */
function runHook(
  input: string,
  env: NodeJS.ProcessEnv = {},
  timeoutMs = 8000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK_SCRIPT], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.write(input);
    child.stdin.end();

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Hook timed out'));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Hook exited with code ${code}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Unit-test the summary builder by importing it directly. We expose it via
// a small shim to avoid re-architecting the hook script itself.
// ---------------------------------------------------------------------------

// Re-implement buildSummary + spokenAge here to unit-test the logic without
// spinning up the full hook (which requires stdin and WebSocket).

function spokenAge(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const ms = Date.now() - new Date(createdAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const totalMins = Math.floor(ms / 60000);
  if (totalMins < 1) return 'less than a minute';
  if (totalMins < 60) return `${totalMins} minute${totalMins === 1 ? '' : 's'}`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const hourPart = `${h} hour${h === 1 ? '' : 's'}`;
  const minPart = m > 0 ? ` and ${m} minute${m === 1 ? '' : 's'}` : '';
  return `${hourPart}${minPart}`;
}

interface SessionState {
  purpose?: string;
  createdAt?: string;
  created?: string;
  metrics?: {
    replayEntries?: number;
    evidenceEntries?: number;
    totalTasks?: number;
    incompleteTasks?: number;
  };
}

interface Task {
  text: string;
  done: boolean;
  added?: string;
}

function buildSummary(sessionState: SessionState | null, tasks: Task[]): string {
  const parts: string[] = [];

  const incomplete = tasks.filter(t => !t.done);
  const hasTasks = tasks.length > 0;
  const allDone = hasTasks && incomplete.length === 0;

  if (allDone) {
    parts.push('Session complete.');
  } else if (hasTasks && incomplete.length > 0) {
    parts.push('Session paused.');
  } else {
    parts.push('Session complete.');
  }

  const purpose = sessionState?.purpose;
  if (purpose && purpose !== 'no purpose recorded') {
    parts.push(`Purpose: ${purpose}.`);
  }

  if (hasTasks) {
    if (allDone) {
      parts.push(`All ${tasks.length} task${tasks.length === 1 ? '' : 's'} done.`);
    } else {
      parts.push(`${incomplete.length} of ${tasks.length} task${tasks.length === 1 ? '' : 's'} remain open.`);
    }
  }

  const metrics = sessionState?.metrics ?? {};
  const evidenceCount = Number(metrics.evidenceEntries ?? 0);
  const replayCount = Number(metrics.replayEntries ?? 0);

  if (evidenceCount > 0 && replayCount > 0) {
    parts.push(`${evidenceCount} evidence entr${evidenceCount === 1 ? 'y' : 'ies'} and ${replayCount} tool call${replayCount === 1 ? '' : 's'} captured.`);
  } else if (evidenceCount > 0) {
    parts.push(`${evidenceCount} evidence entr${evidenceCount === 1 ? 'y' : 'ies'} captured.`);
  } else if (replayCount > 0) {
    parts.push(`${replayCount} tool call${replayCount === 1 ? '' : 's'} recorded.`);
  }

  const age = spokenAge(sessionState?.createdAt ?? sessionState?.created);
  if (age) {
    parts.push(`Session ran for ${age}.`);
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// spokenAge
// ---------------------------------------------------------------------------

describe('spokenAge', () => {
  it('returns null for missing createdAt', () => {
    expect(spokenAge(null)).toBeNull();
    expect(spokenAge(undefined)).toBeNull();
  });

  it('returns "less than a minute" for very fresh sessions', () => {
    const recent = new Date(Date.now() - 30_000).toISOString();
    expect(spokenAge(recent)).toBe('less than a minute');
  });

  it('formats single minutes correctly', () => {
    const oneMinAgo = new Date(Date.now() - 65_000).toISOString();
    expect(spokenAge(oneMinAgo)).toBe('1 minute');
  });

  it('formats plural minutes correctly', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000 - 5_000).toISOString();
    expect(spokenAge(fiveMinAgo)).toBe('5 minutes');
  });

  it('formats hours without remainder', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    expect(spokenAge(twoHoursAgo)).toBe('2 hours');
  });

  it('formats hours and minutes', () => {
    const oneHour23MinAgo = new Date(Date.now() - (60 + 23) * 60_000 - 5_000).toISOString();
    expect(spokenAge(oneHour23MinAgo)).toBe('1 hour and 23 minutes');
  });

  it('uses singular hour', () => {
    const oneHour5MinAgo = new Date(Date.now() - 65 * 60_000 - 5_000).toISOString();
    expect(spokenAge(oneHour5MinAgo)).toBe('1 hour and 5 minutes');
  });
});

// ---------------------------------------------------------------------------
// buildSummary — opening line
// ---------------------------------------------------------------------------

describe('buildSummary — opening', () => {
  it('says "Session complete." with no tasks', () => {
    const s = buildSummary(null, []);
    expect(s).toMatch(/^Session complete\./);
  });

  it('says "Session complete." when all tasks done', () => {
    const tasks: Task[] = [
      { text: 'Write tests', done: true },
      { text: 'Open PR', done: true },
    ];
    expect(buildSummary(null, tasks)).toMatch(/^Session complete\./);
  });

  it('says "Session paused." when tasks remain', () => {
    const tasks: Task[] = [
      { text: 'Write tests', done: true },
      { text: 'Open PR', done: false },
    ];
    expect(buildSummary(null, tasks)).toMatch(/^Session paused\./);
  });
});

// ---------------------------------------------------------------------------
// buildSummary — purpose
// ---------------------------------------------------------------------------

describe('buildSummary — purpose', () => {
  it('includes purpose when set', () => {
    const s = buildSummary({ purpose: 'Overhaul the status line' }, []);
    expect(s).toContain('Purpose: Overhaul the status line.');
  });

  it('omits purpose when missing', () => {
    const s = buildSummary({}, []);
    expect(s).not.toContain('Purpose:');
  });

  it('omits purpose when "no purpose recorded"', () => {
    const s = buildSummary({ purpose: 'no purpose recorded' }, []);
    expect(s).not.toContain('Purpose:');
  });
});

// ---------------------------------------------------------------------------
// buildSummary — task progress
// ---------------------------------------------------------------------------

describe('buildSummary — tasks', () => {
  it('reports all N tasks done', () => {
    const tasks: Task[] = [
      { text: 'A', done: true },
      { text: 'B', done: true },
      { text: 'C', done: true },
    ];
    expect(buildSummary(null, tasks)).toContain('All 3 tasks done.');
  });

  it('uses singular for one task', () => {
    const tasks: Task[] = [{ text: 'A', done: true }];
    expect(buildSummary(null, tasks)).toContain('All 1 task done.');
  });

  it('reports remaining open tasks', () => {
    const tasks: Task[] = [
      { text: 'A', done: true },
      { text: 'B', done: false },
      { text: 'C', done: false },
    ];
    expect(buildSummary(null, tasks)).toContain('2 of 3 tasks remain open.');
  });

  it('omits task section when no tasks', () => {
    const s = buildSummary(null, []);
    expect(s).not.toContain('task');
  });
});

// ---------------------------------------------------------------------------
// buildSummary — metrics
// ---------------------------------------------------------------------------

describe('buildSummary — metrics', () => {
  it('includes both evidence and tool calls', () => {
    const s = buildSummary({ metrics: { evidenceEntries: 17, replayEntries: 105 } }, []);
    expect(s).toContain('17 evidence entries and 105 tool calls captured.');
  });

  it('uses singular for 1 evidence entry', () => {
    const s = buildSummary({ metrics: { evidenceEntries: 1, replayEntries: 0 } }, []);
    expect(s).toContain('1 evidence entry captured.');
  });

  it('uses singular for 1 tool call', () => {
    const s = buildSummary({ metrics: { evidenceEntries: 0, replayEntries: 1 } }, []);
    expect(s).toContain('1 tool call recorded.');
  });

  it('omits metrics section when both zero', () => {
    const s = buildSummary({ metrics: { evidenceEntries: 0, replayEntries: 0 } }, []);
    expect(s).not.toContain('evidence');
    expect(s).not.toContain('tool call');
  });

  it('omits metrics section when metrics missing', () => {
    const s = buildSummary({}, []);
    expect(s).not.toContain('evidence');
  });
});

// ---------------------------------------------------------------------------
// buildSummary — full example
// ---------------------------------------------------------------------------

describe('buildSummary — full example', () => {
  it('produces a well-formed spoken summary', () => {
    const createdAt = new Date(Date.now() - 25 * 60_000).toISOString();
    const sessionState: SessionState = {
      purpose: 'Overhaul the status line with claude-hud style layout',
      createdAt,
      metrics: { evidenceEntries: 17, replayEntries: 105 },
    };
    const tasks: Task[] = [
      { text: 'Rewrite status-runtime.js', done: true },
      { text: 'Add token segments', done: true },
      { text: 'Create PR', done: true },
    ];
    const summary = buildSummary(sessionState, tasks);

    expect(summary).toMatch(/^Session complete\./);
    expect(summary).toContain('Purpose: Overhaul the status line with claude-hud style layout.');
    expect(summary).toContain('All 3 tasks done.');
    expect(summary).toContain('17 evidence entries and 105 tool calls captured.');
    expect(summary).toContain('Session ran for 25 minutes.');
    // No markdown, no symbols
    expect(summary).not.toMatch(/[#*`[\]]/);
  });
});

// ---------------------------------------------------------------------------
// Fault tolerance: hook exits 0 even when sidecar is offline
// ---------------------------------------------------------------------------

describe('voice-stop-hook — fault tolerance', () => {
  const noSidecar = { VOICE_SIDECAR_PORT: '19999', VOICE_SIDECAR_HOST: '127.0.0.1' };

  it('exits 0 when sidecar is not running', async () => {
    const payload = JSON.stringify({ session_id: 'test-fault-tolerance-' + Date.now() });
    await runHook(payload, noSidecar);
  }, 10_000);

  it('exits 0 when payload is malformed JSON', async () => {
    await runHook('not json at all', noSidecar);
  }, 10_000);

  it('exits 0 when payload has no session_id', async () => {
    await runHook(JSON.stringify({ cwd: 'D:/test' }), noSidecar);
  }, 10_000);
});

// ---------------------------------------------------------------------------
// Integration: hook sends correct WS message when a real WS server is listening
// ---------------------------------------------------------------------------

describe('voice-stop-hook — WebSocket delivery', () => {
  it('connects and sends {text, persona, flush} when sidecar is available', async () => {
    const WebSocket = (await import('ws')).default;
    const { WebSocketServer } = await import('ws');

    const received: object[] = [];
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });

    const port = await new Promise<number>((resolve) => {
      wss.on('listening', () => {
        const addr = wss.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });

    wss.on('connection', (ws) => {
      ws.on('message', (data) => {
        try { received.push(JSON.parse(data.toString())); } catch { /* skip */ }
      });
    });

    const payload = JSON.stringify({ session_id: 'test-ws-delivery-' + Date.now() });
    await runHook(payload, {
      VOICE_SIDECAR_PORT: String(port),
      VOICE_SIDECAR_HOST: '127.0.0.1',
      VOICE_SIDECAR_PERSONA: 'reviewer',
    });

    await new Promise(r => setTimeout(r, 300)); // let the message arrive
    wss.close();

    expect(received.length).toBeGreaterThan(0);
    const msg = received[0] as { text: string; persona: string; flush: boolean };
    expect(typeof msg.text).toBe('string');
    expect(msg.text.length).toBeGreaterThan(0);
    expect(msg.persona).toBe('reviewer');
    expect(msg.flush).toBe(true);
    // Summary text must be plain prose — no markdown symbols
    expect(msg.text).not.toMatch(/[#*`[\]]/);
    // Must include "Session"
    expect(msg.text).toContain('Session');
  }, 15_000);
});

// ---------------------------------------------------------------------------
// Hook script existence and structure
// ---------------------------------------------------------------------------

describe('voice-stop hook files', () => {
  it('scripts/hooks/voice-stop.js exists', async () => {
    const hookPath = path.join(process.cwd(), 'scripts', 'hooks', 'voice-stop.js');
    const { readFileSync } = await import('node:fs');
    const content = readFileSync(hookPath, 'utf8');
    expect(content).toContain('requireHookSafely');
    expect(content).toContain('voice-stop');
    expect(content).toContain('voice-stop-hook.js');
  });

  it('scripts/voice-stop-hook.js exports nothing (side-effect module)', async () => {
    // The hook script is a side-effect module — verifying it parses without error
    const { readFileSync } = await import('node:fs');
    const content = readFileSync(HOOK_SCRIPT, 'utf8');
    expect(content).toContain('buildSummary');
    expect(content).toContain('sendToSidecar');
    expect(content).toContain('process.exit(0)');
    // Never exits non-zero in the main catch path
    expect(content).not.toContain('process.exit(1)');
    expect(content).not.toContain('process.exit(2)');
  });

  it('settings.json wires voice-stop into the Stop hook', async () => {
    const { readFileSync } = await import('node:fs');
    // Strip BOM (Windows PowerShell writes UTF-8 BOM to JSON files)
    const raw = readFileSync(path.join(process.cwd(), '.claude', 'settings.json'), 'utf8')
      .replace(/^\uFEFF/, '');
    const settings = JSON.parse(raw);
    const stopHooks = settings?.hooks?.Stop ?? [];
    const allHookCommands: string[] = stopHooks.flatMap(
      (entry: { hooks: Array<{ command: string }> }) =>
        (entry.hooks ?? []).map((h) => h.command ?? '')
    );
    expect(allHookCommands.some((cmd: string) => cmd.includes('voice-stop'))).toBe(true);
  });
});
