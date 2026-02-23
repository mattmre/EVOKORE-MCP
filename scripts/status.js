const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const https = require('https');

const CACHE_DIR = path.join(os.homedir(), '.evokore', 'cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

const LOC_CACHE = path.join(CACHE_DIR, 'location.json');
const WEATHER_CACHE = path.join(CACHE_DIR, 'weather.json');

const RESET = '\x1b[0m';
const C = {
  SLATE_300: '\x1b[38;2;203;213;225m',
  SLATE_400: '\x1b[38;2;148;163;184m',
  SLATE_500: '\x1b[38;2;100;116;139m',
  SLATE_600: '\x1b[38;2;71;85;105m',
  EMERALD: '\x1b[38;2;74;222;128m',
  ROSE: '\x1b[38;2;251;113;133m',
  PAI_P: '\x1b[38;2;30;58;138m',
  PAI_A: '\x1b[38;2;59;130;246m',
  PAI_I: '\x1b[38;2;147;197;253m',
  PAI_LABEL: '\x1b[38;2;100;116;139m',
  PAI_CITY: '\x1b[38;2;147;197;253m',
  PAI_STATE: '\x1b[38;2;100;116;139m',
  PAI_TIME: '\x1b[38;2;96;165;250m',
  PAI_WEATHER: '\x1b[38;2;135;206;235m',
  GIT_PRIMARY: '\x1b[38;2;56;189;248m',
  GIT_VALUE: '\x1b[38;2;186;230;253m',
  GIT_DIR: '\x1b[38;2;147;197;253m',
  GIT_CLEAN: '\x1b[38;2;125;211;252m',
  GIT_MODIFIED: '\x1b[38;2;96;165;250m',
  GIT_ADDED: '\x1b[38;2;59;130;246m',
  GIT_STASH: '\x1b[38;2;165;180;252m',
  CTX_PRIMARY: '\x1b[38;2;129;140;248m',
  CTX_SECONDARY: '\x1b[38;2;165;180;252m',
  CTX_BUCKET_EMPTY: '\x1b[38;2;75;82;95m',
  ORANGE: '\x1b[38;2;251;146;60m',
  AMBER: '\x1b[38;2;251;191;36m'
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 2000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

function getBucketColor(pos, max) {
  const pct = Math.floor((pos * 100) / max);
  let r, g, b;
  if (pct <= 33) {
    r = Math.floor(74 + (250 - 74) * pct / 33);
    g = Math.floor(222 + (204 - 222) * pct / 33);
    b = Math.floor(128 + (21 - 128) * pct / 33);
  } else if (pct <= 66) {
    const t = pct - 33;
    r = Math.floor(250 + (251 - 250) * t / 33);
    g = Math.floor(204 + (146 - 204) * t / 33);
    b = Math.floor(21 + (60 - 21) * t / 33);
  } else {
    const t = pct - 66;
    r = Math.floor(251 + (239 - 251) * t / 34);
    g = Math.floor(146 + (68 - 146) * t / 34);
    b = Math.floor(60 + (68 - 60) * t / 34);
  }
  return \x1b[38;2;\;\;\m;
}

function renderContextBar(width, pct) {
  const filled = Math.floor((pct * width) / 100);
  const useSpacing = width <= 20;
  let output = '';
  
  for (let i = 1; i <= width; i++) {
    if (i <= filled) {
      output += getBucketColor(i, width) + '¦' + RESET;
    } else {
      output += C.CTX_BUCKET_EMPTY + '¦' + RESET;
    }
    if (useSpacing) output += ' ';
  }
  return output.trimRight();
}

function getGitStatus() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim() || 'detached';
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).split('\n');
    
    let modified = 0, staged = 0, untracked = 0;
    status.forEach(line => {
      if (!line) return;
      if (line.match(/^.[MDRC]/)) modified++;
      if (line.match(/^[MADRC]/)) staged++;
      if (line.match(/^\?\?/)) untracked++;
    });
    
    const totalChanged = modified + staged;
    const stashCountRaw = execSync('git stash list', { encoding: 'utf8' }).trim();
    const stashCount = stashCountRaw ? stashCountRaw.split('\n').length : 0;
    
    return { isGit: true, branch, modified, staged, untracked, totalChanged, stashCount };
  } catch (e) {
    return { isGit: false };
  }
}

async function getLocation() {
  try {
    if (fs.existsSync(LOC_CACHE)) {
      const stats = fs.statSync(LOC_CACHE);
      if (Date.now() - stats.mtimeMs < 3600000) return JSON.parse(fs.readFileSync(LOC_CACHE, 'utf8'));
    }
    const data = await fetchJson('http://ip-api.com/json/?fields=city,regionName,lat,lon');
    if (data && data.city) {
      fs.writeFileSync(LOC_CACHE, JSON.stringify(data));
      return data;
    }
  } catch (e) {}
  return { city: 'Unknown', regionName: '' };
}

async function getWeather(lat, lon) {
  if (!lat || !lon) return '?';
  try {
    if (fs.existsSync(WEATHER_CACHE)) {
      const stats = fs.statSync(WEATHER_CACHE);
      if (Date.now() - stats.mtimeMs < 900000) return fs.readFileSync(WEATHER_CACHE, 'utf8');
    }
    const data = await fetchJson(https://api.open-meteo.com/v1/forecast?latitude=\&longitude=\&current=temperature_2m,weather_code&temperature_unit=celsius);
    if (data && data.current) {
      const temp = Math.round(data.current.temperature_2m);
      const code = data.current.weather_code;
      let cond = 'Clear';
      if ([1,2,3].includes(code)) cond = 'Cloudy';
      else if ([45,48].includes(code)) cond = 'Foggy';
      else if ([51,53,55,56,57].includes(code)) cond = 'Drizzle';
      else if ([61,63,65,66,67].includes(code)) cond = 'Rain';
      else if ([71,73,75,77,85,86].includes(code)) cond = 'Snow';
      else if ([95,96,99].includes(code)) cond = 'Storm';
      
      const str = \°C \;
      fs.writeFileSync(WEATHER_CACHE, str);
      return str;
    }
  } catch (e) {}
  return '?';
}

function getTerminalWidth() {
  return process.stdout.columns || 80;
}

let inputData = '';
process.stdin.on('data', chunk => inputData += chunk);

process.stdin.on('end', async () => {
  try {
    let payload = {};
    if (inputData.trim()) {
      try { payload = JSON.parse(inputData); } catch (e) {}
    }

    const width = getTerminalWidth();
    let mode = 'normal';
    if (width < 35) mode = 'nano';
    else if (width < 55) mode = 'micro';
    else if (width < 80) mode = 'mini';

    const cwd = payload?.workspace?.current_dir || payload?.cwd || process.cwd();
    const dirName = path.basename(cwd);
    const modelName = payload?.model?.display_name || payload?.model || 'EVOKORE';
    const ccVersion = payload?.version || '2.0.0';
    const durationMs = payload?.cost?.total_duration_ms || 0;
    
    let inputTokens = payload?.context_window?.current_usage?.input_tokens || 0;
    const outputTokens = payload?.context_window?.current_usage?.output_tokens || 0;
    const maxTokens = payload?.context_window?.context_window_size || 200000;
    let contextPct = payload?.context_window?.used_percentage || 0;
    
    if (contextPct === 0 && inputTokens > 0) {
      contextPct = Math.round(((inputTokens + outputTokens) / maxTokens) * 100);
    }

    // Fetch parallel data
    const [loc, git] = await Promise.all([getLocation(), getGitStatus()]);
    const weather = await getWeather(loc.lat, loc.lon);
    
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

    // Try to get EVOKORE-MCP local skill count
    let skillsCount = 200;
    let catCount = 10;
    try {
        const skillsDir = path.resolve(__dirname, '../SKILLS');
        const categories = fs.readdirSync(skillsDir);
        let count = 0;
        let cCount = 0;
        for (const cat of categories) {
            if (fs.statSync(path.join(skillsDir, cat)).isDirectory()) {
                cCount++;
                count += fs.readdirSync(path.join(skillsDir, cat)).length;
            }
        }
        if (count > 0) { skillsCount = count; catCount = cCount; }
    } catch (e) {}

    // PRINTING
    const sep = \------------------------------------------------------------------------\;
    
    // Line 0: Header
    let l0 = '';
    const brand = \--\ \E\V\O\ \STATUSLINE\ \—;
    if (mode === 'normal') {
      l0 += \ --------------------------------------------------\\n;
      l0 += \LOC:\ \\\\,\ \\\ \·\ \\\ \·\ \\\\n;
      l0 += \ENV:\ \CC:\ \\\ \·\ \MDL:\\\ \·\ \SK:\ \\\ \·\ \CAT:\ \\\\n;
    } else {
      l0 += \ --------\\n;
      l0 += \LOC:\ \\\ \·\ \\\\n;
      l0 += \ENV:\ \CC:\ \\\ \·\ \MDL:\\\\n;
    }
    
    console.log();
    console.log(l0 + sep);

    // Line 1: Context
    let pctColor = C.EMERALD;
    if (contextPct >= 80) pctColor = C.ROSE;
    else if (contextPct >= 60) pctColor = C.ORANGE;
    else if (contextPct >= 40) pctColor = C.AMBER;
    
    let barWidth = 16;
    if (mode === 'nano') barWidth = 5;
    else if (mode === 'micro') barWidth = 6;
    else if (mode === 'mini') barWidth = 8;
    
    const bar = renderContextBar(barWidth, contextPct);
    let l1 = '';
    if (mode === 'normal' || mode === 'mini') {
      l1 = \?\ \CONTEXT:\ \ \\%\;
    } else {
      l1 = \?\ \ \\%\;
    }
    console.log(l1);
    console.log(sep);

    // Line 2: Git Status
    if (git.isGit) {
      let l2 = '';
      const gitIcon = (git.totalChanged > 0 || git.untracked > 0) ? '*' : '?';
      if (mode === 'normal') {
        l2 += \?\ \PWD:\ \\\ \·\ \Branch:\ \\\;
        if (git.stashCount > 0) l2 +=  \·\ \Stash:\ \\\;
        if (git.totalChanged > 0 || git.untracked > 0) {
          l2 +=  \·\ ;
          if (git.totalChanged > 0) l2 += \Mod:\ \\\;
          if (git.untracked > 0) l2 +=  \New:\ \\\;
        } else {
          l2 +=  \·\ \? clean\;
        }
      } else {
        l2 += \?\ \\\ \·\ \\\ ;
        if (gitIcon === '?') l2 += \\\;
        else l2 += \\\\;
      }
      console.log(l2);
      console.log(sep);
    } else {
      console.log(\?\ \PWD:\ \\\);
      console.log(sep);
    }
  } catch (error) {
    console.log(\Status Line Error: \\);
  }
});
