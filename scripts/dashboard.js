#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = parseInt(process.env.EVOKORE_DASHBOARD_PORT || '8899', 10);
const SESSIONS_DIR = path.join(os.homedir(), '.evokore', 'sessions');
const SESSION_STORE_DIR = path.join(os.homedir(), '.evokore', 'session-store');
const EVOKORE_STATE_DIR = path.join(os.homedir(), '.evokore');
const AUDIT_FILE = path.join(os.homedir(), '.evokore', 'audit', 'audit.jsonl');
const PENDING_APPROVALS_FILE = path.join(EVOKORE_STATE_DIR, 'pending-approvals.json');
const DENIED_TOKENS_FILE = path.join(EVOKORE_STATE_DIR, 'denied-tokens.json');

// Bearer token auth (optional -- when unset, dashboard runs in local-only mode)
const DASHBOARD_TOKEN = process.env.EVOKORE_DASHBOARD_TOKEN || '';
const TOKEN_AUTH_ENABLED = !!DASHBOARD_TOKEN;

// RBAC role: admin (default for local-only), readonly (default for token mode)
const VALID_ROLES = ['admin', 'developer', 'readonly'];
const DASHBOARD_ROLE = (function() {
  const envRole = (process.env.EVOKORE_DASHBOARD_ROLE || '').toLowerCase();
  if (VALID_ROLES.includes(envRole)) return envRole;
  return TOKEN_AUTH_ENABLED ? 'readonly' : 'admin';
})();

// Role hierarchy: admin > developer > readonly
const ROLE_LEVEL = { admin: 3, developer: 2, readonly: 1 };

function hasRole(requiredRole) {
  return (ROLE_LEVEL[DASHBOARD_ROLE] || 0) >= (ROLE_LEVEL[requiredRole] || 0);
}

// Rate limiting for auth failures: track per IP
const authFailures = new Map(); // ip -> { count, firstFailureAt }
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 60 seconds
const RATE_LIMIT_MAX_FAILURES = 5;
const RATE_LIMIT_LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

function getClientIp(req) {
  // For local dashboard, use remoteAddress directly
  return req.socket.remoteAddress || '127.0.0.1';
}

function isRateLimited(ip) {
  const entry = authFailures.get(ip);
  if (!entry) return false;
  const now = Date.now();

  // Check if lockout period has passed
  if (entry.lockedUntil && now < entry.lockedUntil) return true;

  // Clean up expired entries
  if (now - entry.firstFailureAt > RATE_LIMIT_WINDOW_MS) {
    authFailures.delete(ip);
    return false;
  }

  return false;
}

function recordAuthFailure(ip) {
  const now = Date.now();
  const entry = authFailures.get(ip);

  if (!entry || (now - entry.firstFailureAt > RATE_LIMIT_WINDOW_MS)) {
    authFailures.set(ip, { count: 1, firstFailureAt: now, lockedUntil: null });
    return;
  }

  entry.count++;
  if (entry.count >= RATE_LIMIT_MAX_FAILURES) {
    entry.lockedUntil = now + RATE_LIMIT_LOCKOUT_MS;
  }
}

// Timing-safe token comparison using crypto.timingSafeEqual
function validateBearerToken(token) {
  if (!DASHBOARD_TOKEN) return false;
  const tokenBuffer = Buffer.from(token, 'utf8');
  const expectedBuffer = Buffer.from(DASHBOARD_TOKEN, 'utf8');
  if (tokenBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
}

// Extract Bearer token from Authorization header
function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const trimmed = authHeader.trim();
  if (!/^Bearer\s+/i.test(trimmed)) return null;
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
}

// Security headers applied to all responses
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self' 'unsafe-inline'"
};

const API_SECURITY_HEADERS = {
  ...SECURITY_HEADERS,
  'Cache-Control': 'no-store'
};

function applySecurityHeaders(res, isApi) {
  const headers = isApi ? API_SECURITY_HEADERS : SECURITY_HEADERS;
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}

// Paths that bypass authentication (login page, auth status)
function isPublicPath(pathname) {
  return pathname === '/login' || pathname === '/api/auth/status';
}

// Auth middleware -- returns true if request is authorized, false if response was sent
function requireAuth(req, res) {
  const url = new URL(req.url, 'http://localhost');

  // Public paths bypass auth
  if (isPublicPath(url.pathname)) return true;

  // If token auth not enabled, allow all (local-only mode)
  if (!TOKEN_AUTH_ENABLED) return true;

  const ip = getClientIp(req);

  // Check rate limiting
  if (isRateLimited(ip)) {
    applySecurityHeaders(res, true);
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Too many failed authentication attempts. Try again later.' }));
    return false;
  }

  const token = extractBearerToken(req);
  if (token && validateBearerToken(token)) {
    return true;
  }

  // Record failure for rate limiting (only if a token was actually provided)
  if (token) {
    recordAuthFailure(ip);
  }

  // For browser HTML requests without a token, redirect to login page
  const accept = req.headers.accept || '';
  if (accept.includes('text/html') && !token) {
    res.writeHead(302, { 'Location': '/login' });
    res.end();
    return false;
  }

  applySecurityHeaders(res, true);
  res.writeHead(401, {
    'Content-Type': 'application/json',
    'WWW-Authenticate': 'Bearer realm="EVOKORE Dashboard"'
  });
  res.end(JSON.stringify({ error: 'Unauthorized. Provide a valid Bearer token.' }));
  return false;
}

// Route-level RBAC authorization
// Returns true if the current dashboard role meets the requirement, false if response was sent
function requireRole(res, requiredRole) {
  if (hasRole(requiredRole)) return true;

  applySecurityHeaders(res, true);
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'Forbidden',
    detail: 'Requires role: ' + requiredRole + ', current role: ' + DASHBOARD_ROLE
  }));
  return false;
}

// Sanitize session IDs to prevent path traversal
function sanitizeSessionId(id) {
  if (!id || typeof id !== 'string') return '';
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Sanitize a token prefix (hex characters only, max 8 chars)
function sanitizeTokenPrefix(prefix) {
  if (!prefix || typeof prefix !== 'string') return '';
  return prefix.replace(/[^a-f0-9]/gi, '').substring(0, 8);
}

// Read a JSONL file and parse each line
function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return fs.readFileSync(filePath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Read audit log entries from JSONL, newest first, with pagination
function readAuditEntries(limit, offset) {
  if (!fs.existsSync(AUDIT_FILE)) return [];
  try {
    const lines = fs.readFileSync(AUDIT_FILE, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean);

    // Parse all valid lines
    const entries = [];
    for (const line of lines) {
      try { entries.push(JSON.parse(line)); } catch { /* skip */ }
    }

    // Reverse to newest-first, then paginate
    entries.reverse();
    return entries.slice(offset, offset + limit);
  } catch {
    return [];
  }
}

// Get audit summary counts by eventType
function getAuditSummary() {
  if (!fs.existsSync(AUDIT_FILE)) return {};
  try {
    const lines = fs.readFileSync(AUDIT_FILE, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean);

    const counts = {};
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.eventType) {
          counts[entry.eventType] = (counts[entry.eventType] || 0) + 1;
        }
      } catch { /* skip */ }
    }
    return counts;
  } catch {
    return {};
  }
}

// Count lines in a JSONL file without fully parsing
function countLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  try {
    return fs.readFileSync(filePath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .length;
  } catch {
    return 0;
  }
}

// Derive HTTP session status from TTL/activity
function deriveHttpSessionStatus(data) {
  const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour, mirrors SessionIsolation default
  const ttl = parseInt(process.env.EVOKORE_SESSION_TTL_MS || '', 10) || DEFAULT_TTL_MS;
  const now = Date.now();
  const lastAccess = data.lastAccessedAt || data.createdAt || 0;
  if ((now - lastAccess) > ttl) return 'expired';
  return 'active';
}

// Normalize a hook-side session manifest into the unified response shape
function normalizeHookSession(id, manifest) {
  const replayFile = path.join(SESSIONS_DIR, id + '-replay.jsonl');
  const evidenceFile = path.join(SESSIONS_DIR, id + '-evidence.jsonl');
  return {
    id,
    type: 'hook',
    createdAt: manifest.createdAt || manifest.created || null,
    lastActivity: manifest.lastActivityAt || manifest.lastActivity || null,
    status: manifest.status || null,
    purpose: manifest.purpose || null,
    replayCount: countLines(replayFile),
    evidenceCount: countLines(evidenceFile),
    metadata: {
      replayPath: (manifest.artifacts && manifest.artifacts.replayLogPath) || null,
      evidencePath: (manifest.artifacts && manifest.artifacts.evidenceLogPath) || null,
      metrics: manifest.metrics || null
    }
  };
}

// Normalize an HTTP transport session (from FileSessionStore) into the unified response shape
function normalizeHttpSession(id, data) {
  return {
    id,
    type: 'http',
    createdAt: data.createdAt || null,
    lastActivity: data.lastAccessedAt || null,
    status: deriveHttpSessionStatus(data),
    purpose: null,
    replayCount: 0,
    evidenceCount: 0,
    metadata: {
      activatedTools: data.activatedTools || [],
      role: data.role || null,
      rateLimitCounters: data.rateLimitCounters || {},
      sessionMetadata: data.metadata || {}
    }
  };
}

// Read hook-side sessions from ~/.evokore/sessions/
function readHookSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  const files = fs.readdirSync(SESSIONS_DIR);

  // Manifest files are {sessionId}.json
  // Exclude files like {id}-tasks.json, {id}-replay.jsonl, {id}-evidence.jsonl
  const manifestFiles = files.filter(f => {
    if (!f.endsWith('.json')) return false;
    const base = f.replace('.json', '');
    return !base.endsWith('-tasks');
  });

  return manifestFiles.map(f => {
    const id = f.replace('.json', '');
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'));
      return normalizeHookSession(id, manifest);
    } catch {
      return normalizeHookSession(id, {});
    }
  });
}

// Read HTTP transport sessions from ~/.evokore/session-store/
function readHttpSessions() {
  if (!fs.existsSync(SESSION_STORE_DIR)) return [];
  const files = fs.readdirSync(SESSION_STORE_DIR);

  const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp'));

  return jsonFiles.map(f => {
    const id = f.replace('.json', '');
    try {
      const data = JSON.parse(fs.readFileSync(path.join(SESSION_STORE_DIR, f), 'utf8'));
      return normalizeHttpSession(id, data);
    } catch {
      return normalizeHttpSession(id, {});
    }
  });
}

// List all sessions with metadata, with optional filtering
// Reads from both ~/.evokore/sessions/ (hook) and ~/.evokore/session-store/ (http)
function listSessions(filters) {
  const hookSessions = readHookSessions();
  const httpSessions = readHttpSessions();

  // Deduplicate: if a session ID exists in both, prefer hook-side (richer metadata)
  const seen = new Set();
  const merged = [];

  for (const s of hookSessions) {
    seen.add(s.id);
    merged.push(s);
  }

  for (const s of httpSessions) {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      merged.push(s);
    }
  }

  // Sort by last activity descending
  let sessions = merged.sort((a, b) => {
    const aTime = a.lastActivity || '';
    const bTime = b.lastActivity || '';
    // Handle both ISO strings and numeric timestamps
    if (typeof aTime === 'number' && typeof bTime === 'number') return bTime - aTime;
    return String(bTime).localeCompare(String(aTime));
  });

  // Apply filters if provided
  if (filters) {
    if (filters.type) {
      sessions = sessions.filter(s => s.type === filters.type);
    }
    if (filters.status) {
      sessions = sessions.filter(s => s.status === filters.status);
    }
    if (filters.since) {
      const sinceDate = new Date(filters.since);
      if (!isNaN(sinceDate.getTime())) {
        const sinceISO = sinceDate.toISOString();
        const sinceMs = sinceDate.getTime();
        sessions = sessions.filter(s => {
          if (!s.lastActivity) return false;
          if (typeof s.lastActivity === 'number') return s.lastActivity >= sinceMs;
          return s.lastActivity >= sinceISO;
        });
      }
    }
  }

  return sessions;
}

// Return summary counts by session type
function getSessionTypeCounts() {
  const hookSessions = readHookSessions();
  const httpSessions = readHttpSessions();

  // Deduplicate for total count
  const seen = new Set();
  for (const s of hookSessions) seen.add(s.id);
  let httpUnique = 0;
  for (const s of httpSessions) {
    if (!seen.has(s.id)) httpUnique++;
  }

  return {
    hook: hookSessions.length,
    http: httpUnique,
    total: hookSessions.length + httpUnique
  };
}

// Read pending approvals from the shared state file
function readPendingApprovals() {
  try {
    if (!fs.existsSync(PENDING_APPROVALS_FILE)) return [];
    const content = fs.readFileSync(PENDING_APPROVALS_FILE, 'utf8');
    const approvals = JSON.parse(content);
    if (!Array.isArray(approvals)) return [];
    // Filter out expired approvals
    const now = Date.now();
    return approvals.filter(a => a && a.expiresAt > now);
  } catch {
    return [];
  }
}

// Add a token prefix to the denied-tokens file (atomic write)
function denyTokenPrefix(prefix) {
  try {
    if (!fs.existsSync(EVOKORE_STATE_DIR)) {
      fs.mkdirSync(EVOKORE_STATE_DIR, { recursive: true });
    }
    let denied = [];
    if (fs.existsSync(DENIED_TOKENS_FILE)) {
      try {
        denied = JSON.parse(fs.readFileSync(DENIED_TOKENS_FILE, 'utf8'));
        if (!Array.isArray(denied)) denied = [];
      } catch {
        denied = [];
      }
    }
    // Only add if not already present
    if (!denied.some(d => d.prefix === prefix)) {
      denied.push({ prefix, deniedAt: Date.now() });
    }
    const tmpPath = DENIED_TOKENS_FILE + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(denied, null, 2));
    fs.renameSync(tmpPath, DENIED_TOKENS_FILE);
    return true;
  } catch {
    return false;
  }
}

// Escape HTML to prevent XSS when rendering session data
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Read the full request body as a string
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 1024 * 10) { // 10KB limit
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

// Login page HTML (shown when token auth is required)
const loginHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>EVOKORE Dashboard - Login</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .login-box { background: #1e293b; border-radius: 12px; padding: 40px; width: 100%; max-width: 400px; border: 1px solid #334155; }
    h1 { color: #38bdf8; margin-bottom: 8px; font-size: 24px; }
    p { color: #94a3b8; margin-bottom: 24px; font-size: 14px; }
    label { color: #94a3b8; font-size: 13px; display: block; margin-bottom: 6px; }
    input { width: 100%; padding: 10px 14px; background: #0f172a; border: 1px solid #334155; border-radius: 6px; color: #e2e8f0; font-size: 14px; font-family: monospace; }
    input:focus { outline: none; border-color: #38bdf8; }
    button { width: 100%; padding: 10px; background: #0ea5e9; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; margin-top: 16px; }
    button:hover { background: #0284c7; }
    .error { color: #f87171; font-size: 13px; margin-top: 12px; display: none; }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>EVOKORE Dashboard</h1>
    <p>Enter your dashboard access token to continue.</p>
    <label for="token">Access Token</label>
    <input type="password" id="token" placeholder="Enter your dashboard token" autocomplete="off">
    <button onclick="doLogin()">Sign In</button>
    <div class="error" id="error">Invalid token. Please try again.</div>
  </div>
  <script>
    document.getElementById('token').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doLogin();
    });

    async function doLogin() {
      var token = document.getElementById('token').value.trim();
      if (!token) return;
      var errorEl = document.getElementById('error');
      errorEl.style.display = 'none';

      try {
        var res = await fetch('/api/auth/status', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        var data = await res.json();
        if (data.authenticated) {
          sessionStorage.setItem('evokore_dashboard_token', token);
          window.location.href = '/';
        } else {
          errorEl.style.display = 'block';
        }
      } catch (err) {
        errorEl.textContent = 'Connection error: ' + err.message;
        errorEl.style.display = 'block';
      }
    }
  </script>
</body>
</html>`;

// Self-contained HTML dashboard (sessions view)
const dashboardHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>EVOKORE Session Dashboard</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
    h1 { color: #38bdf8; margin-bottom: 8px; }
    h2 { color: #94a3b8; margin: 16px 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
    nav { margin-bottom: 20px; display: flex; gap: 16px; }
    nav a { color: #38bdf8; text-decoration: none; padding: 6px 14px; border-radius: 6px; border: 1px solid #334155; font-size: 14px; }
    nav a:hover, nav a.active { background: #1e293b; border-color: #38bdf8; }
    .header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
    .auto-refresh-indicator { color: #64748b; font-size: 12px; }
    .auto-refresh-indicator .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #4ade80; margin-right: 4px; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .sessions { display: grid; gap: 12px; }
    .session { background: #1e293b; border-radius: 8px; padding: 16px; cursor: pointer; border: 1px solid #334155; transition: border-color 0.15s; }
    .session:hover { border-color: #38bdf8; }
    .session .id { color: #38bdf8; font-weight: 600; font-family: monospace; }
    .session .purpose { color: #cbd5e1; margin-top: 4px; }
    .session .meta { color: #64748b; font-size: 13px; margin-top: 4px; display: flex; gap: 16px; flex-wrap: wrap; }
    .session .meta-item { display: flex; align-items: center; gap: 4px; }
    .session .status-badge { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 4px; margin-left: 8px; font-weight: 600; }
    .status-active { background: #065f46; color: #6ee7b7; }
    .status-awaiting { background: #78350f; color: #fcd34d; }
    .status-completed { background: #1e3a5f; color: #93c5fd; }
    .status-expired { background: #7f1d1d; color: #fca5a5; }
    .status-other { background: #334155; color: #94a3b8; }
    .timeline { margin-top: 16px; }
    .event { display: flex; gap: 12px; padding: 8px 12px; border-left: 2px solid #334155; margin-left: 8px; font-size: 14px; }
    .event:hover { background: #1e293b; }
    .event .time { color: #64748b; font-size: 12px; min-width: 80px; flex-shrink: 0; }
    .event .tool { color: #4ade80; font-weight: 500; min-width: 120px; flex-shrink: 0; }
    .event .summary { color: #cbd5e1; word-break: break-all; }
    .event.evidence { border-left-color: #f59e0b; }
    .back { color: #38bdf8; cursor: pointer; margin-bottom: 16px; display: inline-block; text-decoration: none; }
    .back:hover { text-decoration: underline; }
    .stats { display: flex; gap: 24px; margin: 16px 0; flex-wrap: wrap; }
    .stat { background: #1e293b; padding: 12px 20px; border-radius: 8px; }
    .stat .value { font-size: 24px; font-weight: 700; color: #38bdf8; }
    .stat .label { color: #64748b; font-size: 12px; }
    .top-tools { margin-bottom: 16px; }
    .top-tools span { color: #4ade80; margin-right: 16px; font-size: 14px; }
    .empty { color: #64748b; padding: 40px; text-align: center; }
    .error { color: #f87171; padding: 16px; background: #1e293b; border-radius: 8px; }
    .loading { color: #64748b; }
    #app { max-width: 960px; margin: 0 auto; }
    .filter-bar { margin-bottom: 16px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    .filter-bar input, .filter-bar select { background: #1e293b; border: 1px solid #334155; color: #e2e8f0; padding: 8px 12px; border-radius: 6px; font-size: 14px; }
    .filter-bar input { width: 100%; max-width: 300px; }
    .filter-bar select { min-width: 120px; }
    .filter-bar input:focus, .filter-bar select:focus { outline: none; border-color: #38bdf8; }
    .filter-bar label { color: #94a3b8; font-size: 13px; }
    .timestamp { color: #94a3b8; font-size: 12px; font-family: monospace; }
  </style>
</head>
<body>
  <div id="app">
    <div class="header-row">
      <h1>EVOKORE Session Dashboard</h1>
      <span class="auto-refresh-indicator"><span class="dot"></span>Auto-refresh 30s</span>
    </div>
    <nav>
      <a href="/" class="active">Sessions</a>
      <a href="/approvals">Approvals</a>
    </nav>
    <div id="content"><p class="loading">Loading sessions...</p></div>
  </div>
  <script>
    var API = '';
    var refreshTimer = null;

    // Auth-aware fetch wrapper: injects Bearer token from sessionStorage
    function authFetch(url, opts) {
      opts = opts || {};
      opts.headers = opts.headers || {};
      var token = sessionStorage.getItem('evokore_dashboard_token');
      if (token) opts.headers['Authorization'] = 'Bearer ' + token;
      return fetch(url, opts).then(function(res) {
        if (res.status === 401 || res.status === 302) {
          sessionStorage.removeItem('evokore_dashboard_token');
          window.location.href = '/login';
          return Promise.reject(new Error('Unauthorized'));
        }
        return res;
      });
    }

    function esc(s) {
      if (!s) return '';
      var d = document.createElement('div');
      d.appendChild(document.createTextNode(String(s)));
      return d.innerHTML;
    }

    function statusBadge(status) {
      if (!status) return '';
      if (status === 'active') return '<span class="status-badge status-active">active</span>';
      if (status === 'awaiting-purpose') return '<span class="status-badge status-awaiting">awaiting purpose</span>';
      if (status === 'completed') return '<span class="status-badge status-completed">completed</span>';
      if (status === 'expired') return '<span class="status-badge status-expired">expired</span>';
      return '<span class="status-badge status-other">' + esc(status) + '</span>';
    }

    function formatTime(ts) {
      if (!ts) return '--';
      try { return new Date(ts).toLocaleTimeString('en-US', { hour12: false }); } catch { return ts; }
    }

    function formatDate(ts) {
      if (!ts) return '';
      try { return new Date(ts).toLocaleString(); } catch { return ts; }
    }

    function relativeTime(ts) {
      if (!ts) return '';
      try {
        var diff = Date.now() - new Date(ts).getTime();
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
        if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
        return Math.floor(diff / 86400000) + 'd ago';
      } catch { return ''; }
    }

    function buildFilterUrl() {
      var params = new URLSearchParams();
      var statusFilter = document.getElementById('status-filter');
      var sinceFilter = document.getElementById('since-filter');
      var typeFilter = document.getElementById('type-filter');
      if (statusFilter && statusFilter.value) params.set('status', statusFilter.value);
      if (sinceFilter && sinceFilter.value) params.set('since', sinceFilter.value);
      if (typeFilter && typeFilter.value) params.set('type', typeFilter.value);
      var qs = params.toString();
      return API + '/api/sessions' + (qs ? '?' + qs : '');
    }

    function typeBadge(type) {
      if (!type) return '';
      if (type === 'hook') return '<span class="status-badge" style="background:#1e3a5f;color:#93c5fd;margin-left:6px;">hook</span>';
      if (type === 'http') return '<span class="status-badge" style="background:#3b0764;color:#c4b5fd;margin-left:6px;">http</span>';
      return '<span class="status-badge status-other" style="margin-left:6px;">' + esc(type) + '</span>';
    }

    async function loadSessions() {
      try {
        var url = buildFilterUrl();
        var res = await authFetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var sessions = await res.json();
        var content = document.getElementById('content');

        var html = '<div class="filter-bar">';
        html += '<input type="text" id="session-filter" placeholder="Search sessions..." oninput="filterSessionsLocal()">';
        html += '<label>Type: </label><select id="type-filter" onchange="loadSessions()">';
        html += '<option value="">All</option>';
        html += '<option value="hook">Hook</option>';
        html += '<option value="http">HTTP</option>';
        html += '</select>';
        html += '<label>Status: </label><select id="status-filter" onchange="loadSessions()">';
        html += '<option value="">All</option>';
        html += '<option value="active">Active</option>';
        html += '<option value="completed">Completed</option>';
        html += '<option value="awaiting-purpose">Awaiting Purpose</option>';
        html += '<option value="expired">Expired</option>';
        html += '</select>';
        html += '<label>Since: </label><input type="date" id="since-filter" onchange="loadSessions()">';
        html += '</div>';

        if (!sessions.length) {
          html += '<p class="empty">No sessions found matching filters</p>';
          content.innerHTML = html;
          return;
        }

        html += '<div class="sessions" id="session-list">';
        for (var i = 0; i < sessions.length; i++) {
          var s = sessions[i];
          html += '<div class="session" data-id="' + esc(s.id) + '" onclick="loadSession(\\'';
          html += esc(s.id);
          html += '\\')">';
          html += '<div class="id">' + esc(s.id) + typeBadge(s.type) + statusBadge(s.status) + '</div>';
          html += '<div class="purpose">' + esc(s.purpose || 'No purpose set') + '</div>';
          html += '<div class="meta">';
          html += '<span class="meta-item">Replay: ' + (s.replayCount || 0) + '</span>';
          html += '<span class="meta-item">Evidence: ' + (s.evidenceCount || 0) + '</span>';
          if (s.lastActivity) {
            html += '<span class="meta-item timestamp" title="' + esc(formatDate(s.lastActivity)) + '">' + relativeTime(s.lastActivity) + '</span>';
          }
          html += '</div></div>';
        }
        html += '</div>';
        content.innerHTML = html;
      } catch (err) {
        document.getElementById('content').innerHTML = '<div class="error">Failed to load sessions: ' + esc(err.message) + '</div>';
      }
    }

    function filterSessionsLocal() {
      var query = (document.getElementById('session-filter').value || '').toLowerCase();
      var items = document.querySelectorAll('.session');
      for (var i = 0; i < items.length; i++) {
        var text = items[i].textContent.toLowerCase();
        items[i].style.display = text.indexOf(query) >= 0 ? '' : 'none';
      }
    }

    async function loadSession(id) {
      // Stop auto-refresh while viewing a single session
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }

      var content = document.getElementById('content');
      content.innerHTML = '<p class="loading">Loading session ' + esc(id) + '...</p>';

      try {
        var results = await Promise.all([
          authFetch(API + '/api/sessions/' + encodeURIComponent(id) + '/replay'),
          authFetch(API + '/api/sessions/' + encodeURIComponent(id) + '/evidence')
        ]);
        var replay = await results[0].json();
        var evidence = await results[1].json();

        var allEvents = [];
        for (var r = 0; r < replay.length; r++) {
          allEvents.push({ ts: replay[r].ts, tool: replay[r].tool, summary: replay[r].summary, type: 'replay' });
        }
        for (var e = 0; e < evidence.length; e++) {
          allEvents.push({ ts: evidence[e].ts, tool: evidence[e].evidenceId || evidence[e].type, summary: evidence[e].type || '', type: 'evidence' });
        }
        allEvents.sort(function(a, b) { return (a.ts || '').localeCompare(b.ts || ''); });

        var toolCounts = {};
        for (var i = 0; i < replay.length; i++) {
          var t = replay[i].tool || 'unknown';
          toolCounts[t] = (toolCounts[t] || 0) + 1;
        }
        var topTools = Object.entries(toolCounts).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 8);
        var uniqueToolCount = Object.keys(toolCounts).length;

        var html = '<a class="back" href="#" onclick="event.preventDefault(); startAutoRefresh(); loadSessions();">Back to sessions</a>';
        html += '<h2>Session: ' + esc(id) + '</h2>';

        html += '<div class="stats">';
        html += '<div class="stat"><div class="value">' + replay.length + '</div><div class="label">Tool calls</div></div>';
        html += '<div class="stat"><div class="value">' + evidence.length + '</div><div class="label">Evidence items</div></div>';
        html += '<div class="stat"><div class="value">' + uniqueToolCount + '</div><div class="label">Unique tools</div></div>';
        html += '</div>';

        if (topTools.length) {
          html += '<h2>Top Tools</h2><div class="top-tools">';
          for (var j = 0; j < topTools.length; j++) {
            html += '<span>' + esc(topTools[j][0]) + ': ' + topTools[j][1] + '</span>';
          }
          html += '</div>';
        }

        html += '<h2>Timeline (' + allEvents.length + ' events)</h2>';
        html += '<div class="timeline">';
        for (var k = 0; k < allEvents.length; k++) {
          var ev = allEvents[k];
          html += '<div class="event ' + ev.type + '">';
          html += '<span class="time">' + formatTime(ev.ts) + '</span>';
          html += '<span class="tool">' + esc(ev.tool || '') + '</span>';
          html += '<span class="summary">' + esc(ev.summary || '') + '</span>';
          html += '</div>';
        }
        html += '</div>';

        content.innerHTML = html;
      } catch (err) {
        content.innerHTML = '<a class="back" href="#" onclick="event.preventDefault(); startAutoRefresh(); loadSessions();">Back to sessions</a>' +
          '<div class="error">Failed to load session: ' + esc(err.message) + '</div>';
      }
    }

    function startAutoRefresh() {
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = setInterval(loadSessions, 30000);
    }

    // Initial load and auto-refresh every 30 seconds
    loadSessions();
    startAutoRefresh();
  </script>
</body>
</html>`;

// Self-contained HTML approvals page
const approvalsHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>EVOKORE HITL Approvals</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
    h1 { color: #38bdf8; margin-bottom: 8px; }
    h2 { color: #94a3b8; margin: 16px 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
    nav { margin-bottom: 20px; display: flex; gap: 16px; }
    nav a { color: #38bdf8; text-decoration: none; padding: 6px 14px; border-radius: 6px; border: 1px solid #334155; font-size: 14px; }
    nav a:hover, nav a.active { background: #1e293b; border-color: #38bdf8; }
    #app { max-width: 960px; margin: 0 auto; }
    .header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
    .auto-refresh-indicator { color: #64748b; font-size: 12px; }
    .auto-refresh-indicator .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #4ade80; margin-right: 4px; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .empty { color: #64748b; padding: 40px; text-align: center; }
    .error { color: #f87171; padding: 16px; background: #1e293b; border-radius: 8px; }
    .loading { color: #64748b; }
    .approvals { display: grid; gap: 12px; }
    .approval-card { background: #1e293b; border-radius: 8px; padding: 16px; border: 1px solid #334155; transition: border-color 0.15s; }
    .approval-card.status-pending { border-left: 3px solid #fcd34d; }
    .approval-card.status-denied { border-left: 3px solid #f87171; opacity: 0.7; }
    .approval-card.status-approved { border-left: 3px solid #4ade80; opacity: 0.7; }
    .approval-card .tool-name { color: #4ade80; font-weight: 600; font-size: 16px; font-family: monospace; }
    .approval-card .token-prefix { color: #94a3b8; font-family: monospace; font-size: 13px; margin-top: 4px; }
    .approval-card .session-context { color: #38bdf8; font-size: 13px; margin-top: 4px; font-family: monospace; }
    .approval-card .timing { color: #64748b; font-size: 13px; margin-top: 8px; }
    .approval-card .time-remaining { font-weight: 600; }
    .approval-card .approval-status { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600; margin-left: 8px; }
    .approval-status-pending { background: #78350f; color: #fcd34d; }
    .approval-status-denied { background: #7f1d1d; color: #fca5a5; }
    .approval-status-approved { background: #065f46; color: #6ee7b7; }
    .time-ok { color: #4ade80; }
    .time-warn { color: #fcd34d; }
    .time-danger { color: #f87171; }
    .approval-card .actions { margin-top: 12px; display: flex; gap: 8px; }
    .btn-deny { background: #991b1b; color: #fecaca; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; }
    .btn-deny:hover { background: #b91c1c; }
    .btn-deny:disabled { opacity: 0.5; cursor: not-allowed; }
    .stats { display: flex; gap: 24px; margin: 16px 0; flex-wrap: wrap; }
    .stat { background: #1e293b; padding: 12px 20px; border-radius: 8px; }
    .stat .value { font-size: 24px; font-weight: 700; color: #38bdf8; }
    .stat .label { color: #64748b; font-size: 12px; }
    .auto-refresh { color: #64748b; font-size: 12px; margin-top: 8px; }
    .denied-notice { color: #fcd34d; font-size: 12px; margin-top: 4px; }
    .last-updated { color: #475569; font-size: 11px; margin-top: 4px; }
    .ws-status { font-size: 12px; display: flex; align-items: center; gap: 6px; }
    .ws-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
    .ws-dot-live { background: #4ade80; }
    .ws-dot-reconnecting { background: #fcd34d; animation: pulse 1s infinite; }
    .ws-dot-polling { background: #64748b; }
  </style>
</head>
<body>
  <div id="app">
    <div class="header-row">
      <h1>EVOKORE HITL Approvals</h1>
      <span id="ws-status" class="ws-status"><span class="ws-dot ws-dot-polling"></span>Polling (5s)</span>
    </div>
    <nav>
      <a href="/">Sessions</a>
      <a href="/approvals" class="active">Approvals</a>
    </nav>
    <div id="content"><p class="loading">Loading pending approvals...</p></div>
    <div id="last-updated" class="last-updated"></div>
  </div>
  <script>
    var API = '';
    var pollTimer = null;
    var wsConnection = null;
    var wsReconnectDelay = 1000;
    var wsMaxReconnectDelay = 30000;
    var wsReconnectTimer = null;
    var wsConnected = false;
    var cachedApprovals = [];

    // Auth-aware fetch wrapper: injects Bearer token from sessionStorage
    function authFetch(url, opts) {
      opts = opts || {};
      opts.headers = opts.headers || {};
      var token = sessionStorage.getItem('evokore_dashboard_token');
      if (token) opts.headers['Authorization'] = 'Bearer ' + token;
      return fetch(url, opts).then(function(res) {
        if (res.status === 401 || res.status === 302) {
          sessionStorage.removeItem('evokore_dashboard_token');
          window.location.href = '/login';
          return Promise.reject(new Error('Unauthorized'));
        }
        return res;
      });
    }

    function esc(s) {
      if (!s) return '';
      var d = document.createElement('div');
      d.appendChild(document.createTextNode(String(s)));
      return d.innerHTML;
    }

    function formatTimeRemaining(expiresAt) {
      var remaining = expiresAt - Date.now();
      if (remaining <= 0) return { text: 'Expired', cls: 'time-danger' };
      var secs = Math.floor(remaining / 1000);
      var mins = Math.floor(secs / 60);
      secs = secs % 60;
      var text = mins + 'm ' + secs + 's';
      var cls = remaining > 120000 ? 'time-ok' : remaining > 30000 ? 'time-warn' : 'time-danger';
      return { text: text, cls: cls };
    }

    function formatDate(ts) {
      if (!ts) return '';
      try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
    }

    function updateWsStatus(state) {
      var el = document.getElementById('ws-status');
      if (!el) return;
      if (state === 'live') {
        el.innerHTML = '<span class="ws-dot ws-dot-live"></span>Live (WebSocket)';
      } else if (state === 'reconnecting') {
        el.innerHTML = '<span class="ws-dot ws-dot-reconnecting"></span>Reconnecting...';
      } else {
        el.innerHTML = '<span class="ws-dot ws-dot-polling"></span>Polling (5s)';
      }
    }

    async function denyToken(prefix) {
      var btn = document.getElementById('deny-' + prefix);
      if (btn) { btn.disabled = true; btn.textContent = 'Denying...'; }
      try {
        // Use WebSocket for deny when connected, HTTP fallback otherwise
        if (wsConnected && wsConnection && wsConnection.readyState === 1) {
          wsConnection.send(JSON.stringify({ type: 'deny', prefix: prefix }));
          // Optimistic UI: remove from cached approvals
          cachedApprovals = cachedApprovals.filter(function(a) {
            return a.token.replace('...', '') !== prefix;
          });
          renderApprovals(cachedApprovals);
        } else {
          var res = await authFetch(API + '/api/approvals/deny', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefix: prefix })
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          loadApprovals();
        }
      } catch (err) {
        if (btn) { btn.disabled = false; btn.textContent = 'Deny'; }
        alert('Failed to deny token: ' + err.message);
      }
    }

    function renderApprovals(approvals) {
      var content = document.getElementById('content');

      // Update timestamp
      var updated = document.getElementById('last-updated');
      if (updated) updated.textContent = 'Last updated: ' + new Date().toLocaleTimeString();

      var pendingCount = 0;
      var deniedCount = 0;
      for (var c = 0; c < approvals.length; c++) {
        if (approvals[c].denied) deniedCount++;
        else pendingCount++;
      }

      var html = '<div class="stats">';
      html += '<div class="stat"><div class="value">' + pendingCount + '</div><div class="label">Pending</div></div>';
      if (deniedCount > 0) {
        html += '<div class="stat"><div class="value">' + deniedCount + '</div><div class="label">Denied</div></div>';
      }
      html += '</div>';

      if (!approvals.length) {
        html += '<p class="empty">No pending approval tokens. Tokens appear here when a restricted tool is called and HITL approval is required.</p>';
        content.innerHTML = html;
        return;
      }

      html += '<div class="approvals">';
      for (var i = 0; i < approvals.length; i++) {
        var a = approvals[i];
        var tr = formatTimeRemaining(a.expiresAt);
        var tokenDisplay = esc(a.token);
        var cardStatus = a.denied ? 'status-denied' : 'status-pending';
        var statusLabel = a.denied
          ? '<span class="approval-status approval-status-denied">denied</span>'
          : '<span class="approval-status approval-status-pending">pending</span>';

        html += '<div class="approval-card ' + cardStatus + '">';
        html += '<div class="tool-name">' + esc(a.toolName) + statusLabel + '</div>';
        html += '<div class="token-prefix">Token: ' + tokenDisplay + '</div>';
        if (a.sessionId) {
          html += '<div class="session-context">Session: ' + esc(a.sessionId) + '</div>';
        }
        html += '<div class="timing">Created: ' + formatDate(a.createdAt) + ' | Remaining: <span class="time-remaining ' + tr.cls + '">' + tr.text + '</span></div>';

        if (!a.denied) {
          html += '<div class="actions">';
          html += '<button class="btn-deny" id="deny-' + esc(a.token.replace('...', '')) + '" onclick="denyToken(\\'' + esc(a.token.replace('...', '')) + '\\')">Deny</button>';
          html += '</div>';
        }
        html += '</div>';
      }
      html += '</div>';

      content.innerHTML = html;
    }

    async function loadApprovals() {
      try {
        var res = await authFetch(API + '/api/approvals');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var approvals = await res.json();
        cachedApprovals = approvals;
        renderApprovals(approvals);
      } catch (err) {
        document.getElementById('content').innerHTML = '<div class="error">Failed to load approvals: ' + esc(err.message) + '</div>';
      }
    }

    function startPolling() {
      if (pollTimer) return;
      pollTimer = setInterval(loadApprovals, 5000);
      updateWsStatus('polling');
    }

    function stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    // WebSocket connection with exponential backoff reconnection
    function connectWebSocket() {
      var token = sessionStorage.getItem('evokore_dashboard_token') || '';
      var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      var wsUrl = protocol + '//' + window.location.host + '/ws/approvals';
      if (token) wsUrl += '?token=' + encodeURIComponent(token);

      try {
        wsConnection = new WebSocket(wsUrl);
      } catch (e) {
        return; // WebSocket not available
      }

      wsConnection.onopen = function() {
        wsConnected = true;
        wsReconnectDelay = 1000; // Reset backoff
        stopPolling();
        updateWsStatus('live');
      };

      wsConnection.onmessage = function(event) {
        try {
          var msg = JSON.parse(event.data);
          if (msg.type === 'snapshot') {
            cachedApprovals = msg.approvals || [];
            renderApprovals(cachedApprovals);
          } else if (msg.type === 'approval_requested') {
            // Add new approval to cached list
            if (msg.data) {
              cachedApprovals.push(msg.data);
              renderApprovals(cachedApprovals);
            }
          } else if (msg.type === 'approval_denied') {
            // Remove denied approval from cached list
            if (msg.data && msg.data.prefix) {
              cachedApprovals = cachedApprovals.filter(function(a) {
                return !a.token.startsWith(msg.data.prefix);
              });
              renderApprovals(cachedApprovals);
            }
          } else if (msg.type === 'approval_granted') {
            // Remove granted approval from cached list
            if (msg.data && msg.data.token) {
              cachedApprovals = cachedApprovals.filter(function(a) {
                return a.token !== msg.data.token;
              });
              renderApprovals(cachedApprovals);
            }
          } else if (msg.type === 'pong') {
            // Heartbeat response, no action needed
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      wsConnection.onclose = function() {
        wsConnected = false;
        wsConnection = null;
        updateWsStatus('reconnecting');
        startPolling(); // Fall back to polling
        scheduleReconnect();
      };

      wsConnection.onerror = function() {
        // onclose will fire after onerror
      };
    }

    function scheduleReconnect() {
      if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
      wsReconnectTimer = setTimeout(function() {
        wsReconnectTimer = null;
        connectWebSocket();
      }, wsReconnectDelay);
      // Exponential backoff: 1s, 2s, 4s, 8s, ..., max 30s
      wsReconnectDelay = Math.min(wsReconnectDelay * 2, wsMaxReconnectDelay);
    }

    // Initial load via HTTP, then attempt WebSocket upgrade
    loadApprovals();
    startPolling();
    connectWebSocket();
  </script>
</body>
</html>`;

// Handle incoming HTTP requests
function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const isApi = url.pathname.startsWith('/api/');

  // Apply security headers to all responses
  applySecurityHeaders(res, isApi);

  // Check auth on all routes (public paths handled inside requireAuth)
  if (!requireAuth(req, res)) return;

  // Login page (public, only served when token auth is enabled)
  if (url.pathname === '/login') {
    if (!TOKEN_AUTH_ENABLED) {
      res.writeHead(302, { 'Location': '/' });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(loginHTML);
    return;
  }

  // API: auth status (public endpoint -- returns whether the request is authenticated)
  if (url.pathname === '/api/auth/status') {
    const token = extractBearerToken(req);
    const authenticated = !TOKEN_AUTH_ENABLED || (token ? validateBearerToken(token) : false);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      authenticated,
      mode: TOKEN_AUTH_ENABLED ? 'token' : 'local',
      role: authenticated ? DASHBOARD_ROLE : null
    }));
    return;
  }

  // Dashboard HTML (requires readonly)
  if (url.pathname === '/' || url.pathname === '/dashboard') {
    if (!requireRole(res, 'readonly')) return;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(dashboardHTML);
    return;
  }

  // Approvals HTML page (requires developer)
  if (url.pathname === '/approvals') {
    if (!requireRole(res, 'developer')) return;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(approvalsHTML);
    return;
  }

  // API: session type counts (requires readonly)
  if (url.pathname === '/api/sessions/types') {
    if (!requireRole(res, 'readonly')) return;
    const counts = getSessionTypeCounts();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(counts));
    return;
  }

  // API: list sessions (requires readonly)
  if (url.pathname === '/api/sessions') {
    if (!requireRole(res, 'readonly')) return;
    const filters = {};
    const statusParam = url.searchParams.get('status');
    const sinceParam = url.searchParams.get('since');
    const typeParam = url.searchParams.get('type');
    if (statusParam) filters.status = statusParam;
    if (sinceParam) filters.since = sinceParam;
    if (typeParam) filters.type = typeParam;
    const sessions = listSessions(Object.keys(filters).length ? filters : null);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(sessions));
    return;
  }

  // API: list pending approvals (requires developer)
  if (url.pathname === '/api/approvals' && req.method === 'GET') {
    if (!requireRole(res, 'developer')) return;
    const approvals = readPendingApprovals();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(approvals));
    return;
  }

  // API: deny a token (requires admin)
  if (url.pathname === '/api/approvals/deny' && req.method === 'POST') {
    if (!requireRole(res, 'admin')) return;
    readBody(req).then(body => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }

      const prefix = sanitizeTokenPrefix(parsed.prefix);
      if (!prefix || prefix.length < 4) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid token prefix (must be at least 4 hex characters)' }));
        return;
      }

      const success = denyTokenPrefix(prefix);
      if (success) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, denied: prefix }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to write denial' }));
      }
    }).catch(err => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // API: get replay events for a session (requires readonly)
  const replayMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/replay$/);
  if (replayMatch) {
    if (!requireRole(res, 'readonly')) return;
    const id = sanitizeSessionId(decodeURIComponent(replayMatch[1]));
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid session ID' }));
      return;
    }
    const events = readJsonl(path.join(SESSIONS_DIR, id + '-replay.jsonl'));
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(events));
    return;
  }

  // API: get evidence events for a session (requires readonly)
  const evidenceMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/evidence$/);
  if (evidenceMatch) {
    if (!requireRole(res, 'readonly')) return;
    const id = sanitizeSessionId(decodeURIComponent(evidenceMatch[1]));
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid session ID' }));
      return;
    }
    const events = readJsonl(path.join(SESSIONS_DIR, id + '-evidence.jsonl'));
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(events));
    return;
  }

  // API: audit log entries (requires admin)
  if (url.pathname === '/api/audit' && req.method === 'GET') {
    if (!requireRole(res, 'admin')) return;
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 1000);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
    const entries = readAuditEntries(limit, offset);
    applySecurityHeaders(res, true);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(entries));
    return;
  }

  // API: audit summary counts (requires admin)
  if (url.pathname === '/api/audit/summary' && req.method === 'GET') {
    if (!requireRole(res, 'admin')) return;
    const summary = getAuditSummary();
    applySecurityHeaders(res, true);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(summary));
    return;
  }

  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

// Export internals for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateBearerToken,
    extractBearerToken,
    isRateLimited,
    recordAuthFailure,
    hasRole,
    ROLE_LEVEL,
    authFailures,
    SECURITY_HEADERS,
    API_SECURITY_HEADERS,
    TOKEN_AUTH_ENABLED,
    DASHBOARD_ROLE,
    handleRequest,
    readAuditEntries,
    getAuditSummary
  };
}

const server = http.createServer(handleRequest);
server.listen(PORT, '127.0.0.1', () => {
  console.log('EVOKORE Dashboard running at http://127.0.0.1:' + PORT);
  console.log('Hook sessions directory: ' + SESSIONS_DIR);
  console.log('HTTP sessions directory: ' + SESSION_STORE_DIR);
  console.log('Approvals page: http://127.0.0.1:' + PORT + '/approvals');
  if (TOKEN_AUTH_ENABLED) {
    console.log('Authentication: ENABLED (Bearer Token)');
    console.log('Role: ' + DASHBOARD_ROLE);
  } else {
    console.log('Authentication: DISABLED (local-only mode)');
    console.log('  WARNING: No authentication configured. Set EVOKORE_DASHBOARD_TOKEN to enable.');
    console.log('Role: ' + DASHBOARD_ROLE + ' (default for local-only mode)');
  }
  console.log('Press Ctrl+C to stop');
});
