'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const workflowPath = path.resolve(__dirname, '.github', 'workflows', 'security-scan.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.doesNotMatch(workflow, /aquasecurity\/setup-trivy/);
  assert.doesNotMatch(workflow, /aquasecurity\/trivy-action/);
  assert.match(workflow, /aquasec\/trivy:0\.68\.1/g);
  assert.match(workflow, /docker run --rm/g);
  assert.match(workflow, /uses:\s*github\/codeql-action\/upload-sarif@v4/);
  assert.match(workflow, /results\/trivy-results\.sarif/);

  const imageCount = (workflow.match(/aquasec\/trivy:0\.68\.1/g) || []).length;
  const dockerRunCount = (workflow.match(/docker run --rm/g) || []).length;
  const cacheMountCount = (workflow.match(/\$\{HOME\}\/\.cache\/trivy:\/root\/\.cache\/trivy/g) || []).length;

  assert.strictEqual(imageCount, 4, 'expected all 4 jobs to use the pinned Trivy image');
  assert.strictEqual(dockerRunCount, 4, 'expected all 4 jobs to execute Trivy via docker');
  assert.strictEqual(cacheMountCount, 4, 'expected all 4 jobs to mount the shared Trivy cache');

  console.log('Security scan workflow validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Security scan workflow validation failed:', error);
  process.exit(1);
}
