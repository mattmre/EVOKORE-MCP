// @AI:NAV[SEC:imports] imports
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
// @AI:NAV[END:imports]

// @AI:NAV[SEC:types] types
export type TrustTier = 'Trusted' | 'Standard' | 'Probation' | 'Untrusted';

export type TrustEvent = 'success' | 'failure' | 'gate_violation';

export interface AgentTrustEntry {
  agentId: string;
  score: number;         // 0.0–1.0, initial 0.5
  tier: TrustTier;
  lastUpdated: string;   // ISO timestamp
  events: number;        // total event count
}

export interface TrustLedgerState {
  sessionId: string;
  agents: Record<string, AgentTrustEntry>;
  updatedAt: string;
}

export interface TrustReport {
  agents: AgentTrustEntry[];
  summary: {
    trusted: number;
    standard: number;
    probation: number;
    untrusted: number;
  };
}
// @AI:NAV[END:types]

// @AI:NAV[SEC:constants] constants
const INITIAL_SCORE = 0.5;
const SCORE_DELTAS: Record<TrustEvent, number> = {
  success: 0.01,
  failure: -0.05,
  gate_violation: -0.10,
};
const IDLE_DECAY_PER_HOUR = -0.005;
const TIER_MULTIPLIERS: Record<TrustTier, number> = {
  Trusted: 2,
  Standard: 1,
  Probation: 0.5,
  Untrusted: 0.1,
};
// @AI:NAV[END:constants]

/**
 * TrustLedger — per-agent trust scoring with tiered throughput multipliers,
 * idle decay, and persistence under `~/.evokore/sessions/{sessionId}-trust.json`.
 *
 * Scores are clamped to [0.0, 1.0]. Tier thresholds:
 *   Trusted  ≥ 0.8
 *   Standard ≥ 0.5
 *   Probation ≥ 0.3
 *   Untrusted < 0.3
 *
 * Persistence writes fail silently (infra pattern). Reads fall back to a fresh
 * state on any parse/IO error.
 */
// @AI:NAV[SEC:class-trustledger] class TrustLedger
export class TrustLedger {
  private readonly sessionId: string;
  private readonly filePath: string;
  private state: TrustLedgerState;

  constructor(sessionId: string, baseDir?: string) {
    this.sessionId = sessionId;
    const dir = baseDir ?? path.join(os.homedir(), '.evokore', 'sessions');
    this.filePath = path.join(dir, `${sessionId}-trust.json`);
    this.state = this.load(dir);
  }

  // @AI:NAV[SEC:load] load
  private load(dir: string): TrustLedgerState {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.agents) {
          return {
            sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : this.sessionId,
            agents: parsed.agents,
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
          };
        }
      }
    } catch {
      // Fall through to fresh state.
    }
    // Ensure the persistence directory exists so later writes succeed.
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // Fail silently — persistence is best-effort.
    }
    return {
      sessionId: this.sessionId,
      agents: {},
      updatedAt: new Date().toISOString(),
    };
  }
  // @AI:NAV[END:load]

  // @AI:NAV[SEC:record] record
  record(agentId: string, event: TrustEvent): AgentTrustEntry {
    const entry = this.getOrCreate(agentId);
    this.applyIdleDecay(entry);
    const delta = SCORE_DELTAS[event] ?? 0;
    entry.score = this.clamp(entry.score + delta);
    entry.tier = this.computeTier(entry.score);
    entry.lastUpdated = new Date().toISOString();
    entry.events += 1;
    this.state.agents[agentId] = entry;
    this.state.updatedAt = entry.lastUpdated;
    this.persist();
    return entry;
  }
  // @AI:NAV[END:record]

  // @AI:NAV[SEC:accessors] accessors
  getEntry(agentId: string): AgentTrustEntry | undefined {
    const entry = this.state.agents[agentId];
    return entry ? { ...entry } : undefined;
  }

  getMultiplier(agentId: string): number {
    const entry = this.state.agents[agentId];
    const tier = entry ? entry.tier : 'Standard';
    return TIER_MULTIPLIERS[tier];
  }

  getAll(): AgentTrustEntry[] {
    return Object.values(this.state.agents).map((e) => ({ ...e }));
  }

  requiresApproval(agentId: string): boolean {
    const entry = this.state.agents[agentId];
    if (!entry) return false;
    return entry.tier === 'Untrusted';
  }

  getTrustReport(): TrustReport {
    const agents = this.getAll();
    const summary = { trusted: 0, standard: 0, probation: 0, untrusted: 0 };
    for (const a of agents) {
      if (a.tier === 'Trusted') summary.trusted += 1;
      else if (a.tier === 'Standard') summary.standard += 1;
      else if (a.tier === 'Probation') summary.probation += 1;
      else summary.untrusted += 1;
    }
    return { agents, summary };
  }
  // @AI:NAV[END:accessors]

  // @AI:NAV[SEC:internals] internals
  private getOrCreate(agentId: string): AgentTrustEntry {
    const existing = this.state.agents[agentId];
    if (existing) return { ...existing };
    const now = new Date().toISOString();
    return {
      agentId,
      score: INITIAL_SCORE,
      tier: this.computeTier(INITIAL_SCORE),
      lastUpdated: now,
      events: 0,
    };
  }

  private computeTier(score: number): TrustTier {
    if (score >= 0.8) return 'Trusted';
    if (score >= 0.5) return 'Standard';
    if (score >= 0.3) return 'Probation';
    return 'Untrusted';
  }

  private applyIdleDecay(entry: AgentTrustEntry): void {
    const last = Date.parse(entry.lastUpdated);
    if (!Number.isFinite(last)) return;
    const hours = (Date.now() - last) / (1000 * 60 * 60);
    if (hours <= 0) return;
    entry.score = this.clamp(entry.score + IDLE_DECAY_PER_HOUR * hours);
    entry.tier = this.computeTier(entry.score);
  }

  private clamp(score: number): number {
    if (!Number.isFinite(score)) return 0;
    if (score < 0) return 0;
    if (score > 1) return 1;
    return score;
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch {
      // Fail silently — persistence is best-effort.
    }
  }
  // @AI:NAV[END:internals]
}
// @AI:NAV[END:class-trustledger]
