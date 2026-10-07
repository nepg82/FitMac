// api.js — on-screen log + minimal GitHub contents API helper.
// Reads use the raw media type (no 1 MB limit); file shas come from a directory listing.
const Log = (() => {
  const lines = [];
  const box = () => document.getElementById('console-lines');
  function redact(s) {
    const t = (JSON.parse(localStorage.getItem('fitmac-tablet-cfg') || '{}')).token;
    return t ? String(s).split(t).join('***') : String(s);
  }
  function add(msg, cls = '') {
    const t = new Date().toLocaleTimeString([], { hour12: false });
    lines.push({ t, msg: redact(msg), cls });
    if (lines.length > 300) lines.shift();
    const b = box(); if (!b) return;
    const d = document.createElement('div');
    d.innerHTML = `<span class="t">${t}</span> <span class="${cls}"></span>`;
    d.lastChild.textContent = redact(msg);
    b.appendChild(d); b.scrollTop = b.scrollHeight;
  }
  const text = () => lines.map(l => `${l.t} ${l.msg}`).join('\n');
  function clear() { lines.length = 0; const b = box(); if (b) b.innerHTML = ''; }
  return { add, text, clear };
})();

const GH = (() => {
  const TIMEOUT = 20000;
  const cfg = () => JSON.parse(localStorage.getItem('fitmac-tablet-cfg') || 'null');
  const q = c => (c.branch ? `?ref=${encodeURIComponent(c.branch)}` : '');
  const b64 = s => { let b = ''; new TextEncoder().encode(s).forEach(x => b += String.fromCharCode(x)); return btoa(b); };

  async function req(path, { method = 'GET', body, raw = false } = {}) {
    const c = cfg();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    const t0 = performance.now();
    Log.add(`→ ${method} ${path}${raw ? ' (raw)' : ''}`);
    let res;
    try {
      res = await fetch('https://api.github.com' + path, {
        method, signal: ctrl.signal, cache: 'no-store',
        headers: {
          Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
          Authorization: 'Bearer ' + c.token,
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      const m = e.name === 'AbortError' ? `timed out after ${TIMEOUT / 1000}s` : e.message;
      Log.add(`✗ ${m}`, 'err');
      throw new Error(m);
    } finally { clearTimeout(timer); }
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) {
      let d = ''; try { d = (await res.json()).message; } catch (_) {}
      Log.add(`✗ ${res.status} ${d} (${ms}ms)`, 'err');
      const err = new Error(`GitHub ${res.status}${d ? ': ' + d : ''}`); err.status = res.status; throw err;
    }
    Log.add(`← ${res.status} (${ms}ms)`, 'ok');
    return raw ? res.text() : res.json();
  }

  // { 'nick.json': sha, ... } for the data/ folder
  async function shas() {
    const c = cfg();
    try {
      const list = await req(`/repos/${c.owner}/${c.repo}/contents/data${q(c)}`);
      return Object.fromEntries((Array.isArray(list) ? list : []).map(f => [f.name, f.sha]));
    } catch (e) { if (e.status === 404) return {}; throw e; }
  }

  // Returns { json, sha } — json/sha are null if the user has no file yet.
  async function loadUser(user) {
    const c = cfg();
    const sha = (await shas())[user + '.json'];
    if (!sha) { Log.add(`${user}.json not found (new file will be created)`, 'warn'); return { json: null, sha: null }; }
    const text = await req(`/repos/${c.owner}/${c.repo}/contents/data/${user}.json${q(c)}`, { raw: true });
    const json = JSON.parse(text);
    Log.add(`${user}.json: ${(text.length / 1024).toFixed(1)} KB, ${(json.workoutSessions || []).length} sessions, sha ${sha.slice(0, 7)}`);
    return { json, sha };
  }

  async function putUser(user, json, sha, message) {
    const c = cfg();
    const res = await req(`/repos/${c.owner}/${c.repo}/contents/data/${user}.json`, {
      method: 'PUT',
      body: { message, content: b64(JSON.stringify(json, null, 2)), sha: sha || undefined, branch: c.branch || undefined }
    });
    Log.add(`${user}.json written, new sha ${(res.content && res.content.sha || '?').slice(0, 7)}`, 'ok');
    return res;
  }

  async function verify() {
    const c = cfg();
    const r = await req(`/repos/${c.owner}/${c.repo}`);
    const s = await shas();
    return { name: r.full_name, files: Object.keys(s) };
  }

  return { cfg, loadUser, putUser, verify };
})();
