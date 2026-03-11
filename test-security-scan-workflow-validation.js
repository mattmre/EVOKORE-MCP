'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const workflowPath = path.resolve(__dirname, '.github', 'workflows', 'security-scan.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /uses:\s*aquasecurity\/setup-trivy@v0\.2\.2/g);
  assert.match(workflow, /version:\s*v0\.68\.1/);
  assert.match(workflow, /uses:\s*aquasecurity\/trivy-action@0\.33\.1/g);
  assert.match(workflow, /skip-setup-trivy:\s*true/g);
  assert.match(workflow, /uses:\s*github\/codeql-action\/upload-sarif@v4/);

  const setupCount = (workflow.match(/uses:\s*aquasecurity\/setup-trivy@v0\.2\.2/g) || []).length;
  const skipCount = (workflow.match(/skip-setup-trivy:\s*true/g) || []).length;
  const trivyCount = (workflow.match(/uses:\s*aquasecurity\/trivy-action@0\.33\.1/g) || []).length;

  assert.strictEqual(setupCount, 4, 'expected setup-trivy step in all 4 jobs');
  assert.strictEqual(skipCount, 4, 'expected skip-setup-trivy in all 4 Trivy action invocations');
  assert.strictEqual(trivyCount, 4, 'expected all 4 jobs to use upgraded trivy-action');

  console.log('Security scan workflow validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Security scan workflow validation failed:', error);
  process.exit(1);
}
