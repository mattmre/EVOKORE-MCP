# Damage Control False Positive Audit (2026-03-15)

## Summary

Audit of damage-control regex patterns that had false positive risks when matching
non-command contexts such as echo statements, grep searches, and documentation lookups.

## False Positive Risks Identified

Four rules were identified as having false positive risks:

| Rule | Original Pattern | Risk | Severity |
|------|-----------------|------|----------|
| DC-21 | `\bsudo\b` | Triggers on `echo "use sudo"`, `grep sudo`, etc. | High (frequent) |
| DC-10 | `curl\s+.*\|\s*(bash\|sh\|zsh)` | Triggers on `echo "curl ... \| bash"` | Low (requires specific structure) |
| DC-11 | `chmod\s+777` | Triggers on `echo "never chmod 777 files"` | Medium |
| DC-12 | `mkfs\|format\s+[A-Z]:` | Triggers on `echo "mkfs"`, `man mkfs` | Medium |

## Mitigations Applied

### Layer 1: Command-Position Regex Tightening

Three rules were updated to require command-position matching using the prefix
`(?:^|[;&|]\s*)`. This ensures the dangerous command must appear at one of:
- Start of the command string (`^`)
- After a semicolon (`;`)
- After an ampersand (`&`, covering both `&` and `&&`)
- After a pipe (`|`, covering both `|` and `||`)

DC-10 was left unchanged because its pattern already requires the specific
`curl...pipe...bash` structure, making false positives inherently low-risk.

| Rule | Old Pattern | New Pattern |
|------|------------|-------------|
| DC-11 | `chmod\s+777` | `(?:^\|[;&\|]\s*)chmod\s+777` |
| DC-12 | `mkfs\|format\s+[A-Z]:` | `(?:^\|[;&\|]\s*)(?:mkfs\b\|format\s+[A-Z]:)` |
| DC-21 | `\bsudo\b` | `(?:^\|[;&\|]\s*)sudo\b` |

### False Positives Now Resolved

The following commands no longer trigger false positives:

- `echo "use sudo to install"` -- DC-21 no longer matches
- `grep -r "sudo" scripts/` -- DC-21 no longer matches
- `echo "never chmod 777 files"` -- DC-11 no longer matches
- `echo "don't run mkfs"` -- DC-12 no longer matches
- `man mkfs` -- DC-12 no longer matches

### True Positives Preserved

The following dangerous commands are still correctly caught:

- `sudo rm -rf /` -- DC-21 still matches (start of command)
- `chmod 777 /tmp/file` -- DC-11 still matches (start of command)
- `mkfs.ext4 /dev/sda` -- DC-12 still matches (start of command)
- `echo hello && sudo rm -rf /` -- DC-21 still matches (command position after `&&`)
- `echo done ; chmod 777 file` -- DC-11 still matches (command position after `;`)
- `echo done && mkfs /dev/sda` -- DC-12 still matches (command position after `&&`)

### Defense in Depth

Even with these regex changes, additional rules provide overlapping coverage:

- DC-19 catches semicolon-chained destructive commands (`; rm`, `; mkfs`, `; format`, `; dd`)
- DC-01/DC-02 catch recursive forced deletion regardless of sudo prefix
- DC-14 uses similar command-position matching as a proven pattern

## Security Trade-off Analysis

The command-position prefix `(?:^|[;&|]\s*)` is a conservative approach that
only skips matching when the dangerous keyword appears mid-command without a
command separator. This means constructs like `echo x; sudo rm -rf /` are still
caught (`;` is in the character class). The risk of bypass is minimal because:

1. Shell chaining operators (`; && || |`) are all covered
2. Subshell `$()` and backtick execution are not common in Bash tool input
3. The character class `[;&|]` catches both `&&` (second `&`) and `||` (second `|`)

## Test Coverage

New tests added in `tests/integration/damage-control-regex.test.ts`:
- 5 false-positive-should-NOT-match tests (echo, grep, man contexts)
- 6 true-positive-MUST-still-match tests (chained commands with `&&`, `;`, `|`)
