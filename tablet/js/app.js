// app.js — FitMac Gym: log one workout for two people, write both files to GitHub.
const LS = { legacyCfg: 'fitmac-tablet-cfg', users: 'fitmac-tablet-users', draft: 'fitmac-tablet-draft', hist: 'fitmac-tablet-hist' };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

let names = JSON.parse(localStorage.getItem(LS.users) || 'null') || { u1: 'nick', u2: 'elle' };
let users = [], hist = {}, histLocs = [], histSource = '';
let draft = null, editing = null, saving = false;

function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2500); }
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';

// ---------- Draft ----------
function newDraft(keep = {}) {
  return { name: keep.name || 'daily workout', date: todayISO(), location: keep.location || '', ids: [uuid(), uuid()], sent: [false, false], exercises: [] };
}
const saveDraft = () => localStorage.setItem(LS.draft, JSON.stringify(draft));
const locked = () => draft.sent.some(Boolean);

// ---------- History ----------
async function loadHistory() {
  Log.add('Loading history for both users…');
  try {
    if (!(await GH.loadCfg())) throw new Error('no GitHub settings in the main app');
    const packed = {}, locs = new Set();
    for (const u of users) {
      const { json } = await GH.loadUser(u);
      const h = History.build(json);
      hist[u] = h.idx; packed[u] = History.pack(h);
      h.locs.forEach(l => locs.add(l));
    }
    histLocs = [...locs].sort(); histSource = 'live';
    localStorage.setItem(LS.hist, JSON.stringify({ packed, at: Date.now() }));
  } catch (e) {
    const c = JSON.parse(localStorage.getItem(LS.hist) || 'null');
    if (c) {
      const locs = new Set();
      for (const u of users) if (c.packed[u]) { const h = History.unpack(c.packed[u]); hist[u] = h.idx; h.locs.forEach(l => locs.add(l)); }
      histLocs = [...locs].sort(); histSource = 'cached ' + new Date(c.at).toLocaleString();
      Log.add('History fetch failed — using cached copy from ' + new Date(c.at).toLocaleString(), 'warn');
    } else { histSource = 'none'; Log.add('History fetch failed and no cache: ' + e.message, 'err'); }
  }
  fillDatalist(); updateHints(); renderStatus();
}

// ---------- UI ----------
function buildCols() {
  $('#cols').innerHTML = users.map((u, i) => `
    <div class="col" id="col${i}">
      <div class="colhead"><b>${esc(cap(u))}</b><label><input type="checkbox" id="skip${i}" /> skip</label></div>
      <div class="hint" id="hl${i}"></div><div class="hint" id="hm${i}"></div>
      <div class="fields">
        ${['sets', 'reps', 'weight'].map(f => `<div><small>${f === 'weight' ? 'lbs' : f}</small><input id="${f}${i}" type="number" inputmode="numeric" pattern="[0-9]*" /></div>`).join('')}
      </div>
    </div>`).join('');
  users.forEach((_, i) => $('#skip' + i).onchange = () => $('#col' + i).classList.toggle('off', $('#skip' + i).checked));
}

function updateHints() {
  const k = History.key($('#ex-name').value);
  users.forEach((u, i) => {
    const s = k && hist[u] ? History.summarize(hist[u].get(k)) : null;
    $('#hl' + i).innerHTML = s ? `Last <b>${History.fmtLast(s.last)}</b>` : (k && hist[u] && hist[u].has(k) ? '' : (k ? 'No history' : ''));
    $('#hm' + i).innerHTML = s ? `Max <b>${History.fmtMax(s.max)}</b>` : '';
  });
}

function fillDatalist() {
  const names = new Map();
  for (const u of users) for (const v of (hist[u] || new Map()).values()) names.set(History.key(v.name), v.name);
  $('#ex-names').innerHTML = [...names.values()].sort().map(n => `<option value="${esc(n)}">`).join('');
  $('#loc-names').innerHTML = histLocs.map(l => `<option value="${esc(l)}">`).join('');
}

const fmtP = p => {
  if (!p) return '<span class="skipped">—</span>';
  const parts = `${p.sets || '–'}×${p.reps || '–'}${p.weight ? ' @ ' + p.weight : ''}`;
  return (p.sets || p.reps || p.weight) ? parts : '<span class="skipped">no data</span>';
};

function renderList() {
  const l = $('#list');
  if (!draft.exercises.length) { l.innerHTML = '<div class="empty">No exercises yet. Add the first one above.</div>'; return; }
  l.innerHTML = `<div class="lrow head"><span>Exercise</span><span>${esc(cap(users[0]))}</span><span>${esc(cap(users[1]))}</span><span></span></div>` +
    draft.exercises.map((e, i) => `<div class="lrow${editing === i ? ' sel' : ''}" data-i="${i}"><span class="n">${esc(e.name)}</span><span>${fmtP(e.p[0])}</span><span>${fmtP(e.p[1])}</span><button class="x" aria-label="Remove">&times;</button></div>`).join('');
  l.querySelectorAll('.lrow[data-i]').forEach(r => {
    const i = +r.dataset.i;
    r.onclick = () => startEdit(i);
    r.querySelector('.x').onclick = ev => { ev.stopPropagation(); if (locked()) return toast('Already sent — finish saving first'); draft.exercises.splice(i, 1); if (editing === i) clearEntry(); else if (editing > i) editing--; saveDraft(); renderList(); };
  });
  l.scrollTop = editing === null ? l.scrollHeight : l.scrollTop;
}

function renderStatus() {
  const st = users.map((u, i) => {
    const n = draft.exercises.filter(e => e.p[i]).length;
    return `<span class="${draft.sent[i] ? 'ok' : (n ? 'warn' : '')}">${esc(cap(u))}: ${draft.sent[i] ? 'sent ✓' : n ? n + ' ready, not sent' : 'nothing'}</span>`;
  });
  st.push(`<span>History: ${esc(histSource || '…')}</span>`);
  $('#status').innerHTML = st.join('');
  $('#btn-add').disabled = locked();
}

function clearEntry() {
  editing = null; $('#ex-name').value = '';
  users.forEach((_, i) => { ['sets', 'reps', 'weight'].forEach(f => $(`#${f}${i}`).value = ''); $('#skip' + i).checked = false; $('#col' + i).classList.remove('off'); });
  $('#btn-add').textContent = '+ Add to workout'; updateHints(); renderList();
}

function startEdit(i) {
  if (locked()) return toast('Already sent — finish saving first');
  editing = i; const e = draft.exercises[i];
  $('#ex-name').value = e.name;
  users.forEach((_, k) => {
    const p = e.p[k];
    $('#skip' + k).checked = !p; $('#col' + k).classList.toggle('off', !p);
    ['sets', 'reps', 'weight'].forEach(f => $(`#${f}${k}`).value = p ? p[f] : '');
  });
  $('#btn-add').textContent = 'Update exercise'; updateHints(); renderList();
}

function addExercise() {
  if (locked()) return toast('Already sent — finish saving first');
  const name = $('#ex-name').value.trim();
  if (!name) return toast('Exercise name is required');
  const p = users.map((_, i) => $('#skip' + i).checked ? null : { sets: $(`#sets${i}`).value, reps: $(`#reps${i}`).value, weight: $(`#weight${i}`).value });
  if (editing !== null) draft.exercises[editing] = { name, p }; else draft.exercises.push({ name, p });
  saveDraft(); clearEntry(); renderStatus();
}

// ---------- Save ----------
async function save() {
  if (saving) return;
  if (!draft.name.trim()) return toast('Workout name is required');
  if (!users.some((_, i) => draft.exercises.some(e => e.p[i]))) return toast('Nothing to save yet');
  saving = true; $('#btn-save').disabled = true; $('#btn-save').textContent = 'Saving…';
  $('#console').hidden = false;
  if (!(await GH.loadCfg())) { saving = false; $('#btn-save').disabled = false; $('#btn-save').textContent = 'Save'; return toast('No GitHub settings found — set them up in the main app first'); }
  Log.add(`=== Save "${draft.name}" ${draft.date} ===`);
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    if (draft.sent[i]) { Log.add(`${u}: already sent, skipping`); continue; }
    const exs = draft.exercises.filter(e => e.p[i]);
    if (!exs.length) { Log.add(`${u}: no exercises, no session created`); draft.sent[i] = true; saveDraft(); continue; }
    try {
      Log.add(`${u}: ${exs.length} exercises, session id ${draft.ids[i].slice(0, 8)}`);
      const { json, sha } = await GH.loadUser(u);
      const data = json || { version: 1, foodItems: [], mealEntries: [], weightEntries: [], workoutSessions: [], settings: {} };
      data.workoutSessions = data.workoutSessions || [];
      if (data.workoutSessions.some(s => s.id === draft.ids[i])) {
        Log.add(`${u}: session id already in file (earlier attempt landed) — not adding again`, 'warn');
      } else {
        data.workoutSessions.push({
          id: draft.ids[i], name: draft.name.trim(), date: draft.date, location: draft.location.trim(),
          exercises: exs.map(e => ({ exercise: e.name, sets: e.p[i].sets || '', reps: e.p[i].reps || '', weight: e.p[i].weight || '', notes: '' })),
          createdAt: Date.now()
        });
        data.lastModified = Date.now(); data.exportedAt = new Date().toISOString(); data.version = data.version || 1;
        await GH.putUser(u, data, sha, `Workout "${draft.name.trim()}" for ${u} via tablet — ${new Date().toISOString()}`);
      }
      draft.sent[i] = true; saveDraft();
    } catch (e) { Log.add(`${u}: FAILED — ${e.message}`, 'err'); }
    renderStatus();
  }
  saving = false; $('#btn-save').disabled = false; $('#btn-save').textContent = 'Save';
  if (draft.sent.every(Boolean)) {
    Log.add('=== Both saved ===', 'ok'); toast('Workout saved for both');
    draft = newDraft(draft); saveDraft(); syncHeader(); clearEntry(); renderStatus(); loadHistory();
  } else { toast('Some saves failed — tap Save to retry'); renderStatus(); }
}

// ---------- Setup ----------
async function openSettings() {
  $('#s-u1').value = names.u1; $('#s-u2').value = names.u2;
  $('#settings').hidden = false;
  const c = await GH.loadCfg();
  $('#s-conn').innerHTML = c
    ? `GitHub connection: <b>${esc(c.owner)}/${esc(c.repo)}</b> (from the main app)`
    : '<span class="err">No GitHub connection found. Open the main app on this device, go to Settings → GitHub Connection, and save it there.</span>';
}
const cleanName = s => (s || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

function applyCfg() {
  users = [names.u1, names.u2];
  buildCols(); fillDatalist(); renderList(); renderStatus();
}
function syncHeader() { $('#w-name').value = draft.name; $('#w-date').value = draft.date; $('#w-loc').value = draft.location; }

// Leaving for the main app: offer to save an unsent workout; "leave anyway" keeps the draft on this tablet.
async function leaveToMain() {
  const pending = () => users.some((_, i) => !draft.sent[i] && draft.exercises.some(e => e.p[i]));
  if (pending()) {
    if (confirm('This workout has not been saved. Save it now before leaving?')) {
      await save();
      if (pending() && !confirm('Saving did not finish. Leave anyway? The draft stays on this tablet.')) return;
    } else if (!confirm('Leave without saving? The draft stays on this tablet.')) return;
  }
  location.href = '../index.html';
}

// ---------- Wake lock ----------
let wl = null;
async function keepAwake() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wl = await navigator.wakeLock.request('screen'); } catch (_) {} }

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  localStorage.removeItem(LS.legacyCfg);   // earlier build stored the token here; credentials now come from the main app only
  draft = JSON.parse(localStorage.getItem(LS.draft) || 'null') || newDraft();
  applyCfg(); syncHeader();
  $('#w-name').oninput = e => { draft.name = e.target.value; saveDraft(); };
  $('#w-date').onchange = e => { draft.date = e.target.value || todayISO(); saveDraft(); };
  $('#w-loc').oninput = e => { draft.location = e.target.value; saveDraft(); };
  $('#ex-name').oninput = updateHints; $('#ex-name').onchange = updateHints;
  $('#btn-add').onclick = addExercise; $('#btn-save').onclick = save;
  $('#btn-log').onclick = () => $('#console').hidden = !$('#console').hidden;
  $('#log-close').onclick = () => $('#console').hidden = true;
  $('#log-clear').onclick = () => Log.clear();
  $('#log-copy').onclick = () => navigator.clipboard.writeText(Log.text()).then(() => toast('Log copied'), () => toast('Copy failed'));
  $('#btn-settings').onclick = openSettings; $('#s-close').onclick = () => $('#settings').hidden = true;
  $('#s-save').onclick = () => {
    const u1 = cleanName($('#s-u1').value), u2 = cleanName($('#s-u2').value);
    if (!u1 || !u2 || u1 === u2) return toast('Enter two different names');
    if (locked() && (u1 !== names.u1 || u2 !== names.u2)) return toast('Finish saving the workout first');
    names = { u1, u2 }; localStorage.setItem(LS.users, JSON.stringify(names));
    $('#settings').hidden = true; hist = {}; applyCfg(); loadHistory();
  };
  $('#s-verify').onclick = async () => {
    if (!(await GH.loadCfg())) return toast('No GitHub connection found in the main app');
    try { const r = await GH.verify(); toast(`OK: ${r.name} (${r.files.join(', ') || 'no data files'})`); }
    catch (e) { toast('Verify failed: ' + e.message); }
  };
  $('#s-main').onclick = leaveToMain;
  $('#s-discard').onclick = () => { if (!confirm('Discard the current unsaved workout?')) return; draft = newDraft(draft); saveDraft(); syncHeader(); clearEntry(); renderStatus(); $('#settings').hidden = true; };
  document.addEventListener('visibilitychange', keepAwake); keepAwake();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js', { scope: './' }).catch(e => Log.add('Service worker: ' + e.message, 'warn'));
  window.addEventListener('online', () => { Log.add('Back online — refreshing history'); loadHistory(); });
  loadHistory();
});
