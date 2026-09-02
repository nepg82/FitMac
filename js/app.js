// app.js — router + shared UI helpers
const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  meals: '<svg viewBox="0 0 24 24"><path d="M6 3v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3"/><path d="M8 12v9"/><path d="M17 3c-1.5 0-3 1.5-3 4v3.5c0 1 .8 1.5 1.5 1.5H17M17 3v18"/></svg>',
  weight: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l2.5 2.5"/></svg>',
  workout: '<svg viewBox="0 0 24 24"><path d="M6 7v10M18 7v10M2 10v4M22 10v4M6 12h12"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
};

const NAV_KEYS = ['dashboard', 'meals', 'weight', 'workout'];

const ROUTES = {
  dashboard: { label: 'Dashboard', icon: ICONS.dashboard, render: renderDashboard },
  meals: { label: 'Meals', icon: ICONS.meals, render: renderMeals },
  weight: { label: 'Weight', icon: ICONS.weight, render: renderWeight },
  workout: { label: 'Workout', icon: ICONS.workout, render: renderWorkout },
  settings: { label: 'Settings', render: renderSettings }
};

let currentRoute = 'dashboard';

function navigate(route) {
  currentRoute = route;
  location.hash = '#/' + route;
}

function renderNav() {
  const nav = document.getElementById('bottom-nav');
  nav.innerHTML = '';
  NAV_KEYS.forEach((key) => {
    const r = ROUTES[key];
    const btn = document.createElement('button');
    btn.className = 'nav-btn' + (key === currentRoute ? ' active' : '');
    btn.innerHTML = r.icon + '<span>' + r.label + '</span>';
    btn.onclick = () => navigate(key);
    nav.appendChild(btn);
  });
}

async function renderApp() {
  renderNav();
  await updateHeaderUsername();
  const content = document.getElementById('app-content');
  content.innerHTML = '<div class="empty-state">Loading…</div>';
  await ROUTES[currentRoute].render(content);
}

async function updateHeaderUsername() {
  const settings = await DB.getSettings();
  const el = document.getElementById('header-username');
  if (el) {
    el.textContent = settings.activeUsername || '';
    el.classList.toggle('dirty', !!settings.dataDirty && !!settings.activeUsername);
  }
  document.documentElement.dataset.user = settings.activeUsername || '';
}

function initRouteFromHash() {
  const hash = location.hash.replace('#/', '');
  currentRoute = ROUTES[hash] ? hash : 'dashboard';
}

window.addEventListener('hashchange', () => {
  initRouteFromHash();
  renderApp();
});

document.addEventListener('DOMContentLoaded', () => {
  initRouteFromHash();
  renderApp();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  document.getElementById('header-username').addEventListener('click', async () => {
    const s = await DB.getSettings();
    if (!s.dataDirty || !s.activeUsername) return;
    if (!confirm(`Back up unsaved changes for "${s.activeUsername}" now?`)) return;
    const ok = await backupNow();
    if (ok) { showToast('Backup complete'); renderApp(); }
  });
});

// ---------- Shared UI helpers ----------

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = el(`<div class="toast">${msg}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function openSheet(titleHtml, bodyHtml, onMount) {
  closeSheet();
  const backdrop = el(`
    <div class="sheet-backdrop" id="active-sheet">
      <div class="sheet">
        <div class="sheet-handle"></div>
        <h3 class="sheet-title">${titleHtml}</h3>
        <div class="sheet-body">${bodyHtml}</div>
      </div>
    </div>
  `);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeSheet();
  });
  document.body.appendChild(backdrop);
  if (onMount) onMount(backdrop.querySelector('.sheet-body'));
  return backdrop;
}

function closeSheet() {
  const s = document.getElementById('active-sheet');
  if (s) s.remove();
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateShort(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}/${d}`;
}

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function formatDateWeekdayShort(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = dt.toLocaleDateString(undefined, { weekday: 'narrow' });
  return `${wd} ${m}/${d}`;
}

function groupByDate(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.date)) groups.set(item.date, []);
    groups.get(item.date).push(item);
  }
  return groups;
}

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}
