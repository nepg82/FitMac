// sync.js — device identity + GitHub backup/restore + multi-user admin view

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
      <div class="card-title">This Device</div>
      <div class="field">
        <label>Username</label>
        <input type="text" id="set-username" placeholder="e.g. sarah or dads-phone" value="${s.username ? escapeHtml(s.username) : ''}" />
      </div>
      <div class="stat-label">Backups from this device are saved as <span class="mono">${dataPathFor(s.username || 'username')}</span></div>
    </div>

    <div class="card">
      <div class="card-title">GitHub Connection</div>
      <div class="field">
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
    </div>

    <div class="card">
      <div class="card-title">Backup &amp; Restore</div>
      ${s.lastSyncedAt ? `<div class="stat-label" style="margin-bottom:10px;">Last backed up: ${new Date(s.lastSyncedAt).toLocaleString()}</div>` : ''}
      <div class="btn-row">
        <button class="btn btn-primary btn-block" id="backup-btn">Back Up Now</button>
        <button class="btn btn-ghost" id="restore-btn">Restore</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">All Users (Admin)</div>
      <button class="btn btn-ghost btn-block" id="load-admin-btn" style="margin-bottom:10px;">Load User List</button>
      <div id="admin-list"></div>
    </div>
  `;

  const tokenInput = content.querySelector('#set-token');
  content.querySelector('#set-token-show').onchange = (e) => {
    tokenInput.type = e.target.checked ? 'text' : 'password';
  };

  function getConn() {
    return {
      username: content.querySelector('#set-username').value.trim(),
      owner: content.querySelector('#set-owner').value.trim(),
      repo: content.querySelector('#set-repo').value.trim(),
      branch: content.querySelector('#set-branch').value.trim(),
      token: content.querySelector('#set-token').value.trim()
    };
  }

  async function persistSettings() {
    const c = getConn();
    await DB.saveSettings({ username: c.username, githubOwner: c.owner, githubRepo: c.repo, githubBranch: c.branch, githubToken: c.token });
    return c;
  }

  content.querySelector('#save-settings-btn').onclick = async () => {
    await persistSettings();
    showToast('Settings saved');
    renderApp();
  };

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
    if (!c.username) { showToast('Set a username first'); return; }
    if (!c.owner || !c.repo || !c.token) { showToast('Fill in GitHub owner, repo, and token'); return; }
    const btn = content.querySelector('#backup-btn');
    btn.disabled = true; btn.textContent = 'Backing up…';
    try {
      const path = dataPathFor(c.username);
      const existing = await GitHubAPI.getJsonFile({ owner: c.owner, repo: c.repo, path, token: c.token, branch: c.branch || undefined });
      const data = await DB.exportAll();
      await GitHubAPI.putJsonFile({
        owner: c.owner, repo: c.repo, path, token: c.token, branch: c.branch || undefined,
        json: data, sha: existing ? existing.sha : undefined,
        message: `Backup for ${c.username} — ${new Date().toISOString()}`
      });
      await DB.saveSettings({ lastSyncedAt: Date.now() });
      showToast('Backup complete');
      renderApp();
    } catch (e) {
      showToast('Backup failed: ' + e.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Back Up Now';
    }
  };

  content.querySelector('#restore-btn').onclick = async () => {
    const c = await persistSettings();
    if (!c.username) { showToast('Set a username first'); return; }
    if (!c.owner || !c.repo || !c.token) { showToast('Fill in GitHub owner, repo, and token'); return; }
    if (!confirm('Restore will merge the backed-up data into this device. Continue?')) return;
    try {
      const path = dataPathFor(c.username);
      const result = await GitHubAPI.getJsonFile({ owner: c.owner, repo: c.repo, path, token: c.token, branch: c.branch || undefined });
      if (!result) { showToast('No backup found for this username yet'); return; }
      await DB.replaceAll(result.json);
      showToast('Restore complete');
      renderApp();
    } catch (e) {
      showToast('Restore failed: ' + e.message);
    }
  };

  content.querySelector('#load-admin-btn').onclick = async () => {
    const c = getConn();
    if (!c.owner || !c.repo || !c.token) { showToast('Fill in GitHub owner, repo, and token'); return; }
    const listEl = content.querySelector('#admin-list');
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
            <div class="btn-row" style="gap:6px;">
              <button class="btn btn-sm btn-ghost" data-action="view">View</button>
              <button class="btn btn-sm btn-danger" data-action="restore">Restore</button>
            </div>
          </div>
        `);
        row.querySelector('[data-action="view"]').onclick = async () => {
          try {
            const result = await GitHubAPI.getJsonFile({ owner: c.owner, repo: c.repo, path: f.path, token: c.token, branch: c.branch || undefined });
            const d = result.json;
            openSheet(escapeHtml(username), `
              <div class="stat-row"><span class="stat-label">Meals logged</span><span class="mono">${(d.mealEntries || []).length}</span></div>
              <div class="stat-row"><span class="stat-label">Weight entries</span><span class="mono">${(d.weightEntries || []).length}</span></div>
              <div class="stat-row"><span class="stat-label">Workout sessions</span><span class="mono">${(d.workoutSessions || []).length}</span></div>
              <div class="stat-row"><span class="stat-label">Food items saved</span><span class="mono">${(d.foodItems || []).length}</span></div>
              <div class="stat-label" style="margin-top:10px;">Exported: ${d.exportedAt ? new Date(d.exportedAt).toLocaleString() : '—'}</div>
            `);
          } catch (e) {
            showToast('Failed to load: ' + e.message);
          }
        };
        row.querySelector('[data-action="restore"]').onclick = async () => {
          if (!confirm(`Restore "${username}"'s data into THIS device? This merges into your current local data.`)) return;
          try {
            const result = await GitHubAPI.getJsonFile({ owner: c.owner, repo: c.repo, path: f.path, token: c.token, branch: c.branch || undefined });
            await DB.replaceAll(result.json);
            showToast(`Restored ${username}'s data to this device`);
            renderApp();
          } catch (e) {
            showToast('Restore failed: ' + e.message);
          }
        };
        listEl.appendChild(row);
      });
    } catch (e) {
      listEl.innerHTML = `<div class="empty-state">Failed to load: ${escapeHtml(e.message)}</div>`;
    }
  };
}
