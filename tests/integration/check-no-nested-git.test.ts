import { describe, expect, it } from 'vitest';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const { isNestedGitArtifact } = require(path.join(ROOT, 'scripts', 'check-no-nested-git.js'));

describe('check-no-nested-git: isNestedGitArtifact', () => {
  it('flags a plain .git file at any nested depth', () => {
    expect(isNestedGitArtifact('some/sub/.git')).toBe(true);
    expect(isNestedGitArtifact('a/b/c/.git')).toBe(true);
  });

  it('flags files inside a nested .git directory', () => {
    expect(isNestedGitArtifact('vendor/repo/.git/config')).toBe(true);
    expect(isNestedGitArtifact('a/.git/HEAD')).toBe(true);
  });

  it('does not flag the repo-root .git (would not appear in ls-files anyway)', () => {
    expect(isNestedGitArtifact('.git')).toBe(false);
    expect(isNestedGitArtifact('.git/HEAD')).toBe(false);
  });

  it('does not flag innocent paths containing "git" in the name', () => {
    expect(isNestedGitArtifact('src/github-client.ts')).toBe(false);
    expect(isNestedGitArtifact('docs/.gitkeep')).toBe(false);
    expect(isNestedGitArtifact('.gitignore')).toBe(false);
    expect(isNestedGitArtifact('my.gitconfig')).toBe(false);
  });

  it('handles Windows-style backslash separators', () => {
    expect(isNestedGitArtifact('some\\sub\\.git')).toBe(true);
    expect(isNestedGitArtifact('vendor\\repo\\.git\\config')).toBe(true);
  });
});
