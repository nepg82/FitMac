// weight-export.js — "Export PDF" for the Weight tab.
//
// Approach: rather than printing in-place with window.print(), we build a
// fully self-contained HTML document (data + chart + a Print button baked
// in) and open it in a new tab via a Blob URL. Two reasons:
//
//   1. window.print() is a no-op when FitMac is running as an installed
//      standalone PWA on iOS — there's no Safari chrome to host the print
//      sheet. Opening a real new tab escapes standalone mode and lands in
//      actual Safari, where printing/"Save as PDF" works normally.
//   2. The exported page is then a standalone artifact in its own right —
//      it can be reprinted, bookmarked, or shared without going back
//      through the app.
//
// The chart-drawing logic (square grid cells, dashed segments across long
// gaps, MAX/CURRENT/MIN stat row) is adapted from new_weight_chart.html,
// with a light/print-friendly palette and a fixed 17x11in (tabloid,
// landscape) @page size. The SVG's viewBox holds the *computed* chart
// geometry; the print CSS scales it to the page width via width:100%, so a
// chart spanning years of data shrinks to fit one page rather than
// requiring pagination or a custom-sized sheet.

function _fmtW(w) {
  return Number.isInteger(w) ? String(w) : w.toFixed(1);
}

function _fmtDateShort(d) {
  return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' });
}

// Builds the stats row (MAX / CURRENT / MIN with deltas) as an HTML string.
function buildStatsRowHTML(parsed) {
  const maxEntry = parsed.reduce((a, b) => (b.weight > a.weight ? b : a));
  const minEntry = parsed.reduce((a, b) => (b.weight < a.weight ? b : a));
  const currentEntry = parsed[parsed.length - 1];

  const diff1 = (maxEntry.weight - currentEntry.weight).toFixed(1).replace(/\.0$/, '');
  const diff2 = (currentEntry.weight - minEntry.weight).toFixed(1).replace(/\.0$/, '');

  function statBlock(entry, label, extraClass) {
    return `<div class="stat ${extraClass || ''}">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${_fmtW(entry.weight)}</div>
      <div class="stat-date">${_fmtDateShort(entry.date)}</div>
    </div>`;
  }
  function diffBlock(diff) {
    return `<div class="diff">(${diff})</div>`;
  }

  return `<div class="stats">
    ${statBlock(maxEntry, 'MAX')}
    ${diffBlock(diff1)}
    ${statBlock(currentEntry, 'CURRENT', 'current')}
    ${diffBlock(diff2)}
    ${statBlock(minEntry, 'MIN')}
  </div>`;
}

// Builds the full-history SVG chart as a string. Returns { svg, width, height }.
function buildChartSVG(parsed) {
  const first = parsed[0].date;
  const last = parsed[parsed.length - 1].date;
  const totalDays = Math.max(1, (last - first) / (1000 * 60 * 60 * 24));

  const weights = parsed.map(d => d.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);

  const margin = { top: 20, right: 30, bottom: 50, left: 60 };

  const xStepDays = totalDays > 365 ? 30 : (totalDays > 120 ? 14 : 7);
  const yStepLbs = 2;

  const desiredCellPx = 46;
  const numXCells = totalDays / xStepDays;

  const plotWidth = Math.max(600, numXCells * desiredCellPx);
  const weightRangePadded = (maxW - minW) + yStepLbs * 4;
  const numYCells = weightRangePadded / yStepLbs;
  const plotHeight = numYCells * desiredCellPx;

  const width = plotWidth + margin.left + margin.right;
  const height = plotHeight + margin.top + margin.bottom;

  const yMin = Math.floor((minW - yStepLbs * 2) / yStepLbs) * yStepLbs;
  const yMax = yMin + numYCells * yStepLbs;

  function xForDate(d) {
    const days = (d - first) / (1000 * 60 * 60 * 24);
    return margin.left + (days / xStepDays) * desiredCellPx;
  }
  function yForWeight(w) {
    return margin.top + plotHeight - ((w - yMin) / (yMax - yMin)) * plotHeight;
  }

  let content = '';

  // Vertical gridlines (dates)
  let dayCursor = 0;
  while (dayCursor <= totalDays + xStepDays) {
    const d = new Date(first.getTime() + dayCursor * 24 * 60 * 60 * 1000);
    const x = xForDate(d);
    if (x <= margin.left + plotWidth + 0.5) {
      content += `<line class="gridline" x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + plotHeight}" />`;
      const label = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      content += `<text class="axis-label" x="${x}" y="${margin.top + plotHeight + 18}" text-anchor="middle">${label}</text>`;
    }
    dayCursor += xStepDays;
  }

  // Horizontal gridlines (weight)
  for (let w = yMin; w <= yMax + 0.01; w += yStepLbs) {
    const y = yForWeight(w);
    content += `<line class="gridline" x1="${margin.left}" y1="${y}" x2="${margin.left + plotWidth}" y2="${y}" />`;
    content += `<text class="axis-label" x="${margin.left - 10}" y="${y + 4}" text-anchor="end">${w}</text>`;
  }

  // Border
  content += `<rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" fill="none" stroke="var(--grid-strong)" stroke-width="1"/>`;

  // Axis titles
  content += `<text class="axis-title" x="${margin.left + plotWidth / 2}" y="${height - 8}" text-anchor="middle">Date</text>`;
  content += `<text class="axis-title" x="16" y="${margin.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90, 16, ${margin.top + plotHeight / 2})">Weight (lb)</text>`;

  // Line segments — dashed across gaps > 6 weeks
  const gapThresholdDays = 42;
  for (let i = 0; i < parsed.length - 1; i++) {
    const p1 = parsed[i], p2 = parsed[i + 1];
    const x1 = xForDate(p1.date), y1 = yForWeight(p1.weight);
    const x2 = xForDate(p2.date), y2 = yForWeight(p2.weight);
    const gapDays = (p2.date - p1.date) / (1000 * 60 * 60 * 24);
    const cls = gapDays > gapThresholdDays ? 'data-line gap' : 'data-line';
    content += `<path class="${cls}" d="M${x1.toFixed(2)},${y1.toFixed(2)} L${x2.toFixed(2)},${y2.toFixed(2)}" />`;
  }

  // Dots
  parsed.forEach((p) => {
    const x = xForDate(p.date), y = yForWeight(p.weight);
    content += `<circle class="data-dot" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4" />`;
  });

  const svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
  return { svg, width, height };
}

// Builds the full standalone HTML document (string) for the export tab.
function buildExportDocument(entries, settings) {
  const parsed = entries
    .map(e => ({ date: new Date(e.date + 'T00:00:00'), weight: e.weight, raw: e.date }))
    .sort((a, b) => a.date - b.date);

  const first = parsed[0].date;
  const last = parsed[parsed.length - 1].date;
  const rangeLabel = `${first.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} – ${last.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
  const generatedLabel = new Date().toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  const statsHTML = buildStatsRowHTML(parsed);
  const { svg } = buildChartSVG(parsed);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>FitMac — Weight Export</title>
<style>
  :root {
    --bg: #ffffff;
    --panel: #ffffff;
    --grid: #e6e6e6;
    --grid-strong: #c9c9c9;
    --text: #1c1c1c;
    --muted: #6b7280;
    --line: #7C5CFF;
    --dot: #7C5CFF;
    --accent: #d9622b;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .wrap { max-width: 1400px; margin: 0 auto; padding: 24px 28px 40px; }
  .toolbar {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 18px;
  }
  h1 { font-size: 19px; font-weight: 700; margin: 0 0 2px; }
  .sub { color: var(--muted); font-size: 12.5px; margin: 0; }
  .print-btn {
    background: #7C5CFF; color: #fff; border: none; border-radius: 8px;
    padding: 9px 16px; font-size: 13.5px; font-weight: 600; cursor: pointer;
  }
  .print-btn:hover { background: #6a4ce8; }
  .stats { display: flex; align-items: flex-start; gap: 0; margin: 4px 0 18px; flex-wrap: wrap; }
  .stat { text-align: center; min-width: 76px; }
  .stat-label { font-size: 11px; color: var(--muted); letter-spacing: 0.04em; }
  .stat-value { font-size: 22px; font-weight: 700; margin-top: 2px; }
  .stat.current .stat-value { color: var(--accent); }
  .stat-date { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
  .diff { align-self: center; text-align: center; min-width: 60px; color: var(--muted); font-size: 13px; padding: 0 4px; }
  svg { display: block; width: 100%; height: auto; }
  .gridline { stroke: var(--grid); stroke-width: 1; }
  .axis-label { fill: var(--muted); font-size: 11px; }
  .axis-title { fill: var(--muted); font-size: 12px; }
  .data-line { fill: none; stroke: var(--line); stroke-width: 2; }
  .data-line.gap { stroke-dasharray: 6 5; }
  .data-dot { fill: var(--dot); stroke: var(--panel); stroke-width: 1.5; }
  .footer-note { color: var(--muted); font-size: 11px; margin-top: 14px; }

  @media print {
    .no-print { display: none !important; }
    .wrap { max-width: none; padding: 0; }
    @page { size: 17in 11in; margin: 0.5in; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="toolbar">
      <div>
        <h1>Weight Over Time</h1>
        <p class="sub">${parsed.length} entries · ${rangeLabel}</p>
      </div>
      <button class="print-btn no-print" onclick="window.print()">Print / Save as PDF</button>
    </div>
    ${statsHTML}
    ${svg}
    <p class="footer-note">Generated ${generatedLabel} from FitMac${settings && settings.activeUsername ? ' · ' + settings.activeUsername : ''}</p>
  </div>
</body>
</html>`;
}

async function exportWeightPDF() {
  const entries = await DB.getWeightEntries();
  if (!entries || entries.length === 0) {
    showToast('No weight entries to export yet');
    return;
  }
  const settings = await DB.getSettings();
  const html = buildExportDocument(entries, settings);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // Revoke well after the new tab has had time to load it.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
