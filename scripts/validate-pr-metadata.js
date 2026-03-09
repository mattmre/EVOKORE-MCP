#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_SECTIONS = [
  'Description',
  'Type of Change',
  'Testing',
  'Evidence'
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

function extractTemplateSections(templateContents) {
  const sections = [];
  const regex = /^##\s+(.+)$/gm;
  let match = regex.exec(templateContents);

  while (match) {
    sections.push(match[1].trim());
    match = regex.exec(templateContents);
  }

  return sections;
}

function extractSectionContent(body, sectionName) {
  const pattern = new RegExp(
    `^##\\s+${escapeRegex(sectionName)}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##\\s|$)`,
    'm'
  );
  const match = body.match(pattern);
  if (!match) {
    return null;
  }
  return match[1].trim();
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

  const templatePath = path.resolve(__dirname, '..', '.github', 'PULL_REQUEST_TEMPLATE.md');
  const templateContents = fs.readFileSync(templatePath, 'utf8');
  const templateSections = extractTemplateSections(templateContents);
  const missingInTemplate = REQUIRED_SECTIONS.filter((section) => !templateSections.includes(section));

  if (missingInTemplate.length > 0) {
    console.error('PR metadata validation failed: pull request template is missing expected sections:');
    for (const section of missingInTemplate) {
      console.error(`- ${section}`);
    }
    process.exit(1);
  }

  const prBody = String((event.pull_request && event.pull_request.body) || '');
  const issues = [];

  for (const section of REQUIRED_SECTIONS) {
    const content = extractSectionContent(prBody, section);
    if (content === null) {
      issues.push(`Missing section: ${section}`);
      continue;
    }
    if (isMissingOrPlaceholder(content)) {
      issues.push(`Section has placeholder or empty value: ${section}`);
      continue;
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
