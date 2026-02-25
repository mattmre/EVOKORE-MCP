#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_FIELDS = [
  'Priority ID(s)',
  'Dependency Chain (base -> dependent)',
  'Chain-head PR? (yes/no)',
  'Required Checks Evidence',
  'Merge-boundary Revalidation Notes',
  'Release-impact Notes'
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseArgs(argv) {
  let eventPath = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--event') {
      eventPath = argv[i + 1] || null;
      i += 1;
      continue;
    }
    if (arg.startsWith('--event=')) {
      eventPath = arg.slice('--event='.length);
    }
  }

  return { eventPath };
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function extractTemplateFields(templateContents) {
  const fields = [];
  const regex = /^\s*-\s+\*\*(.+?)\*\*:\s*(?:<!--.*-->)?\s*$/gm;
  let match = regex.exec(templateContents);

  while (match) {
    fields.push(match[1].trim());
    match = regex.exec(templateContents);
  }

  return fields;
}

function extractFieldValue(body, fieldName) {
  const pattern = new RegExp(
    `^\\s*-\\s*\\*\\*${escapeRegex(fieldName)}\\*\\*:\\s*([\\s\\S]*?)(?=\\r?\\n\\s*-\\s*\\*\\*[^\\n]+\\*\\*:\\s*|$)`,
    'm'
  );
  const match = body.match(pattern);
  if (!match) {
    return null;
  }
  return match[1].trim();
}

function normalize(value) {
  return value.replace(/[`*_]/g, '').trim();
}

function isMissingOrPlaceholder(value) {
  if (!value) {
    return true;
  }

  const withoutHtmlComments = value.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!withoutHtmlComments) {
    return true;
  }

  return /^(tbd|todo|n\/a|na|\?)$/i.test(withoutHtmlComments);
}

function validateDependencyChain(value) {
  const normalized = normalize(value);
  if (/^standalone$/i.test(normalized)) {
    return true;
  }
  return /^#\d+(?:\s*->\s*#\d+)+$/.test(normalized);
}

function validateChainHead(value) {
  return /^(yes|no)$/i.test(normalize(value));
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const eventPath = args.eventPath || process.env.GITHUB_EVENT_PATH;

  if (!eventPath) {
    console.error('PR metadata validation failed: no event file provided. Use --event <path> or set GITHUB_EVENT_PATH.');
    process.exit(1);
  }

  const event = readJsonFile(eventPath);
  if (!event || !event.pull_request) {
    console.log('PR metadata validation skipped: not a pull_request event payload.');
    return;
  }

  const templatePath = path.resolve(__dirname, '..', '.github', 'pull_request_template.md');
  const templateContents = fs.readFileSync(templatePath, 'utf8');
  const templateFields = extractTemplateFields(templateContents);
  const missingInTemplate = REQUIRED_FIELDS.filter((field) => !templateFields.includes(field));

  if (missingInTemplate.length > 0) {
    console.error('PR metadata validation failed: pull request template is missing expected metadata fields:');
    for (const field of missingInTemplate) {
      console.error(`- ${field}`);
    }
    process.exit(1);
  }

  const prBody = String((event.pull_request && event.pull_request.body) || '');
  const issues = [];

  for (const field of REQUIRED_FIELDS) {
    const value = extractFieldValue(prBody, field);
    if (value === null) {
      issues.push(`Missing field: ${field}`);
      continue;
    }
    if (isMissingOrPlaceholder(value)) {
      issues.push(`Field has placeholder or empty value: ${field}`);
      continue;
    }

    if (field === 'Dependency Chain (base -> dependent)' && !validateDependencyChain(value)) {
      issues.push(`Invalid dependency chain format for "${field}". Use "standalone" or "#123 -> #124".`);
    }

    if (field === 'Chain-head PR? (yes/no)' && !validateChainHead(value)) {
      issues.push(`Invalid chain-head value for "${field}". Use "yes" or "no".`);
    }
  }

  if (issues.length > 0) {
    console.error('PR metadata validation failed:');
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log('PR metadata validation passed.');
}

try {
  run();
} catch (error) {
  console.error('PR metadata validation failed:', error && error.message ? error.message : error);
  process.exit(1);
}
