/**
 * successRerank — Pure function reranker for skill routing candidates.
 *
 * Uses observed historical success rates (from `TelemetryIndex`) to reorder
 * candidates returned from the Fuse-based search in `resolveWorkflow()`.
 *
 * Blending rule:
 *   finalScore   = 0.7 * originalRankScore + 0.3 * successScore
 *   originalRank = (n - i) / n for the i-th candidate (0-based)
 *   successScore = Laplace-smoothed rate: (successes + 1) / (count + 2)
 *                  where successes = rate * count (from TelemetryIndex)
 *
 * Cold-start guard: when fewer than 50 entries have been recorded, the
 * reranker is an identity (returns `candidates` untouched). This prevents
 * noisy early data from destabilising routing.
 */

export interface SkillLike {
  name: string;
  path?: string;
  [key: string]: unknown;
}

export interface SkillSuccessData {
  rate: number;
  count: number;
}

const COLD_START_THRESHOLD = 50;
const ORIGINAL_WEIGHT = 0.7;
const SUCCESS_WEIGHT = 0.3;

function laplaceScore(data: SkillSuccessData | undefined): number {
  if (!data || data.count <= 0) {
    // Neutral prior for unseen skills: (0 + 1) / (0 + 2) = 0.5
    return 0.5;
  }
  const successes = Math.round(data.rate * data.count);
  return (successes + 1) / (data.count + 2);
}

/**
 * Rerank skill candidates using historical success rates.
 *
 * @param candidates Ordered candidate list (best first per the prior ranker).
 * @param telemetry Map keyed by skill name -> observed success stats.
 * @param totalRows Total rows observed by the telemetry sink. Below
 *                  {@link COLD_START_THRESHOLD} the function is an identity.
 * @returns A new array (same type) sorted by blended score, descending.
 */
export function rerank<T extends SkillLike>(
  candidates: T[],
  telemetry: Map<string, SkillSuccessData>,
  totalRows: number,
): T[] {
  if (!candidates || candidates.length === 0) return candidates ?? [];
  if (candidates.length === 1) return candidates.slice();
  if (totalRows < COLD_START_THRESHOLD) return candidates.slice();

  const n = candidates.length;
  const scored = candidates.map((cand, i) => {
    const originalRank = (n - i) / n; // 1.0 for i=0, ... 1/n for last
    const success = laplaceScore(telemetry.get(cand.name));
    const finalScore = ORIGINAL_WEIGHT * originalRank + SUCCESS_WEIGHT * success;
    return { cand, finalScore, originalIndex: i };
  });

  scored.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    // Stable tiebreak: preserve original order on ties.
    return a.originalIndex - b.originalIndex;
  });

  return scored.map((s) => s.cand);
}
