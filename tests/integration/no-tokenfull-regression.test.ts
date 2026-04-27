import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.resolve(ROOT, 'src');

/*
 * Audit-2026-04-24 issue #282 item #2: the original HITL approval
 * payload broadcast the raw bearer token as `tokenFull`. Commit
 * c5534c9 (Phase 5A security) removed it. This is the regression
 * gate: if someone ever writes `tokenFull` back into src/ in any
 * form (property, string, comment), CI fails before the commit
 * reaches main.
 */

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|js|tsx|jsx|mjs|cjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('Security regression: tokenFull must not reappear in src/ (audit #282 item 2)', () => {
  it('does not reference the word "tokenFull" anywhere under src/', () => {
    const offenders: Array<{ file: string; lineNumber: number; line: string }> = [];
    for (const file of walk(SRC)) {
      const rel = path.relative(ROOT, file);
      const text = fs.readFileSync(file, 'utf8');
      if (!text.includes('tokenFull')) continue;
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('tokenFull')) {
          offenders.push({ file: rel, lineNumber: i + 1, line: lines[i].trim() });
        }
      }
    }

    if (offenders.length > 0) {
      const detail = offenders
        .map(o => `  ${o.file}:${o.lineNumber}  ${o.line}`)
        .join('\n');
      throw new Error(
        'tokenFull reappeared in src/:\n' + detail + '\n\n' +
        'This leaks the raw bearer token over HITL broadcast. If the ' +
        'intent was a redacted preview, use `tokenPreview` (last 4 chars only). ' +
        'See commit c5534c9 (Phase 5A security) for the removal.'
      );
    }
    expect(offenders).toEqual([]);
  });
});
