#!/usr/bin/env python3
"""
Quick validation script for skills.

Validates SKILL.md frontmatter and body against EVOKORE-MCP authoring contract.

Usage:
    quick_validate.py <skill_directory> [--strict] [--against-allowlist <file>]

Exit codes:
    0 - skill passes all required checks (allowlisted failures may be present)
    1 - skill failed one or more required checks

Required (failure-class) checks emitted in ALL modes:
    - description must start with "Use when " (case-insensitive) OR contain "when to use"
    - description must be >= 60 chars AND contain at least one verb
    - skill body must contain an H2 "## When to use this skill" within
      the first 30 lines AFTER the closing frontmatter `---`

The three trigger-explicit checks above catch a class of error that corrupts
resolve_workflow semantic ranking. They are FAILURES in all modes.

The --against-allowlist <file> flag downgrades failures for paths listed in the
allowlist file to warnings (still printed, but exit 0). Paths NOT in the
allowlist that fail still exit 1. This implements a deletion-only ratchet:
existing skills can be grandfathered in, new skills must pass.

The --strict flag escalates non-required warnings to failures.
"""

import sys
import os
import re
import argparse
from pathlib import Path

VERB_ALLOWLIST = {
    'use', 'run', 'invoke', 'extract', 'generate', 'file', 'create', 'enforce',
    'adapt', 'port', 'review', 'analyze', 'build', 'check', 'validate',
    'package', 'publish', 'deploy', 'test', 'render', 'parse', 'compose',
    'orchestrate', 'audit', 'scan', 'detect', 'fix', 'refactor', 'migrate',
    'load', 'fetch', 'resolve', 'transform', 'convert', 'install', 'configure',
    'manage', 'update', 'execute', 'design', 'document', 'edit', 'explain',
    'find', 'format', 'help', 'identify', 'integrate', 'list', 'monitor',
    'optimize', 'plan', 'process', 'produce', 'protect', 'register',
    'remove', 'rename', 'repair', 'replace', 'report', 'route', 'schedule',
    'search', 'send', 'set', 'sign', 'spawn', 'specify', 'split', 'start',
    'stop', 'store', 'summarize', 'sync', 'track', 'translate', 'verify',
    'view', 'write',
}

VERB_ING_RE = re.compile(r'\b\w{2,}ing\b', re.IGNORECASE)


def has_verb(text: str) -> bool:
    """Heuristic: at least one word ending in -ing OR matching the verb allowlist."""
    if VERB_ING_RE.search(text):
        return True
    words = re.findall(r"\b[a-zA-Z]+\b", text)
    for w in words:
        if w.lower() in VERB_ALLOWLIST:
            return True
    return False


def parse_frontmatter(content: str):
    """Return (frontmatter_str, body_str) or (None, None) on failure."""
    if not content.startswith('---'):
        return None, None
    m = re.match(r'^---\r?\n(.*?)\r?\n---\r?\n(.*)$', content, re.DOTALL)
    if not m:
        return None, None
    return m.group(1), m.group(2)


def extract_field(frontmatter: str, field: str):
    """Extract a single-line or folded multi-line YAML field value from frontmatter."""
    # Match either "field: value" or "field:" followed by indented continuation lines.
    pattern = re.compile(
        rf'^{re.escape(field)}:\s*(.*?)(?=^\S|\Z)',
        re.MULTILINE | re.DOTALL,
    )
    m = pattern.search(frontmatter)
    if not m:
        return None
    raw = m.group(1)
    # Collapse multi-line folded value into a single string (YAML folded-block-ish).
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    return ' '.join(lines).strip()


def find_when_to_use_section(body: str, max_lines: int = 30) -> bool:
    """Check whether '## When to use this skill' appears in the first max_lines lines of body."""
    lines = body.splitlines()
    head = lines[:max_lines]
    pattern = re.compile(r'^##\s+When to use this skill\s*$', re.IGNORECASE)
    for ln in head:
        if pattern.match(ln.strip()):
            return True
    return False


def validate_skill(skill_path: Path):
    """
    Run all checks against the skill at skill_path.

    Returns:
        (failures: list[str], warnings: list[str])
    """
    failures = []
    warnings = []

    skill_md = skill_path / 'SKILL.md'
    if not skill_md.exists():
        return ["SKILL.md not found"], warnings

    content = skill_md.read_text(encoding='utf-8')
    frontmatter, body = parse_frontmatter(content)
    if frontmatter is None:
        return ["No YAML frontmatter found or invalid format"], warnings

    # name field
    if 'name:' not in frontmatter:
        failures.append("Missing 'name' in frontmatter")
    else:
        name = extract_field(frontmatter, 'name')
        if name:
            if not re.match(r'^[a-z0-9-]+$', name):
                failures.append(
                    f"Name '{name}' should be hyphen-case "
                    "(lowercase letters, digits, and hyphens only)"
                )
            if name.startswith('-') or name.endswith('-') or '--' in name:
                failures.append(
                    f"Name '{name}' cannot start/end with hyphen "
                    "or contain consecutive hyphens"
                )

    # description field
    if 'description:' not in frontmatter:
        failures.append("Missing 'description' in frontmatter")
    else:
        description = extract_field(frontmatter, 'description') or ''

        if '<' in description or '>' in description:
            failures.append("description cannot contain angle brackets (< or >)")

        # NEW LINT (a): trigger-explicit phrasing
        desc_lower = description.lower()
        starts_with_use_when = desc_lower.startswith('use when ')
        contains_when_to_use = 'when to use' in desc_lower
        if not (starts_with_use_when or contains_when_to_use):
            failures.append(
                '[FAIL] description must start with "Use when ..." '
                '(case-insensitive) or contain the phrase "when to use" '
                'to be trigger-explicit'
            )

        # NEW LINT (b): minimum length + at least one verb
        if len(description) < 60:
            failures.append(
                f'[FAIL] description must be >= 60 characters '
                f'(currently {len(description)}); '
                'noun-phrase descriptions corrupt resolve_workflow ranking'
            )
        if not has_verb(description):
            failures.append(
                '[FAIL] description must contain at least one verb '
                '(word ending in -ing or in the verb allowlist); '
                'pure noun-phrase descriptions are rejected'
            )

    # NEW LINT (c): "## When to use this skill" H2 within first 30 body lines
    if body is not None:
        if not find_when_to_use_section(body, max_lines=30):
            failures.append(
                '[FAIL] SKILL.md body must contain an H2 heading '
                '"## When to use this skill" within the first 30 lines '
                'after the frontmatter (5-second-decide rule)'
            )

    return failures, warnings


def load_allowlist(allowlist_file: Path) -> set:
    """Load allowlist file. Lines starting with '#' or empty are ignored.

    Returns a set of normalized POSIX-style relative paths.
    """
    if not allowlist_file.exists():
        return set()
    paths = set()
    for line in allowlist_file.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        # Normalize separators for cross-platform comparison
        paths.add(line.replace('\\', '/'))
    return paths


def normalize_for_allowlist(skill_path: Path, repo_root: Path = None) -> str:
    """Compute a relative POSIX-style path for allowlist matching."""
    try:
        if repo_root is None:
            # Walk up looking for a likely repo root (contains 'SKILLS' dir)
            cur = skill_path.resolve()
            for ancestor in [cur, *cur.parents]:
                if (ancestor / 'SKILLS').is_dir():
                    repo_root = ancestor
                    break
        if repo_root is not None:
            rel = skill_path.resolve().relative_to(repo_root.resolve())
        else:
            rel = skill_path
    except (ValueError, OSError):
        rel = skill_path
    return str(rel).replace('\\', '/')


def main():
    parser = argparse.ArgumentParser(
        description='Validate a skill directory against the EVOKORE authoring contract.'
    )
    parser.add_argument('skill_directory', help='Path to the skill directory')
    parser.add_argument(
        '--strict',
        action='store_true',
        help='Escalate warnings to failures',
    )
    parser.add_argument(
        '--against-allowlist',
        metavar='FILE',
        help='Allowlist file: matching paths fail as warnings, exit 0',
    )
    args = parser.parse_args()

    skill_path = Path(args.skill_directory)
    if not skill_path.exists():
        print(f"Error: skill directory not found: {skill_path}")
        sys.exit(1)

    failures, warnings = validate_skill(skill_path)

    # Honor --against-allowlist to downgrade failures to warnings
    allowlisted = False
    if args.against_allowlist:
        allowlist = load_allowlist(Path(args.against_allowlist))
        rel_path = normalize_for_allowlist(skill_path)
        if rel_path in allowlist:
            allowlisted = True

    for f in failures:
        prefix = '[ALLOWLISTED]' if allowlisted else '[FAIL]'
        # Avoid duplicating [FAIL] when the message already starts with it.
        msg = f
        if msg.startswith('[FAIL] '):
            msg = msg[len('[FAIL] '):]
        elif msg.startswith('[FAIL]'):
            msg = msg[len('[FAIL]'):].lstrip()
        print(f"{prefix} {msg}")
    for w in warnings:
        print(f"[WARN] {w}")

    if args.strict and warnings and not failures:
        print("[FAIL] strict mode: warnings escalated to failures")
        sys.exit(1)

    if failures and not allowlisted:
        sys.exit(1)

    if not failures:
        print("Skill is valid!")
    else:
        print(
            f"Skill grandfathered via allowlist "
            f"({len(failures)} suppressed failure(s)). "
            "Fix and remove from allowlist when ready."
        )
    sys.exit(0)


if __name__ == "__main__":
    main()
