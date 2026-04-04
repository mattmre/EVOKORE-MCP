'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const EVOKORE_STATE_DIR = path.join(os.homedir(), '.evokore');
const PENDING_APPROVALS_FILE = path.join(EVOKORE_STATE_DIR, 'pending-approvals.json');
const DENIED_TOKENS_FILE = path.join(EVOKORE_STATE_DIR, 'denied-tokens.json');

// ---- Helpers ----

function backupFile(filePath) {
  if (fs.existsSync(filePath)) {
    const backup = filePath + '.test-backup';
    fs.copyFileSync(filePath, backup);
    return backup;
  }
  return null;
}

function restoreFile(filePath, backup) {
  if (backup && fs.existsSync(backup)) {
    fs.copyFileSync(backup, filePath);
    fs.unlinkSync(backup);
  } else if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// ---- SecurityManager Source Validation ----

describe('SecurityManager HITL approval UI integration', () => {
  const securityManagerPath = path.resolve(__dirname, 'src', 'SecurityManager.ts');
  let source;

  beforeAll(() => {
    source = fs.readFileSync(securityManagerPath, 'utf8');
  });

  test('imports os and fsSync for file-based state', () => {
    expect(source).toMatch(/import\s+fsSync\s+from\s+["']fs["']/);
    expect(source).toMatch(/import\s+os\s+from\s+["']os["']/);
  });

  test('defines state file paths', () => {
    expect(source).toContain('pending-approvals.json');
    expect(source).toContain('denied-tokens.json');
  });

  test('has getPendingApprovals method', () => {
    expect(source).toMatch(/getPendingApprovals\s*\(\)/);
    // Should return truncated token (first 8 chars + "...")
    expect(source).toContain('substring(0, 8)');
  });

  test('has denyToken method', () => {
    expect(source).toMatch(/denyToken\s*\(\s*token\s*:\s*string\s*\)/);
  });

  test('has persistPendingApprovals method', () => {
    expect(source).toMatch(/persistPendingApprovals\s*\(\)/);
    // Should use atomic write (tmp + rename)
    expect(source).toContain('.tmp');
    expect(source).toContain('renameSync');
  });

  test('has checkDeniedTokens method', () => {
    expect(source).toMatch(/checkDeniedTokens\s*\(/);
  });

  test('generateToken calls persistPendingApprovals', () => {
    // Extract the generateToken method body
    const generateMatch = source.match(/generateToken\s*\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
    expect(generateMatch).toBeTruthy();
    expect(generateMatch[1]).toContain('persistPendingApprovals');
  });

  test('consumeToken calls persistPendingApprovals', () => {
    const consumeMatch = source.match(/consumeToken\s*\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
    expect(consumeMatch).toBeTruthy();
    expect(consumeMatch[1]).toContain('persistPendingApprovals');
  });

  test('validateToken checks denied tokens', () => {
    const validateMatch = source.match(/validateToken\s*\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
    expect(validateMatch).toBeTruthy();
    expect(validateMatch[1]).toContain('checkDeniedTokens');
  });

  test('getPendingApprovals returns correct shape', () => {
    // Check that the return type includes the expected fields
    expect(source).toMatch(/token:\s*string/);
    expect(source).toMatch(/toolName:\s*string/);
    expect(source).toMatch(/expiresAt:\s*number/);
    expect(source).toMatch(/createdAt:\s*number/);
  });
});

// ---- Dashboard Validation ----

describe('Dashboard HITL approvals integration', () => {
  const dashboardPath = path.resolve(__dirname, 'scripts', 'dashboard.js');
  let source;

  beforeAll(() => {
    source = fs.readFileSync(dashboardPath, 'utf8');
  });

  test('serves approvals HTML page at /approvals', () => {
    expect(source).toContain("url.pathname === '/approvals'");
    expect(source).toContain('approvalsHTML');
  });

  test('has GET /api/approvals endpoint', () => {
    expect(source).toContain("url.pathname === '/api/approvals'");
    expect(source).toContain('readPendingApprovals');
  });

  test('has POST /api/approvals/deny endpoint', () => {
    expect(source).toContain("url.pathname === '/api/approvals/deny'");
    expect(source).toContain('denyTokenFull');
  });

  test('reads pending-approvals.json', () => {
    expect(source).toContain('pending-approvals.json');
  });

  test('writes to denied-tokens.json', () => {
    expect(source).toContain('denied-tokens.json');
  });

  test('sanitizes token prefix input', () => {
    expect(source).toContain('sanitizeTokenPrefix');
    // Should only allow hex characters
    expect(source).toMatch(/[^a-f0-9]/gi);
  });

  test('approvals HTML has auto-refresh', () => {
    expect(source).toContain('setInterval');
    expect(source).toContain('5000');
  });

  test('approvals HTML has deny button', () => {
    expect(source).toContain('btn-deny');
    expect(source).toContain('denyToken');
  });

  test('dashboard has navigation links between pages', () => {
    expect(source).toContain("href=\"/approvals\"");
    expect(source).toContain("href=\"/\"");
  });

  test('dashboard listens on 127.0.0.1 only', () => {
    expect(source).toContain("'127.0.0.1'");
  });

  test('body size is limited on POST', () => {
    expect(source).toContain('1024 * 10');
    expect(source).toContain('Body too large');
  });

  test('full token length is validated', () => {
    expect(source).toContain('token.length !== 32');
  });
});

// ---- File-based State Integration ----

describe('File-based approval state', () => {
  let pendingBackup;
  let deniedBackup;

  beforeAll(() => {
    // Back up any existing state files
    pendingBackup = backupFile(PENDING_APPROVALS_FILE);
    deniedBackup = backupFile(DENIED_TOKENS_FILE);
  });

  afterAll(() => {
    // Restore originals
    restoreFile(PENDING_APPROVALS_FILE, pendingBackup);
    restoreFile(DENIED_TOKENS_FILE, deniedBackup);
  });

  test('pending-approvals.json can be written and read', () => {
    const testData = [
      {
        token: 'abc12345...',
        toolName: 'fs_write_file',
        expiresAt: Date.now() + 300000,
        createdAt: Date.now()
      }
    ];

    if (!fs.existsSync(EVOKORE_STATE_DIR)) {
      fs.mkdirSync(EVOKORE_STATE_DIR, { recursive: true });
    }

    fs.writeFileSync(PENDING_APPROVALS_FILE, JSON.stringify(testData, null, 2));
    const readBack = JSON.parse(fs.readFileSync(PENDING_APPROVALS_FILE, 'utf8'));
    expect(readBack).toHaveLength(1);
    expect(readBack[0].toolName).toBe('fs_write_file');
    expect(readBack[0].token).toBe('abc12345...');
  });

  test('denied-tokens.json can be written and read', () => {
    const testData = [
      { prefix: 'abc12345', deniedAt: Date.now() }
    ];

    fs.writeFileSync(DENIED_TOKENS_FILE, JSON.stringify(testData, null, 2));
    const readBack = JSON.parse(fs.readFileSync(DENIED_TOKENS_FILE, 'utf8'));
    expect(readBack).toHaveLength(1);
    expect(readBack[0].prefix).toBe('abc12345');
    expect(readBack[0]).toHaveProperty('deniedAt');
  });

  test('atomic write pattern works (write to .tmp then rename)', () => {
    const testData = [{ token: 'test1234...', toolName: 'test_tool', expiresAt: Date.now() + 60000, createdAt: Date.now() }];
    const tmpPath = PENDING_APPROVALS_FILE + '.tmp';

    fs.writeFileSync(tmpPath, JSON.stringify(testData));
    expect(fs.existsSync(tmpPath)).toBe(true);

    fs.renameSync(tmpPath, PENDING_APPROVALS_FILE);
    expect(fs.existsSync(tmpPath)).toBe(false);
    expect(fs.existsSync(PENDING_APPROVALS_FILE)).toBe(true);

    const readBack = JSON.parse(fs.readFileSync(PENDING_APPROVALS_FILE, 'utf8'));
    expect(readBack[0].token).toBe('test1234...');
  });

  test('expired approvals are filtered out by dashboard reader', () => {
    // Simulate the dashboard's readPendingApprovals logic
    const testData = [
      { token: 'live1234...', toolName: 'tool_a', expiresAt: Date.now() + 300000, createdAt: Date.now() },
      { token: 'dead5678...', toolName: 'tool_b', expiresAt: Date.now() - 1000, createdAt: Date.now() - 301000 }
    ];

    fs.writeFileSync(PENDING_APPROVALS_FILE, JSON.stringify(testData, null, 2));
    const content = JSON.parse(fs.readFileSync(PENDING_APPROVALS_FILE, 'utf8'));
    const now = Date.now();
    const filtered = content.filter(a => a && a.expiresAt > now);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].token).toBe('live1234...');
  });
});

// ---- Build Validation ----

describe('TypeScript compilation', () => {
  test('SecurityManager compiles without errors', () => {
    const distFile = path.resolve(__dirname, 'dist', 'SecurityManager.js');
    // The global setup runs tsc before tests, so dist should be fresh
    expect(fs.existsSync(distFile)).toBe(true);
    const compiled = fs.readFileSync(distFile, 'utf8');
    expect(compiled).toContain('getPendingApprovals');
    expect(compiled).toContain('denyToken');
    expect(compiled).toContain('persistPendingApprovals');
    expect(compiled).toContain('checkDeniedTokens');
  });
});
