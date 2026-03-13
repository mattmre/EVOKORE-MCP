#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.EVOKORE_DASHBOARD_PORT || '8899', 10);
const SESSIONS_DIR = path.join(os.homedir(), '.evokore', 'sessions');
const EVOKORE_STATE_DIR = path.join(os.homedir(), '.evokore');
const PENDING_APPROVALS_FILE = path.join(EVOKORE_STATE_DIR, 'pending-approvals.json');
const DENIED_TOKENS_FILE = path.join(EVOKORE_STATE_DIR, 'denied-tokens.json');

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

// List all sessions with metadata
function listSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  const files = fs.readdirSync(SESSIONS_DIR);

  // Manifest files are {sessionId}.json without hyphens in the base name
  // (replay/evidence/tasks files all have a hyphen before their suffix)
  const manifestFiles = files.filter(f => {
    if (!f.endsWith('.json')) return false;
    const base = f.replace('.json', '');
    // Exclude files like {id}-tasks.json, {id}-evidence.jsonl etc.
    // A manifest file should not end with -tasks, -replay, -evidence
    return !base.endsWith('-tasks');
  });

  return manifestFiles.map(f => {
    const id = f.replace('.json', '');
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'));
      const replayFile = path.join(SESSIONS_DIR, id + '-replay.jsonl');
      const evidenceFile = path.join(SESSIONS_DIR, id + '-evidence.jsonl');
      return {
        id,
        purpose: manifest.purpose || null,
        status: manifest.status || null,
        replayCount: countLines(replayFile),
        evidenceCount: countLines(evidenceFile),
        lastActivity: manifest.lastActivityAt || manifest.lastActivity || null
      };
    } catch {
      return { id, purpose: null, status: null, replayCount: 0, evidenceCount: 0, lastActivity: null };
    }
  }).sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || ''));
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
    h1 { color: #38bdf8; margin-bottom: 20px; }
    h2 { color: #94a3b8; margin: 16px 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
    nav { margin-bottom: 20px; display: flex; gap: 16px; }
    nav a { color: #38bdf8; text-decoration: none; padding: 6px 14px; border-radius: 6px; border: 1px solid #334155; font-size: 14px; }
    nav a:hover, nav a.active { background: #1e293b; border-color: #38bdf8; }
    .sessions { display: grid; gap: 12px; }
    .session { background: #1e293b; border-radius: 8px; padding: 16px; cursor: pointer; border: 1px solid #334155; transition: border-color 0.15s; }
    .session:hover { border-color: #38bdf8; }
    .session .id { color: #38bdf8; font-weight: 600; font-family: monospace; }
    .session .purpose { color: #cbd5e1; margin-top: 4px; }
    .session .meta { color: #64748b; font-size: 13px; margin-top: 4px; }
    .session .status-badge { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 4px; margin-left: 8px; }
    .status-active { background: #065f46; color: #6ee7b7; }
    .status-awaiting { background: #78350f; color: #fcd34d; }
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
    .filter-bar { margin-bottom: 16px; }
    .filter-bar input { background: #1e293b; border: 1px solid #334155; color: #e2e8f0; padding: 8px 12px; border-radius: 6px; width: 100%; max-width: 400px; font-size: 14px; }
    .filter-bar input:focus { outline: none; border-color: #38bdf8; }
  </style>
</head>
<body>
  <div id="app">
    <h1>EVOKORE Session Dashboard</h1>
    <nav>
      <a href="/" class="active">Sessions</a>
      <a href="/approvals">Approvals</a>
    </nav>
    <div id="content"><p class="loading">Loading sessions...</p></div>
  </div>
  <script>
    var API = '';

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

    async function loadSessions() {
      try {
        var res = await fetch(API + '/api/sessions');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var sessions = await res.json();
        var content = document.getElementById('content');

        if (!sessions.length) {
          content.innerHTML = '<p class="empty">No sessions found in ~/.evokore/sessions/</p>';
          return;
        }

        var html = '<div class="filter-bar"><input type="text" id="session-filter" placeholder="Filter sessions..." oninput="filterSessions()"></div>';
        html += '<div class="sessions" id="session-list">';
        for (var i = 0; i < sessions.length; i++) {
          var s = sessions[i];
          html += '<div class="session" data-id="' + esc(s.id) + '" onclick="loadSession(\\'';
          html += esc(s.id);
          html += '\\')">';
          html += '<div class="id">' + esc(s.id) + statusBadge(s.status) + '</div>';
          html += '<div class="purpose">' + esc(s.purpose || 'No purpose set') + '</div>';
          html += '<div class="meta">Replay: ' + (s.replayCount || 0) + ' events | Evidence: ' + (s.evidenceCount || 0) + ' items';
          if (s.lastActivity) html += ' | Last: ' + formatDate(s.lastActivity);
          html += '</div></div>';
        }
        html += '</div>';
        content.innerHTML = html;
      } catch (err) {
        document.getElementById('content').innerHTML = '<div class="error">Failed to load sessions: ' + esc(err.message) + '</div>';
      }
    }

    function filterSessions() {
      var query = (document.getElementById('session-filter').value || '').toLowerCase();
      var items = document.querySelectorAll('.session');
      for (var i = 0; i < items.length; i++) {
        var text = items[i].textContent.toLowerCase();
        items[i].style.display = text.indexOf(query) >= 0 ? '' : 'none';
      }
    }

    async function loadSession(id) {
      var content = document.getElementById('content');
      content.innerHTML = '<p class="loading">Loading session ' + esc(id) + '...</p>';

      try {
        var results = await Promise.all([
          fetch(API + '/api/sessions/' + encodeURIComponent(id) + '/replay'),
          fetch(API + '/api/sessions/' + encodeURIComponent(id) + '/evidence')
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

        var html = '<a class="back" href="#" onclick="event.preventDefault(); loadSessions();">Back to sessions</a>';
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
        content.innerHTML = '<a class="back" href="#" onclick="event.preventDefault(); loadSessions();">Back to sessions</a>' +
          '<div class="error">Failed to load session: ' + esc(err.message) + '</div>';
      }
    }

    loadSessions();
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
    h1 { color: #38bdf8; margin-bottom: 20px; }
    h2 { color: #94a3b8; margin: 16px 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
    nav { margin-bottom: 20px; display: flex; gap: 16px; }
    nav a { color: #38bdf8; text-decoration: none; padding: 6px 14px; border-radius: 6px; border: 1px solid #334155; font-size: 14px; }
    nav a:hover, nav a.active { background: #1e293b; border-color: #38bdf8; }
    #app { max-width: 960px; margin: 0 auto; }
    .empty { color: #64748b; padding: 40px; text-align: center; }
    .error { color: #f87171; padding: 16px; background: #1e293b; border-radius: 8px; }
    .loading { color: #64748b; }
    .approvals { display: grid; gap: 12px; }
    .approval-card { background: #1e293b; border-radius: 8px; padding: 16px; border: 1px solid #334155; }
    .approval-card .tool-name { color: #4ade80; font-weight: 600; font-size: 16px; font-family: monospace; }
    .approval-card .token-prefix { color: #94a3b8; font-family: monospace; font-size: 13px; margin-top: 4px; }
    .approval-card .timing { color: #64748b; font-size: 13px; margin-top: 8px; }
    .approval-card .time-remaining { font-weight: 600; }
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
  </style>
</head>
<body>
  <div id="app">
    <h1>EVOKORE HITL Approvals</h1>
    <nav>
      <a href="/">Sessions</a>
      <a href="/approvals" class="active">Approvals</a>
    </nav>
    <p class="auto-refresh">Auto-refreshes every 5 seconds</p>
    <div id="content"><p class="loading">Loading pending approvals...</p></div>
  </div>
  <script>
    var API = '';
    var pollTimer = null;

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

    async function denyToken(prefix) {
      var btn = document.getElementById('deny-' + prefix);
      if (btn) { btn.disabled = true; btn.textContent = 'Denying...'; }
      try {
        var res = await fetch(API + '/api/approvals/deny', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix: prefix })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        loadApprovals();
      } catch (err) {
        if (btn) { btn.disabled = false; btn.textContent = 'Deny'; }
        alert('Failed to deny token: ' + err.message);
      }
    }

    async function loadApprovals() {
      try {
        var res = await fetch(API + '/api/approvals');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var approvals = await res.json();
        var content = document.getElementById('content');

        var html = '<div class="stats">';
        html += '<div class="stat"><div class="value">' + approvals.length + '</div><div class="label">Pending approvals</div></div>';
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
          html += '<div class="approval-card">';
          html += '<div class="tool-name">' + esc(a.toolName) + '</div>';
          html += '<div class="token-prefix">Token: ' + tokenDisplay + '</div>';
          html += '<div class="timing">Created: ' + formatDate(a.createdAt) + ' | Remaining: <span class="time-remaining ' + tr.cls + '">' + tr.text + '</span></div>';
          html += '<div class="actions">';
          html += '<button class="btn-deny" id="deny-' + esc(a.token.replace('...', '')) + '" onclick="denyToken(\\'' + esc(a.token.replace('...', '')) + '\\')">Deny</button>';
          html += '</div>';
          html += '</div>';
        }
        html += '</div>';

        content.innerHTML = html;
      } catch (err) {
        document.getElementById('content').innerHTML = '<div class="error">Failed to load approvals: ' + esc(err.message) + '</div>';
      }
    }

    // Initial load and auto-refresh
    loadApprovals();
    pollTimer = setInterval(loadApprovals, 5000);
  </script>
</body>
</html>`;

// Handle incoming HTTP requests
function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');

  // Dashboard HTML
  if (url.pathname === '/' || url.pathname === '/dashboard') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(dashboardHTML);
    return;
  }

  // Approvals HTML page
  if (url.pathname === '/approvals') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(approvalsHTML);
    return;
  }

  // API: list sessions
  if (url.pathname === '/api/sessions') {
    const sessions = listSessions();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify(sessions));
    return;
  }

  // API: list pending approvals
  if (url.pathname === '/api/approvals' && req.method === 'GET') {
    const approvals = readPendingApprovals();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify(approvals));
    return;
  }

  // API: deny a token
  if (url.pathname === '/api/approvals/deny' && req.method === 'POST') {
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

  // API: get replay events for a session
  const replayMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/replay$/);
  if (replayMatch) {
    const id = sanitizeSessionId(decodeURIComponent(replayMatch[1]));
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid session ID' }));
      return;
    }
    const events = readJsonl(path.join(SESSIONS_DIR, id + '-replay.jsonl'));
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify(events));
    return;
  }

  // API: get evidence events for a session
  const evidenceMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/evidence$/);
  if (evidenceMatch) {
    const id = sanitizeSessionId(decodeURIComponent(evidenceMatch[1]));
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid session ID' }));
      return;
    }
    const events = readJsonl(path.join(SESSIONS_DIR, id + '-evidence.jsonl'));
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify(events));
    return;
  }

  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

const server = http.createServer(handleRequest);
server.listen(PORT, '127.0.0.1', () => {
  console.log('EVOKORE Dashboard running at http://127.0.0.1:' + PORT);
  console.log('Sessions directory: ' + SESSIONS_DIR);
  console.log('Approvals page: http://127.0.0.1:' + PORT + '/approvals');
  console.log('Press Ctrl+C to stop');
});
