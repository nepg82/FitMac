// history.js — builds per-exercise history from a user's export and summarizes last/max.
// Display-only: nothing here ever writes into an input field.
const History = (() => {
  const key = n => (n || '').trim().toLowerCase();

  function build(json) {
    const idx = new Map(), names = {};
    for (const s of (json && json.workoutSessions) || []) {
      if (s.name) names[s.name] = (names[s.name] || 0) + 1;
      for (const ex of s.exercises || []) {
        const k = key(ex.exercise); if (!k) continue;
        if (!idx.has(k)) idx.set(k, { name: ex.exercise.trim(), rows: [] });
        idx.get(k).rows.push({
          date: s.date, t: s.createdAt || 0, sets: +ex.sets || 0, reps: +ex.reps || 0, weight: +ex.weight || 0
        });
      }
    }
    return { idx, names };
  }

  const newer = (a, b) => (b.date + String(b.t).padStart(15, '0')).localeCompare(a.date + String(a.t).padStart(15, '0'));

  function summarize(entry) {
    if (!entry || !entry.rows.length) return null;
    const rows = [...entry.rows].sort(newer);
    const weighted = rows.filter(r => r.weight > 0);
    const max = weighted.length
      ? [...weighted].sort((a, b) => b.weight - a.weight || b.reps - a.reps || newer(a, b))[0]
      : [...rows].sort((a, b) => b.reps - a.reps || newer(a, b))[0];
    return { last: rows[0], max };
  }

  const md = iso => { const [, m, d] = (iso || '').split('-').map(Number); return m ? `${m}/${d}` : ''; };
  const dash = n => (n ? n : '–');
  const fmtLast = r => `${dash(r.sets)}×${dash(r.reps)}${r.weight ? ' @ ' + r.weight : ''} · ${md(r.date)}`;
  const fmtMax = r => (r.weight ? `${r.weight} × ${dash(r.reps)}` : `${dash(r.reps)} reps`) + ` · ${md(r.date)}`;

  // Serialize/restore for the offline cache
  const pack = h => ({ idx: [...h.idx], names: h.names });
  const unpack = o => ({ idx: new Map(o.idx), names: o.names });

  return { key, build, summarize, fmtLast, fmtMax, pack, unpack };
})();
