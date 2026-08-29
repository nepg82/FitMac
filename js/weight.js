// weight.js
async function renderWeight(content) {
  const entries = await DB.getWeightEntries();
  const settings = await DB.getSettings();
  const latest = entries[entries.length - 1];
  const prev = entries[entries.length - 2];

  content.innerHTML = `
    <div class="card">
      <div class="card-title">Trend</div>
      <canvas class="chart-canvas" id="weight-chart"></canvas>
    </div>

    <div class="btn-row" style="margin-bottom:16px;">
      <button class="btn btn-primary btn-block" id="add-weight-btn">+ Log Weight</button>
      <button class="btn btn-ghost" id="set-target-btn">Target</button>
    </div>

    ${latest ? `
    <div class="card">
      <div class="stat-row">
        <span class="stat-label">Latest</span>
        <span class="mono">${latest.date === DB.todayISO() ? 'Today' : formatDate(latest.date)}</span>
      </div>
      <div class="big-number">${round1(latest.weight)} <span style="font-size:16px;color:var(--text-dim);">lbs</span></div>
      ${prev ? `<div class="stat-label" style="margin-top:4px;">${latest.weight - prev.weight >= 0 ? '+' : ''}${round1(latest.weight - prev.weight)} lbs since last entry</div>` : ''}
      ${settings.targetWeight ? `<div class="stat-label" style="margin-top:4px;">${round1(latest.weight - settings.targetWeight)} lbs from target (${settings.targetWeight})</div>` : ''}
    </div>
    ` : ''}

    <div id="weight-list"></div>
  `;

  const chartPoints = entries.map(e => ({ x: formatDateShort(e.date), y: e.weight }));
  drawLineChart(document.getElementById('weight-chart'), chartPoints, { color: '#7C5CFF', height: 160 });

  const listEl = document.getElementById('weight-list');
  if (entries.length === 0) {
    listEl.innerHTML = `<div class="empty-state">No weight entries yet.</div>`;
  } else {
    const card = el(`<div class="card"></div>`);
    entries.slice().reverse().forEach(e => {
      const row = el(`
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${formatDate(e.date)}</div>
          </div>
          <div class="list-item-meta">${round1(e.weight)} lbs</div>
          <button class="btn btn-sm btn-ghost" style="border:none;color:var(--text-faint);">&times;</button>
        </div>
      `);
      row.querySelector('button').onclick = async () => {
        await DB.delete('weightEntries', e.id);
        showToast('Entry deleted');
        renderApp();
      };
      card.appendChild(row);
    });
    listEl.appendChild(card);
  }

  document.getElementById('add-weight-btn').onclick = () => openWeightForm();
  document.getElementById('set-target-btn').onclick = () => openTargetForm(settings);
}

function openWeightForm() {
  const bodyHtml = `
    <div class="field">
      <label>Date</label>
      <input type="date" id="w-date" value="${DB.todayISO()}" />
    </div>
    <div class="field">
      <label>Weight (lbs)</label>
      <input type="number" inputmode="decimal" id="w-weight" placeholder="0.0" />
    </div>
    <button class="btn btn-primary btn-block" id="w-save">Save</button>
  `;
  openSheet('Log Weight', bodyHtml, (body) => {
    body.querySelector('#w-weight').focus();
    body.querySelector('#w-save').onclick = async () => {
      const date = body.querySelector('#w-date').value || DB.todayISO();
      const weight = body.querySelector('#w-weight').value;
      if (!weight) { showToast('Enter a weight'); return; }
      await DB.saveWeightEntry({ date, weight });
      closeSheet();
      showToast('Weight logged');
      renderApp();
    };
  });
}

function openTargetForm(settings) {
  const bodyHtml = `
    <div class="field">
      <label>Target Weight (lbs)</label>
      <input type="number" inputmode="decimal" id="target-weight" value="${settings.targetWeight || ''}" placeholder="e.g. 180" />
    </div>
    <button class="btn btn-primary btn-block" id="target-save">Save</button>
  `;
  openSheet('Set Target Weight', bodyHtml, (body) => {
    body.querySelector('#target-save').onclick = async () => {
      const targetWeight = Number(body.querySelector('#target-weight').value) || null;
      await DB.saveSettings({ targetWeight });
      closeSheet();
      showToast('Target updated');
      renderApp();
    };
  });
}
