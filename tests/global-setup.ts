import { execSync } from 'child_process';

export async function setup() {
  console.log('Building dist/ before tests...');
  execSync('npx tsc', { stdio: 'inherit' });
}
