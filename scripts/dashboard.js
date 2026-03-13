#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.EVOKORE_DASHBOARD_PORT || '8899', 10);
const SESSIONS_DIR = path.join(os.homedir(), '.evokore', 'sessions');

// Sanitize session IDs to prevent path traversal
function sanitizeSessionId(id) {
  if (!id || typeof id !== 'string') return '';
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
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

// Self-contained HTML dashboard
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

// Handle incoming HTTP requests
function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');

  // Dashboard HTML
  if (url.pathname === '/' || url.pathname === '/dashboard') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(dashboardHTML);
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
  console.log('Press Ctrl+C to stop');
});
