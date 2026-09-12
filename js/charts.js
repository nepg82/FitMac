// charts.js — minimal dependency-free canvas line + bar chart
function drawBarChart(canvas, points, opts = {}) {
  // points: [{x: label(string), y: number}]
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth;
  const cssHeight = opts.height || 140;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (!points || points.length === 0) {
    ctx.fillStyle = '#5B5F70';
    ctx.font = '13px Inter, sans-serif';
    ctx.fillText('No data yet', 12, cssHeight / 2);
    return;
  }

  const padL = 38, padR = 12, padT = 14, padB = 22;
  const w = cssWidth - padL - padR;
  const h = cssHeight - padT - padB;

  const target = opts.target || 0;
  const ys = points.map(p => p.y);
  const step = opts.yStep;
  let maxY;
  if (step) {
    const rawMax = Math.max(...ys, target, step) * 1.1;
    maxY = Math.ceil(rawMax / step) * step;
    if (maxY <= Math.max(...ys, target)) maxY += step;
  } else {
    maxY = Math.max(...ys, target, 1) * 1.15;
  }
  const minY = 0;
  const yFor = (v) => padT + h - ((v - minY) / (maxY - minY)) * h;

  // gridlines + y labels
  ctx.strokeStyle = '#2C303C';
  ctx.fillStyle = '#5B5F70';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.lineWidth = 1;
  if (step) {
    for (let v = 0; v <= maxY; v += step) {
      const y = yFor(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + w, y);
      ctx.stroke();
      ctx.fillText(Math.round(v), 2, y + 3);
    }
  } else {
    const gridLines = 3;
    for (let i = 0; i <= gridLines; i++) {
      const v = minY + (maxY - minY) * (i / gridLines);
      const y = yFor(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + w, y);
      ctx.stroke();
      ctx.fillText(Math.round(v), 2, y + 3);
    }
  }

  // bars
  const accent = opts.color || '#7C5CFF';
  const n = points.length;
  const slot = w / n;
  const barWidth = Math.min(28, slot * 0.5);
  ctx.fillStyle = accent;
  points.forEach((p, i) => {
    if (!p.y) return; // leave a blank gap for untracked days
    const cx = padL + slot * i + slot / 2;
    const x = cx - barWidth / 2;
    const barTop = yFor(p.y);
    const barBottom = padT + h;
    const radius = Math.min(4, barWidth / 2);
    ctx.beginPath();
    ctx.moveTo(x, barBottom);
    ctx.lineTo(x, barTop + radius);
    ctx.arcTo(x, barTop, x + radius, barTop, radius);
    ctx.lineTo(x + barWidth - radius, barTop);
    ctx.arcTo(x + barWidth, barTop, x + barWidth, barTop + radius, radius);
    ctx.lineTo(x + barWidth, barBottom);
    ctx.closePath();
    ctx.fill();
  });

  // dashed target line
  if (target) {
    const ty = yFor(target);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#9297A8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, ty);
    ctx.lineTo(padL + w, ty);
    ctx.stroke();
    ctx.restore();
  }

  // x labels
  ctx.fillStyle = '#5B5F70';
  ctx.font = '10.5px Inter, sans-serif';
  points.forEach((p, i) => {
    const cx = padL + slot * i + slot / 2;
    const tw = ctx.measureText(p.x).width;
    ctx.fillText(p.x, cx - tw / 2, cssHeight - 4);
  });
}

// ---- Calendar-date helpers (used by drawLineChart for true-to-scale spacing) ----
function parseISODate(dateStr) {
  return new Date(dateStr + 'T00:00:00');
}

function isoFromDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function daysBetweenISO(a, b) {
  return Math.round((parseISODate(b) - parseISODate(a)) / 86400000);
}

// Pick a "nice" number of days between x-axis labels so we get a reasonable
// number of ticks (not one per data point) given the available pixel width.
function chooseTickIntervalDays(totalDays, pxAvailable) {
  const niceIntervals = [1, 2, 3, 5, 7, 14, 21, 30, 60, 90, 180, 365];
  const minLabelPx = 70;
  const maxTicks = Math.max(2, Math.floor(pxAvailable / minLabelPx));
  for (const interval of niceIntervals) {
    if (totalDays / interval <= maxTicks) return interval;
  }
  return niceIntervals[niceIntervals.length - 1];
}

// Pick a "nice" whole-number step between y-axis gridlines (1, 2, 5, 10, 20, 25, 50...)
// so labels read as clean integers regardless of the data's actual decimals.
function chooseNiceStep(range, maxTicks) {
  const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  for (const step of niceSteps) {
    if (range / step <= maxTicks) return step;
  }
  return niceSteps[niceSteps.length - 1];
}

function drawLineChart(canvas, points, opts = {}) {
  // points: [{date: 'YYYY-MM-DD', y: number}]
  // Points are spaced true-to-scale by calendar date rather than by index, so
  // a 2-month gap looks like a 2-month gap. The chart's content width grows
  // with the date range (at least opts.minPxPerDay px per day) so dense
  // stretches of entries stay readable; canvas.parentElement is expected to
  // be a horizontally-scrollable wrapper (overflow-x: auto) to accommodate
  // that width. We scroll it to the right edge so the latest entries show
  // by default.
  //
  // If opts.axisCanvas is given, y-axis labels are drawn on that separate,
  // non-scrolling canvas instead of on `canvas` itself, so the scale stays
  // visible while the plot scrolls underneath it. Labels are snapped to
  // clean whole numbers; the actual data points are still placed at their
  // exact (unrounded) values.
  const cssHeight = opts.height || 140;
  const dpr = window.devicePixelRatio || 1;
  const axisCanvas = opts.axisCanvas || null;

  function sizeCanvas(cv, width, height) {
    cv.width = width * dpr;
    cv.height = height * dpr;
    cv.style.width = width + 'px';
    cv.style.height = height + 'px';
    const cctx = cv.getContext('2d');
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.scale(dpr, dpr);
    cctx.clearRect(0, 0, width, height);
    return cctx;
  }

  if (!points || points.length === 0) {
    const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth || 300;
    const ctx = sizeCanvas(canvas, cssWidth, cssHeight);
    ctx.fillStyle = '#5B5F70';
    ctx.font = '13px Inter, sans-serif';
    ctx.fillText('No data yet', 12, cssHeight / 2);
    if (axisCanvas) sizeCanvas(axisCanvas, 28, cssHeight);
    return;
  }

  const sorted = points.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const minDate = sorted[0].date;
  const maxDate = sorted[sorted.length - 1].date;
  const totalDays = daysBetweenISO(minDate, maxDate);

  const padT = 14, padB = 22, padR = 12;
  const padL = axisCanvas ? 8 : 38; // less left padding needed when labels live on the axis canvas
  const wrapper = canvas.parentElement;
  const visibleWidth = wrapper.clientWidth || 300;
  const minPxPerDay = opts.minPxPerDay || 28;

  const neededContentWidth = padL + padR + totalDays * minPxPerDay;
  const cssWidth = Math.max(visibleWidth, neededContentWidth);
  const w = cssWidth - padL - padR;
  const h = cssHeight - padT - padB;

  const xFor = (dateStr) => (totalDays === 0
    ? padL + w / 2
    : padL + (daysBetweenISO(minDate, dateStr) / totalDays) * w);

  const ys = sorted.map(p => p.y);
  let dataMinY = Math.min(...ys), dataMaxY = Math.max(...ys);
  if (dataMinY === dataMaxY) { dataMinY -= 1; dataMaxY += 1; }
  const dataRange = dataMaxY - dataMinY;
  const minY = dataMinY - dataRange * 0.1;
  const maxY = dataMaxY + dataRange * 0.1;
  const yFor = (v) => padT + h - ((v - minY) / (maxY - minY)) * h; // precise, used for actual points too

  // Whole-number gridline values (labels only — point placement above stays exact)
  const step = chooseNiceStep(maxY - minY, 4);
  const tickValues = [];
  for (let v = Math.ceil(minY / step) * step; v <= maxY; v += step) tickValues.push(Math.round(v));
  if (tickValues.length === 0) tickValues.push(Math.round((minY + maxY) / 2));

  // Fixed y-axis canvas (doesn't scroll)
  if (axisCanvas) {
    const measureCtx = axisCanvas.getContext('2d');
    measureCtx.font = '11px "JetBrains Mono", monospace';
    let maxLabelWidth = 0;
    tickValues.forEach(tv => {
      const tw = measureCtx.measureText(String(tv)).width;
      if (tw > maxLabelWidth) maxLabelWidth = tw;
    });
    const axisWidth = Math.ceil(maxLabelWidth) + 14;
    const axisCtx = sizeCanvas(axisCanvas, axisWidth, cssHeight);
    axisCtx.fillStyle = '#5B5F70';
    axisCtx.font = '11px "JetBrains Mono", monospace';
    tickValues.forEach(tv => {
      const y = yFor(tv);
      const text = String(tv);
      const tw = axisCtx.measureText(text).width;
      axisCtx.fillText(text, axisWidth - tw - 6, y + 3);
    });
  }

  // Scrollable plot canvas
  const ctx = sizeCanvas(canvas, cssWidth, cssHeight);

  // horizontal gridlines (labels drawn separately above if axisCanvas is set)
  ctx.strokeStyle = '#2C303C';
  ctx.lineWidth = 1;
  tickValues.forEach(tv => {
    const y = yFor(tv);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + w, y);
    ctx.stroke();
  });
  if (!axisCanvas) {
    ctx.fillStyle = '#5B5F70';
    ctx.font = '11px "JetBrains Mono", monospace';
    tickValues.forEach(tv => ctx.fillText(String(tv), 2, yFor(tv) + 3));
  }

  // line
  const accent = opts.color || '#7C5CFF';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  sorted.forEach((p, i) => {
    const x = xFor(p.date), y = yFor(p.y);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // fill under line
  const grad = ctx.createLinearGradient(0, padT, 0, padT + h);
  grad.addColorStop(0, accent + '33');
  grad.addColorStop(1, accent + '00');
  ctx.lineTo(xFor(maxDate), padT + h);
  ctx.lineTo(xFor(minDate), padT + h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // points — placed at exact (unrounded) values, independent of the whole-number gridlines
  ctx.fillStyle = accent;
  sorted.forEach((p, i) => {
    const x = xFor(p.date), y = yFor(p.y);
    ctx.beginPath();
    ctx.arc(x, y, i === sorted.length - 1 ? 3.5 : 2.2, 0, Math.PI * 2);
    ctx.fill();
  });

  // x labels — calendar-spaced ticks (e.g. every week/month), not one per point
  ctx.fillStyle = '#5B5F70';
  ctx.font = '10.5px Inter, sans-serif';
  let tickDates;
  if (totalDays === 0) {
    tickDates = [minDate];
  } else {
    const interval = chooseTickIntervalDays(totalDays, w);
    const offsets = [];
    for (let c = 0; c <= totalDays; c += interval) offsets.push(c);
    const lastOffset = offsets[offsets.length - 1];
    if (lastOffset !== totalDays) {
      if (offsets.length > 1 && totalDays - lastOffset < interval / 3) {
        offsets[offsets.length - 1] = totalDays;
      } else {
        offsets.push(totalDays);
      }
    }
    tickDates = offsets.map(o => isoFromDate(new Date(parseISODate(minDate).getTime() + o * 86400000)));
  }
  tickDates.forEach((d) => {
    const x = xFor(d);
    const text = typeof formatDateShort === 'function' ? formatDateShort(d) : d;
    const tw = ctx.measureText(text).width;
    let tx = x - tw / 2;
    tx = Math.max(padL, Math.min(tx, padL + w - tw));
    ctx.fillText(text, tx, cssHeight - 4);
  });

  // default to showing the most recent entries
  wrapper.scrollLeft = wrapper.scrollWidth;
}