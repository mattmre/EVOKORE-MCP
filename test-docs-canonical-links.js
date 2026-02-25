'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function getInternalMarkdownLinks(markdown) {
  const links = [];
  const markdownLinkRegex = /\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match;
  while ((match = markdownLinkRegex.exec(markdown)) !== null) {
    const href = match[1].trim();
    if (!href || href.startsWith('#')) {
      continue;
    }
    if (/^(?:[a-z]+:)?\/\//i.test(href) || /^[a-z]+:/i.test(href)) {
      continue;
    }
    links.push(href);
  }
  return links;
}

function collectMarkdownFiles(dirPath) {
  const files = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
      continue;
    }
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.md') {
      files.push(fullPath);
    }
  }
  return files;
}

function resolveInternalLinkPath(sourceFilePath, href) {
  const hrefWithoutAnchor = href.split('#')[0].split('?')[0];
  if (!hrefWithoutAnchor) {
    return null;
  }

  const canonicalAliasMap = {
    '/docs/architecture.md': path.join('docs', 'V2_ARCHITECTURE_PLAN.md'),
    '/docs/workflows.md': path.join('docs', 'V2_MULTI_AGENT_WORKFLOWS.md')
  };

  const mappedTarget = canonicalAliasMap[hrefWithoutAnchor] || hrefWithoutAnchor;
  if (mappedTarget.startsWith('/')) {
    return path.resolve(__dirname, mappedTarget.replace(/^\/+/, ''));
  }
  return path.resolve(path.dirname(sourceFilePath), mappedTarget);
}

function run() {
  const docsReadmePath = path.resolve(__dirname, 'docs', 'README.md');
  const submodulePath = path.resolve(__dirname, 'docs', 'SUBMODULE_WORKFLOW.md');
  const readmePath = path.resolve(__dirname, 'README.md');
  const contributingPath = path.resolve(__dirname, 'CONTRIBUTING.md');

  const docsReadme = fs.readFileSync(docsReadmePath, 'utf8');
  const submoduleDoc = fs.readFileSync(submodulePath, 'utf8');
  const readme = fs.readFileSync(readmePath, 'utf8');
  const contributing = fs.readFileSync(contributingPath, 'utf8');

  assert.match(docsReadme, /Usage Guide/);
  assert.match(docsReadme, /Troubleshooting Guide/);
  assert.match(docsReadme, /Submodule Workflow/);
  assert.match(docsReadme, /\/docs\/architecture\.md/);
  assert.match(docsReadme, /\/docs\/workflows\.md/);

  const markdownFilesToValidate = [
    ...collectMarkdownFiles(path.resolve(__dirname, 'docs')),
    readmePath,
    contributingPath
  ].sort((a, b) => a.localeCompare(b));

  for (const markdownFilePath of markdownFilesToValidate) {
    const markdown = fs.readFileSync(markdownFilePath, 'utf8');
    const internalLinks = getInternalMarkdownLinks(markdown);
    for (const href of internalLinks) {
      const resolvedLinkPath = resolveInternalLinkPath(markdownFilePath, href);
      if (!resolvedLinkPath) {
        continue;
      }
      assert.ok(
        fs.existsSync(resolvedLinkPath),
        `${path.relative(__dirname, markdownFilePath)} link target missing: ${href}`
      );
    }
  }

  const canonicalArchitecturePath = path.resolve(__dirname, 'docs', 'V2_ARCHITECTURE_PLAN.md');
  const canonicalWorkflowsPath = path.resolve(__dirname, 'docs', 'V2_MULTI_AGENT_WORKFLOWS.md');
  assert.ok(
    fs.existsSync(canonicalArchitecturePath),
    'Canonical mapping target for /docs/architecture.md must exist'
  );
  assert.ok(
    fs.existsSync(canonicalWorkflowsPath),
    'Canonical mapping target for /docs/workflows.md must exist'
  );

  assert.match(submoduleDoc, /git submodule/);
  assert.match(submoduleDoc, /PR Expectations/);

  assert.match(readme, /docs\/README\.md/);
  assert.match(readme, /docs\/SUBMODULE_WORKFLOW\.md/);
  assert.match(contributing, /docs\/README\.md/);
  assert.match(contributing, /docs\/SUBMODULE_WORKFLOW\.md/);

  console.log('Docs canonical link validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Docs canonical link validation failed:', error);
  process.exit(1);
}
