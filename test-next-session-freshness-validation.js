'use strict';


const assert = require('assert');
const fs = require('fs');
const path = require('path');

function getMaxAgeDays() {
  const raw = process.env.NEXT_SESSION_MAX_AGE_DAYS;
  if (raw === undefined || raw === '') {
    return 14;
  }

  assert.ok(
    /^\d+$/.test(raw),
    'NEXT_SESSION_MAX_AGE_DAYS must be a non-negative integer when provided'
  );
  const parsed = Number(raw);
  assert.ok(
    Number.isInteger(parsed) && parsed >= 0,
    'NEXT_SESSION_MAX_AGE_DAYS must be a non-negative integer when provided'
  );
  return parsed;
}

test('next-session freshness validation', () => {
  const filePath = path.resolve(__dirname, 'next-session.md');
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^Last Updated \(UTC\): (\d{4}-\d{2}-\d{2})$/m);

  assert.ok(
    match,
    'next-session.md must include: Last Updated (UTC): YYYY-MM-DD'
  );

  const lastUpdated = match[1];
  const parsedDate = new Date(`${lastUpdated}T00:00:00Z`);
  assert.ok(!Number.isNaN(parsedDate.getTime()), 'Last Updated date must be valid');
  assert.strictEqual(
    parsedDate.toISOString().slice(0, 10),
    lastUpdated,
    'Last Updated date must be a real calendar date in YYYY-MM-DD format'
  );

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const lastUpdatedUtc = Date.UTC(
    parsedDate.getUTCFullYear(),
    parsedDate.getUTCMonth(),
    parsedDate.getUTCDate()
  );
  const ageDays = Math.floor((todayUtc - lastUpdatedUtc) / (24 * 60 * 60 * 1000));
  const maxAgeDays = getMaxAgeDays();

  assert.ok(ageDays >= 0, 'next-session.md Last Updated date cannot be in the future.');
  assert.ok(
    ageDays <= maxAgeDays,
    `next-session.md Last Updated date is ${ageDays} days old (max ${maxAgeDays}).`
  );
});
