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
      <button class="btn btn-ghost btn-block" id="load-users-btn" style="margin-bottom:10px;">Find Users on GitHub</button>
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
      <div class="btn-row">
        <button class="btn btn-ghost btn-block" id="save-settings-btn">Save Settings</button>
        <button class="btn btn-ghost" id="verify-btn">Verify</button>
      </div>
    </details>
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
    await DB.saveSettings({ githubOwner: c.owner, githubRepo: c.repo, githubBranch: c.branch, githubToken: c.token });
    return c;
  }

  // Pushes the currently loaded data to GitHub and clears the dirty flag.
  async function doBackup(c, username) {
    try {
      const path = dataPathFor(username);
      const existing = await GitHubAPI.getJsonFile({ owner: c.owner, repo: c.repo, path, token: c.token, branch: c.branch || undefined });
      const data = await DB.exportAll();
      await GitHubAPI.putJsonFile({
        owner: c.owner, repo: c.repo, path, token: c.token, branch: c.branch || undefined,
        json: data, sha: existing ? existing.sha : undefined,
        message: `Backup for ${username} — ${new Date().toISOString()}`
      });
      await DB.saveSettings({ lastSyncedAt: Date.now(), dataDirty: false, loadedAt: Date.now() });
      return true;
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
        if (!ok) { showToast('Switch cancelled — backup failed'); return; }
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
      } else {
        await DB.saveSettings({ activeUsername: target, dataDirty: false, loadedAt: Date.now() });
      }
      showToast(result ? `Switched to ${target}` : `Switched to ${target} (new user)`);
      renderApp();
    } catch (e) {
      showToast('Switch failed: ' + e.message);
    }
  }

  content.querySelector('#save-settings-btn').onclick = async () => {
    await persistSettings();
    showToast('Settings saved');
    renderApp();
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