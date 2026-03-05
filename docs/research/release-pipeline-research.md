# Release Pipeline Completion — Research Report

- **Date:** 2026-02-26
- **Researcher:** Agent 2 (NPM/Release Strategy)
- **Status:** Complete

## Current State

### package.json Issues (CRITICAL)
- Version: `2.0.0` (mismatches tag `v2.0.1`)
- `main`: `"index.js"` — wrong, should be `"dist/index.js"`
- Missing `files` field — would publish ENTIRE repo including SKILLS submodules
- Missing `publishConfig`, `repository`, `engines` fields
- No `.d.ts` generation (`declaration: true` not set in tsconfig)

### Release Workflow (.github/workflows/release.yml)
- Triggers on `push` (tags `v*`) and `workflow_dispatch` with `chain_complete` gate
- Has `publish` job with ancestry check
- NPM publish skipped when `NPM_TOKEN` secret missing
- **No GitHub Release creation step**
- Permissions: `contents: read` (insufficient for release creation)

### Current Tag/Release State
- Tags: `v2.0.0`, `v2.0.1` exist on remote
- No GitHub Release objects (API returns 404)
- v2.0.1 release notes exist at `docs/RELEASE_NOTES_v2.0.1.md`

## Recommended Approach

### Phase 1: Fix package.json
```json
{
  "version": "2.0.2",
  "main": "dist/index.js",
  "files": ["dist/", "mcp.config.json", "README.md"],
  "publishConfig": { "access": "public" },
  "repository": { "type": "git", "url": "https://github.com/mattmre/EVOKORE-MCP.git" },
  "engines": { "node": ">=18" }
}
```

### Phase 2: Update release workflow
1. Change `permissions: contents: read` to `contents: write`
2. Add GitHub Release creation step using `softprops/action-gh-release@v2`
3. Use `docs/RELEASE_NOTES_${TAG}.md` as body with auto-generate fallback

### Phase 3: NPM_TOKEN setup (manual, owner action)
- Create Automation token on npmjs.com
- Add as repository secret `NPM_TOKEN` in GitHub settings

### Phase 4: Retroactive v2.0.1 GitHub Release
```bash
gh release create v2.0.1 --title "v2.0.1" --notes-file docs/RELEASE_NOTES_v2.0.1.md
```

### Phase 5: First real publish as v2.0.2
- Recommended: bump to v2.0.2 (cleaner than re-tagging v2.0.1)

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| No `files` field = massive tarball | HIGH | Must add before any publish |
| `main` points to wrong file | HIGH | Fix to `dist/index.js` |
| Version mismatch | MEDIUM | Bump to 2.0.2 |
| .gitignore encoding (UTF-16 BOM) | LOW | Fix separately |
| `evokore-mcp` name availability on npm | MEDIUM | Verify before token setup |
