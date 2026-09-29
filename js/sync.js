// sync.js — GitHub backup/restore + user switching

function sanitizeUsername(name) {
  return (name || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || '';
}

function dataPathFor(username) {
  return `data/${sanitizeUsername(username)}.json`;
}

function fmtBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  return (n / 1024).toFixed(1) + ' KB';
}

// ---------------------------------------------------------------------------
// Remote-change tracking.
//
// Each device remembers `settings.remoteSha`: the git blob sha of the active
// user's data/<user>.json as of the last time THIS device pulled or pushed it.
// "Has GitHub changed since I last synced?" is then a sha comparison, which
// has two advantages over comparing `lastModified` clocks across devices:
//   1. It detects divergence (both sides edited) instead of guessing from
//      whichever wall clock happens to be later.
//   2. A directory listing returns every file's sha without downloading any
//      content, so periodic checks are one small request.
//
// `lastModified` is still used as a fallback for devices that haven't synced
// since this was added (no `remoteSha` yet); the first successful sync seeds it.
// `remoteSha` is device-local and is stripped from exports (see db.js).
// ---------------------------------------------------------------------------

// True if the remote file has changed since this device last synced it.
// `remote` is { sha, json } as returned by GitHubAPI.getJsonFile().
function remoteHasNewerData(remote, s) {
  if (s.remoteSha) return remote.sha !== s.remoteSha;
  // Legacy fallback (no sha recorded yet): compare edit timestamps.
  return ((remote.json && remote.json.lastModified) || 0) > (s.lastModified || 0);
}

// True while a user-initiated backup/pull is running, so background checks
// don't pop a sheet on top of it.
let _syncOpInFlight = false;

// Asks what to do when GitHub has changes this device hasn't seen.
// Resolves 'pull' | 'overwrite' | 'cancel'.
function askSyncConflict({ username, dirty }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (settled) return; settled = true; closeSheet(); resolve(v); };
    const bodyHtml = `
      <p class="stat-label" style="margin-bottom:16px;">
        GitHub has changes for <strong>${escapeHtml(username)}</strong> that this device hasn't seen — probably from another device.
        ${dirty
          ? 'You also have unsaved changes here. Pulling discards them; overwriting discards what\'s on GitHub.'
          : 'You have no unsaved changes here, so pulling is safe.'}
      </p>
      <button class="btn btn-primary btn-block" id="conflict-pull" style="margin-bottom:10px;">Pull Latest from GitHub</button>
      <button class="btn btn-ghost btn-block" id="conflict-overwrite" style="margin-bottom:10px;">Overwrite GitHub with This Device</button>
      <button class="btn btn-ghost btn-block" id="conflict-cancel">Cancel</button>
    `;
    const backdrop = openSheet('GitHub Has Newer Data', bodyHtml, (body) => {
      body.querySelector('#conflict-pull').onclick = () => done('pull');
      body.querySelector('#conflict-overwrite').onclick = () => done('overwrite');
      body.querySelector('#conflict-cancel').onclick = () => done('cancel');
    });
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) done('cancel'); });
  });
}

// Replaces local data with a fetched remote file and records its sha.
async function applyRemote(remote, username) {
  await DB.replaceAll(remote.json);
  await DB.saveSettings({ activeUsername: username, dataDirty: false, loadedAt: Date.now(), remoteSha: remote.sha });
}

// Pushes local data to GitHub — but first checks whether GitHub changed since
// this device last synced, and asks before clobbering it. `c` is
// { owner, repo, branch, token }. Returns 'ok' | 'pulled' | 'cancelled';
// throws on network/API errors.
async function pushBackup(c, username) {
  _syncOpInFlight = true;
  try {
    const path = dataPathFor(username);
    const branch = c.branch || undefined;
    const existing = await GitHubAPI.getJsonFile({ owner: c.owner, repo: c.repo, path, token: c.token, branch });

    let overwriting = false;
    if (existing) {
      const s = await DB.getSettings();
      if (remoteHasNewerData(existing, s)) {
        const choice = await askSyncConflict({ username, dirty: !!s.dataDirty });
        if (choice === 'pull') {
          await applyRemote(existing, username);
          showToast('Pulled latest from GitHub');
          renderApp();
          return 'pulled';
        }
        if (choice !== 'overwrite') return 'cancelled';
        overwriting = true;
      }
    }

    // When deliberately overwriting, stamp a fresh lastModified so any device
    // still on the timestamp fallback sees this copy as the newest.
    if (overwriting) await DB.saveSettings({ lastModified: Date.now() });

    const data = await DB.exportAll();
    const res = await GitHubAPI.putJsonFile({
      owner: c.owner, repo: c.repo, path, token: c.token, branch,
      json: data, sha: existing ? existing.sha : undefined,
      message: `Backup for ${username} — ${new Date().toISOString()}`
    });
    await DB.saveSettings({
      lastSyncedAt: Date.now(), dataDirty: false, loadedAt: Date.now(),
      remoteSha: (res && res.content && res.content.sha) || null
    });
    return 'ok';
  } finally {
    _syncOpInFlight = false;
  }
}

// Runs a backup using the currently *saved* GitHub settings (as opposed to
// renderSettings' internal doBackup(), which reads live, possibly-unsaved
// form fields). Used by the header "unsaved changes" tap. Returns true only
// if the backup actually went through.
async function backupNow() {
  const s = await DB.getSettings();
  if (!s.activeUsername) { showToast('Switch to a user first'); return false; }
  if (!s.githubOwner || !s.githubRepo || !s.githubToken) {
    showToast('Add your GitHub owner, repo, and token in Settings');
    return false;
  }
  try {
    const result = await pushBackup(
      { owner: s.githubOwner, repo: s.githubRepo, branch: s.githubBranch, token: s.githubToken },
      s.activeUsername
    );
    return result === 'ok';
  } catch (e) {
    showToast('Backup failed: ' + e.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// "Is GitHub newer than what I've got?" check.
//
// FitMac is multi-user: the comparison is scoped to whichever user is active
// on this device, against that user's `data/<username>.json`.
// ---------------------------------------------------------------------------

// Returns { status, remoteSha }. status is:
//   "behind"   — GitHub changed since our last sync, and we have no unsaved edits
//   "diverged" — GitHub changed AND we have unsaved local edits
//   "ahead"    — only this device has changes
//   "current"  — in sync
//   null       — nothing to compare (no user, no connection, or no remote file)
async function checkRemoteStatusDetailed() {
  const none = { status: null, remoteSha: null };
  const s = await DB.getSettings();
  if (!s.activeUsername || !s.githubOwner || !s.githubRepo || !s.githubToken) return none;
  const path = dataPathFor(s.activeUsername);
  const branch = s.githubBranch || undefined;
  try {
    if (s.remoteSha) {
      // Cheap path: one directory listing, no file download.
      const files = await GitHubAPI.listDirectory({
        owner: s.githubOwner, repo: s.githubRepo, path: 'data', token: s.githubToken, branch
      });
      const entry = files.find(f => f.path === path);
      if (!entry) return none;
      if (entry.sha === s.remoteSha) return { status: s.dataDirty ? 'ahead' : 'current', remoteSha: entry.sha };
      return { status: s.dataDirty ? 'diverged' : 'behind', remoteSha: entry.sha };
    }

    // Legacy path (no sha recorded yet): download and compare timestamps.
    const existing = await GitHubAPI.getJsonFile({
      owner: s.githubOwner, repo: s.githubRepo, path, token: s.githubToken, branch
    });
    if (!existing || !existing.json || !existing.json.lastModified) return none;
    const remoteTime = existing.json.lastModified;
    const localTime = s.lastModified || 0;
    if (remoteTime > localTime) return { status: s.dataDirty ? 'diverged' : 'behind', remoteSha: existing.sha };
    if (localTime > remoteTime) return { status: 'ahead', remoteSha: existing.sha };
    // Identical timestamps: we're in sync, so seed the sha for next time.
    if (!s.dataDirty) await DB.saveSettings({ remoteSha: existing.sha });
    return { status: 'current', remoteSha: existing.sha };
  } catch (e) {
    console.error('GitHub status check failed:', e);
    return none;
  }
}

// String-only wrapper kept for any callers that just want the status.
async function checkRemoteStatus() {
  return (await checkRemoteStatusDetailed()).status;
}

// Pulls the given user's backup down from GitHub and replaces local data.
// Only asks for confirmation when there are unsaved local changes to lose.
async function pullLatest(username) {
  _syncOpInFlight = true;
  try {
    const s = await DB.getSettings();
    const existing = await GitHubAPI.getJsonFile({
      owner: s.githubOwner, repo: s.githubRepo, path: dataPathFor(username),
      token: s.githubToken, branch: s.githubBranch || undefined
    });
    if (!existing) { showToast('No backup found on GitHub'); return; }
    if (s.dataDirty) {
      const confirmed = confirm(
        `Replace local data with the GitHub backup for "${username}"? ` +
        `This will discard anything on this device that hasn't been backed up yet.`
      );
      if (!confirmed) return;
    }
    await applyRemote(existing, username);
    showToast('Pulled latest from GitHub');
    renderApp();
  } catch (e) {
    showToast('Pull failed: ' + e.message);
  } finally {
    _syncOpInFlight = false;
  }
}

// ---------------------------------------------------------------------------
// Triggers — when do we ask GitHub whether there's something newer?
//
//   launch          app.js, once at startup (forced)
//   resume          tab/app becomes visible again (installed PWAs mostly
//                   resume rather than relaunch, so this is the big one)
//   pageshow        restored from the back/forward cache
//   focus           window regains focus (desktop)
//   online          connection came back (forced — we may have missed a lot)
//   poll            every few minutes while the app is in the foreground
//   settings-saved  after saving GitHub connection settings (forced)
//
// Every trigger goes through requestSyncCheck(), which throttles and skips
// when a check would be wasteful or intrusive.
// ---------------------------------------------------------------------------

const SYNC_CHECK_MIN_GAP_MS = 60 * 1000;      // never check more often than this (unless forced)
const SYNC_POLL_MS = 5 * 60 * 1000;           // foreground polling interval

let _syncCheckInFlight = false;
let _lastSyncCheckAt = 0;
let _syncPollTimer = null;
let _syncTriggersReady = false;
let _dismissedRemoteSha = null;               // "Continue with Local Data" — don't re-nag for this version

async function requestSyncCheck(reason, { force = false } = {}) {
  if (_syncCheckInFlight || _syncOpInFlight) return;
  if (navigator.onLine === false) return;
  if (document.visibilityState === 'hidden') return;
  const now = Date.now();
  if (!force && now - _lastSyncCheckAt < SYNC_CHECK_MIN_GAP_MS) return;

  _syncCheckInFlight = true;
  _lastSyncCheckAt = now;
  try {
    const result = await checkRemoteStatusDetailed();
    if (result.status !== 'behind' && result.status !== 'diverged') return;
    if (result.remoteSha && result.remoteSha === _dismissedRemoteSha) return;

    // Never interrupt whatever the user is doing: an open sheet or a focused
    // text field means they're mid-edit. The next trigger will retry.
    if (document.getElementById('active-sheet')) return;
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return;

    const s = await DB.getSettings();
    showRemoteUpdateSheet(result, s);
  } finally {
    _syncCheckInFlight = false;
  }
}

function showRemoteUpdateSheet({ status, remoteSha }, s) {
  const diverged = status === 'diverged';
  const bodyHtml = `
    <p class="stat-label" style="margin-bottom:16px;">
      GitHub has a newer backup for <strong>${escapeHtml(s.activeUsername)}</strong> — probably from another device.
      ${diverged ? ' You also have unsaved local changes that would be discarded if you pull it in.' : ''}
    </p>
    <button class="btn btn-primary btn-block" id="launch-check-pull" style="margin-bottom:10px;">Pull Latest from GitHub</button>
    <button class="btn btn-ghost btn-block" id="launch-check-dismiss">Continue with Local Data</button>
  `;
  const dismiss = () => { _dismissedRemoteSha = remoteSha; closeSheet(); };
  const backdrop = openSheet('Newer Data on GitHub', bodyHtml, (body) => {
    body.querySelector('#launch-check-pull').onclick = async () => {
      closeSheet();
      await pullLatest(s.activeUsername);
    };
    body.querySelector('#launch-check-dismiss').onclick = dismiss;
  });
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) _dismissedRemoteSha = remoteSha; });
}

function _startSyncPoll() {
  if (_syncPollTimer) return;
  _syncPollTimer = setInterval(() => requestSyncCheck('poll'), SYNC_POLL_MS);
}

function _stopSyncPoll() {
  clearInterval(_syncPollTimer);
  _syncPollTimer = null;
}

// Wires up every event-based trigger. Call once at startup (app.js).
function initSyncTriggers() {
  if (_syncTriggersReady) return;
  _syncTriggersReady = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      requestSyncCheck('resume');
      _startSyncPoll();
    } else {
      _stopSyncPoll();
    }
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted) requestSyncCheck('pageshow'); });
  window.addEventListener('focus', () => requestSyncCheck('focus'));
  window.addEventListener('online', () => requestSyncCheck('online', { force: true }));

  if (document.visibilityState === 'visible') _startSyncPoll();
}

// Backwards-compatible name for the original launch-only check.
function runLaunchCheck() {
  return requestSyncCheck('launch', { force: true });
}

// ---------------------------------------------------------------------------
// Share a single entry (a whole meal or workout session) to another user's
// GitHub backup — without switching accounts and without touching this
// device's local data at all.
//
// Unlike backupNow()/doBackup(), which overwrite the target file with a full
// DB.exportAll() snapshot, this reads the target's existing remote JSON (or
// starts a blank skeleton if they don't have one yet), appends a *copy* of
// the entry with a fresh id, and writes that back. So it never touches the
// rest of their data.
//
// LIMITATION: this writes directly to GitHub, bypassing the recipient's
// local IndexedDB. If their device backs up (a full overwrite) before they
// pull this change down, the shared entry will be lost. runLaunchCheck() on
// their end will flag the file as newer on GitHub the next time they open
// the app — that's the current safety net — but there's no locking, so a
// pull is still on them to do before their own next backup.
// ---------------------------------------------------------------------------
async function shareEntryToUser(targetUsernameRaw, storeKey, entry) {
  const target = sanitizeUsername(targetUsernameRaw);
  if (!target) { showToast('Enter a username'); return false; }
  const s = await DB.getSettings();
  if (target === sanitizeUsername(s.activeUsername || '')) {
    showToast("That's your own account");
    return false;
  }
  if (!s.githubOwner || !s.githubRepo || !s.githubToken) {
    showToast('Add your GitHub owner, repo, and token in Settings first');
    return false;
  }
  const path = dataPathFor(target);
  try {
    const existing = await GitHubAPI.getJsonFile({
      owner: s.githubOwner, repo: s.githubRepo, path,
      token: s.githubToken, branch: s.githubBranch || undefined
    });
    const remoteData = existing ? existing.json : {
      version: 1, foodItems: [], mealEntries: [], weightEntries: [], workoutSessions: [], settings: {}
    };
    // Fresh id so it doesn't collide with the sender's own copy of the
    // entry; fresh createdAt so it sorts as newly-added on the recipient's
    // side rather than wherever it happened to fall in the sender's history.
    const { id, createdAt, ...rest } = entry;
    const copy = { ...rest, id: DB.uuid(), createdAt: Date.now() };
    remoteData[storeKey] = [...(remoteData[storeKey] || []), copy];
    remoteData.lastModified = Date.now();
    remoteData.exportedAt = new Date().toISOString();
    remoteData.version = remoteData.version || 1;

    const label = storeKey === 'workoutSessions' ? 'workout session' : 'meal';
    await GitHubAPI.putJsonFile({
      owner: s.githubOwner, repo: s.githubRepo, path,
      token: s.githubToken, branch: s.githubBranch || undefined,
      json: remoteData, sha: existing ? existing.sha : undefined,
      message: `Share ${label} "${entry.name}"${s.activeUsername ? ` from ${s.activeUsername}` : ''} to ${target}`
    });
    return true;
  } catch (e) {
    showToast('Share failed: ' + e.message);
    return false;
  }
}

// Opens a small sheet to pick (or type) a target username and share `entry`
// into their remote data under `storeKey` ('workoutSessions' | 'mealEntries').
async function openSharePicker(storeKey, entry) {
  const s = await DB.getSettings();
  if (!s.githubOwner || !s.githubRepo || !s.githubToken) {
    showToast('Add your GitHub owner, repo, and token in Settings first');
    return;
  }
  const bodyHtml = `
    <div class="field">
      <label>Username</label>
      <input type="text" id="share-username-input" placeholder="e.g. elle" autocomplete="off" />
    </div>
    <div id="share-user-list" style="margin-bottom:14px;"></div>
    <p class="stat-label" style="margin-bottom:14px;">
      This copies "${escapeHtml(entry.name)}" straight to their GitHub backup. If they haven't opened
      the app since, they'll be prompted to pull it in next time they do.
    </p>
    <button class="btn btn-primary btn-block" id="share-confirm-btn">Copy Over</button>
  `;
  openSheet(`Copy "${escapeHtml(entry.name)}" To…`, bodyHtml, async (body) => {
    const listEl = body.querySelector('#share-user-list');
    const input = body.querySelector('#share-username-input');

    // Best-effort: list known users so this is tap-to-pick instead of
    // requiring exact spelling every time. Silently falls back to manual
    // entry if the listing fails for any reason.
    try {
      const files = await GitHubAPI.listDirectory({
        owner: s.githubOwner, repo: s.githubRepo, path: 'data',
        token: s.githubToken, branch: s.githubBranch || undefined
      });
      const others = files
        .filter(f => f.name && f.name.endsWith('.json'))
        .map(f => f.name.replace(/\.json$/, ''))
        .filter(u => u !== sanitizeUsername(s.activeUsername || ''));
      if (others.length) {
        const card = el('<div class="card"></div>');
        others.forEach(u => {
          const row = el(`
            <div class="list-item" style="cursor:pointer;">
              <div class="list-item-main"><div class="list-item-title">${escapeHtml(u)}</div></div>
            </div>
          `);
          row.onclick = () => { input.value = u; };
          card.appendChild(row);
        });
        listEl.appendChild(card);
      }
    } catch (e) {
      // Non-fatal — manual entry still works.
    }

    body.querySelector('#share-confirm-btn').onclick = async () => {
      const btn = body.querySelector('#share-confirm-btn');
      const targetLabel = sanitizeUsername(input.value);
      btn.disabled = true; btn.textContent = 'Copying…';
      const ok = await shareEntryToUser(input.value, storeKey, entry);
      btn.disabled = false; btn.textContent = 'Copy Over';
      if (ok) {
        closeSheet();
        showToast(`Copied to ${targetLabel}`);
      }
    };
  });
}

async function renderSettings(content) {
  const s = await DB.getSettings();

  content.innerHTML = `
    <div class="card">
      <div class="card-title">Backup</div>
      ${s.lastSyncedAt ? `<div class="stat-label" style="margin-bottom:10px;">Last backed up: ${new Date(s.lastSyncedAt).toLocaleString()}</div>` : ''}
      ${s.dataDirty ? `<div class="stat-label" style="margin-bottom:10px;color:var(--carbs);">You have unsaved changes</div>` : ''}
      <button class="btn btn-primary btn-block" id="backup-btn">Back Up ${s.activeUsername ? escapeHtml(s.activeUsername) : ''} Now</button>
    </div>

    <div class="card">
      <div class="card-title">Switch User</div>
      <div class="stat-label" style="margin-bottom:10px;">
        Currently viewing: <strong>${s.activeUsername ? escapeHtml(s.activeUsername) : 'nobody yet'}</strong>
      </div>
      <button class="btn btn-ghost btn-block" id="load-users-btn" style="margin-bottom:10px;">User List</button>
      <div id="remote-user-list"></div>

      <details style="margin-top:14px;">
        <summary class="card-title" style="cursor:pointer;">Add a new user</summary>
        <div class="field" style="margin-top:12px;">
          <label>New username</label>
          <input type="text" id="switch-username-input" placeholder="e.g. elle" />
        </div>
        <button class="btn btn-ghost btn-block" id="switch-user-btn">Create &amp; Switch</button>
      </details>
    </div>

    <details class="card">
      <summary class="card-title" style="cursor:pointer;">GitHub Connection</summary>
      <div class="field" style="margin-top:12px;">
        <label>Repository Owner</label>
        <input type="text" id="set-owner" placeholder="e.g. yourname" value="${s.githubOwner ? escapeHtml(s.githubOwner) : ''}" />
      </div>
      <div class="field">
        <label>Repository Name</label>
        <input type="text" id="set-repo" placeholder="e.g. fitness-tracker-data" value="${s.githubRepo ? escapeHtml(s.githubRepo) : ''}" />
      </div>
      <div class="field">
        <label>Branch <span style="color:var(--text-faint);">(optional, defaults to repo default)</span></label>
        <input type="text" id="set-branch" placeholder="main" value="${s.githubBranch ? escapeHtml(s.githubBranch) : ''}" />
      </div>
      <div class="field">
        <label>Personal Access Token</label>
        <input type="password" id="set-token" placeholder="ghp_…" value="${s.githubToken ? escapeHtml(s.githubToken) : ''}" />
        <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12.5px;color:var(--text-faint);">
          <input type="checkbox" id="set-token-show" style="width:auto;" /> Show token
        </label>
      </div>
      <div class="stat-label" style="margin-bottom:12px;">Use a fine-grained token scoped to just this repo, with read/write access to contents.</div>
      <div class="btn-row" style="margin-bottom:10px;">
        <button class="btn btn-ghost btn-block" id="save-settings-btn">Save Settings</button>
        <button class="btn btn-ghost" id="verify-btn">Verify</button>
      </div>
      <button class="btn btn-ghost btn-block" id="refresh-git-btn">Refresh from Git</button>
    </details>

    <div class="btn-row" style="margin-top:4px;">
      <button class="btn btn-ghost btn-block" id="export-btn">Export Backup (JSON)</button>
    </div>
  `;

  const tokenInput = content.querySelector('#set-token');
  content.querySelector('#set-token-show').onchange = (e) => {
    tokenInput.type = e.target.checked ? 'text' : 'password';
  };

  function getConn() {
    return {
      owner: content.querySelector('#set-owner').value.trim(),
      repo: content.querySelector('#set-repo').value.trim(),
      branch: content.querySelector('#set-branch').value.trim(),
      token: content.querySelector('#set-token').value.trim()
    };
  }

  async function persistSettings() {
    const c = getConn();
    const prev = await DB.getSettings();
    // Pointing at a different repo/branch invalidates the remembered sha.
    const repoChanged = (prev.githubOwner || '') !== c.owner || (prev.githubRepo || '') !== c.repo || (prev.githubBranch || '') !== c.branch;
    await DB.saveSettings({
      githubOwner: c.owner, githubRepo: c.repo, githubBranch: c.branch, githubToken: c.token,
      ...(repoChanged ? { remoteSha: null } : {})
    });
    return c;
  }

  // Pushes the currently loaded data to GitHub (with the remote-changed guard)
  // and clears the dirty flag — see pushBackup() at the top level. Returns true
  // only if the backup actually went through.
  async function doBackup(c, username) {
    try {
      return (await pushBackup(c, username)) === 'ok';
    } catch (e) {
      showToast('Backup failed: ' + e.message);
      return false;
    }
  }

  async function switchUser(targetUsernameRaw) {
    const target = sanitizeUsername(targetUsernameRaw);
    if (!target) { showToast('Enter a username'); return; }
    const current = await DB.getSettings();
    if (target === current.activeUsername) { showToast(`Already viewing ${target}`); return; }

    if (current.dataDirty && current.activeUsername) {
      const wantsBackup = confirm(`You have unsaved changes for "${current.activeUsername}". Click OK to back them up before switching, or Cancel to choose whether to discard them.`);
      if (wantsBackup) {
        const c = getConn();
        if (!c.owner || !c.repo || !c.token) { showToast('Fill in GitHub owner, repo, and token to back up'); return; }
        const ok = await doBackup(c, current.activeUsername);
        if (!ok) { showToast('Switch cancelled — backup did not complete'); return; }
      } else {
        const wantsDiscard = confirm(`Discard unsaved changes for "${current.activeUsername}" and switch to "${target}"?`);
        if (!wantsDiscard) return;
      }
    }

    const c = getConn();
    if (!c.owner || !c.repo || !c.token) { showToast('Fill in GitHub owner, repo, and token'); return; }

    await DB.wipeAppData();
    try {
      const result = await GitHubAPI.getJsonFile({ owner: c.owner, repo: c.repo, path: dataPathFor(target), token: c.token, branch: c.branch || undefined });
      if (result) {
        await DB.importAll(result.json);
        await DB.saveSettings({ activeUsername: target, dataDirty: false, loadedAt: Date.now(), remoteSha: result.sha });
      } else {
        // No existing backup for this user — it's a brand new profile, so
        // reset the user-scoped fields (target weight, calorie goal, etc.)
        // instead of carrying over whatever the previous user had set.
        // githubOwner/githubRepo/githubBranch/githubToken/lastSyncedAt are
        // left untouched since those describe this device's GitHub
        // connection, not the user.
        await DB.saveSettings({
          targetWeight: null,
          calorieGoal: null,
          proteinGoal: null,
          carbsGoal: null,
          fatGoal: null,
          remoteSha: null,
          activeUsername: target,
          dataDirty: false,
          loadedAt: Date.now(),
          lastModified: Date.now()
        });
      }
      showToast(result ? `Switched to ${target}` : `Switched to ${target} (new user)`);
      renderApp();
    } catch (e) {
      showToast('Switch failed: ' + e.message);
    }
  }

  // Force-refreshes the app itself: unregisters the service worker, clears
  // its caches, then hard-reloads so the browser re-fetches every asset from
  // the server. This is for when the PWA is showing stale code/assets and
  // pull-to-refresh isn't doing the job — it does NOT touch your IndexedDB
  // data (meals, weight, workouts, settings all stay put).
  async function refreshApp() {
    if (!confirm('Reload the app and fetch the latest version from the server?')) return;
    const btn = content.querySelector('#refresh-git-btn');
    btn.disabled = true; btn.textContent = 'Refreshing…';
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) {
      // Best-effort — fall through to reload regardless.
    }
    location.reload();
  }

  content.querySelector('#save-settings-btn').onclick = async () => {
    await persistSettings();
    showToast('Settings saved');
    renderApp();
    requestSyncCheck('settings-saved', { force: true });
  };

  content.querySelector('#switch-user-btn').onclick = () => switchUser(content.querySelector('#switch-username-input').value);

  content.querySelector('#verify-btn').onclick = async () => {
    const c = getConn();
    if (!c.owner || !c.repo || !c.token) { showToast('Owner, repo, and token are required'); return; }
    try {
      const repoInfo = await GitHubAPI.verifyAccess({ owner: c.owner, repo: c.repo, token: c.token });
      showToast(`Connected to ${repoInfo.full_name}`);
    } catch (e) {
      showToast('Verify failed: ' + e.message);
    }
  };

  content.querySelector('#export-btn').onclick = async () => {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tracker-backup-${DB.todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  content.querySelector('#backup-btn').onclick = async () => {
    const c = await persistSettings();
    const s2 = await DB.getSettings();
    if (!s2.activeUsername) { showToast('Switch to a user first'); return; }
    if (!c.owner || !c.repo || !c.token) { showToast('Fill in GitHub owner, repo, and token'); return; }
    const btn = content.querySelector('#backup-btn');
    const label = `Back Up ${s2.activeUsername} Now`;
    btn.disabled = true; btn.textContent = 'Backing up…';
    const ok = await doBackup(c, s2.activeUsername);
    btn.disabled = false; btn.textContent = label;
    if (ok) { showToast('Backup complete'); renderApp(); }
  };

  content.querySelector('#refresh-git-btn').onclick = () => refreshApp();

  content.querySelector('#load-users-btn').onclick = async () => {
    const c = getConn();
    if (!c.owner || !c.repo || !c.token) { showToast('Fill in GitHub owner, repo, and token'); return; }
    const listEl = content.querySelector('#remote-user-list');
    listEl.innerHTML = `<div class="empty-state">Loading…</div>`;
    try {
      const files = await GitHubAPI.listDirectory({ owner: c.owner, repo: c.repo, path: 'data', token: c.token, branch: c.branch || undefined });
      const jsonFiles = files.filter(f => f.name && f.name.endsWith('.json'));
      if (jsonFiles.length === 0) {
        listEl.innerHTML = `<div class="empty-state">No backups found yet in data/</div>`;
        return;
      }
      listEl.innerHTML = '';
      jsonFiles.forEach(f => {
        const username = f.name.replace(/\.json$/, '');
        const row = el(`
          <div class="list-item">
            <div class="list-item-main">
              <div class="list-item-title">${escapeHtml(username)}</div>
              <div class="list-item-sub">${fmtBytes(f.size)}</div>
            </div>
            <button class="btn btn-sm btn-ghost">Switch</button>
          </div>
        `);
        row.querySelector('button').onclick = () => switchUser(username);
        listEl.appendChild(row);
      });
    } catch (e) {
      listEl.innerHTML = `<div class="empty-state">Failed to load: ${escapeHtml(e.message)}</div>`;
    }
  };
}