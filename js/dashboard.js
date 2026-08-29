// dashboard.js
async function renderDashboard(content) {
  const today = DB.todayISO();
  const [todayMeals, weightEntries, sessions, settings] = await Promise.all([
    DB.getMealEntriesForDate(today),
    DB.getWeightEntries(),
    DB.getWorkoutSessions(),
    DB.getSettings()
  ]);

  const totals = todayMeals.reduce((acc, m) => {
    acc.protein += m.totals.protein;
    acc.carbs += m.totals.carbs;
    acc.fat += m.totals.fat;
    return acc;
  }, { protein: 0, carbs: 0, fat: 0 });
  const totalCal = totals.protein * 4 + totals.carbs * 4 + totals.fat * 9;
  const pPct = totalCal ? (totals.protein * 4 / totalCal) * 100 : 0;
  const cPct = totalCal ? (totals.carbs * 4 / totalCal) * 100 : 0;
  const fPct = totalCal ? (totals.fat * 9 / totalCal) * 100 : 0;

  const latestWeight = weightEntries[weightEntries.length - 1];
  const prevWeight = weightEntries[weightEntries.length - 2];
  const recentWeights = weightEntries.slice(-14);

  const lastSession = sessions[0];
  const last7 = sessions.filter(s => {
    const d = new Date(s.date + 'T00:00:00');
    return (Date.now() - d.getTime()) / 86400000 <= 7;
  });

  content.innerHTML = `
    <div class="card">
      <div class="card-title">Today's Macros</div>
      <div class="big-number">${Math.round(totalCal)} <span style="font-size:14px;color:var(--text-dim);">cal</span></div>
      <div class="macro-bar">
        <div class="p" style="width:${pPct}%"></div>
        <div class="c" style="width:${cPct}%"></div>
        <div class="f" style="width:${fPct}%"></div>
      </div>
      <div class="macro-legend">
        <span><span class="dot p"></span>Protein <span class="val">${round1(totals.protein)}g</span></span>
        <span><span class="dot c"></span>Carbs <span class="val">${round1(totals.carbs)}g</span></span>
        <span><span class="dot f"></span>Fat <span class="val">${round1(totals.fat)}g</span></span>
      </div>
      ${todayMeals.length === 0 ? `<div class="stat-label" style="margin-top:10px;">No meals logged today yet</div>` : ''}
    </div>

    <div class="card">
      <div class="stat-row">
        <div class="card-title" style="margin-bottom:0;">Weight</div>
        ${settings.targetWeight ? `<span class="stat-label mono">Target: ${settings.targetWeight} lbs</span>` : ''}
      </div>
      ${latestWeight ? `
        <div class="big-number" style="margin-top:8px;">${round1(latestWeight.weight)} <span style="font-size:14px;color:var(--text-dim);">lbs</span></div>
        ${prevWeight ? `<div class="stat-label">${latestWeight.weight - prevWeight.weight >= 0 ? '+' : ''}${round1(latestWeight.weight - prevWeight.weight)} lbs since last entry</div>` : ''}
        <canvas class="chart-canvas" id="dash-weight-chart" style="margin-top:10px;"></canvas>
      ` : `<div class="empty-state">No weight entries yet</div>`}
    </div>

    <div class="card">
      <div class="card-title">Workouts</div>
      ${lastSession ? `
        <div class="stat-row">
          <span class="list-item-title">${escapeHtml(lastSession.name)}</span>
          <span class="stat-label mono">${formatDate(lastSession.date)}</span>
        </div>
        <div class="list-item-sub" style="margin-top:4px;">${lastSession.exercises.map(e => escapeHtml(e.exercise)).join(', ')}</div>
        <div class="stat-label" style="margin-top:10px;">${last7.length} session${last7.length !== 1 ? 's' : ''} in the last 7 days</div>
      ` : `<div class="empty-state">No workouts logged yet</div>`}
    </div>

    <div class="btn-row">
      <button class="btn btn-ghost btn-block" id="export-btn">Export Backup (JSON)</button>
    </div>
  `;

  if (latestWeight) {
    const points = recentWeights.map(e => ({ x: formatDateShort(e.date), y: e.weight }));
    drawLineChart(document.getElementById('dash-weight-chart'), points, { color: '#7C5CFF', height: 100 });
  }

  document.getElementById('export-btn').onclick = async () => {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tracker-backup-${DB.todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
}
