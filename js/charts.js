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

function drawLineChart(canvas, points, opts = {}) {
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

  const ys = points.map(p => p.y);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  if (minY === maxY) { minY -= 1; maxY += 1; }
  const range = maxY - minY;
  minY -= range * 0.1;
  maxY += range * 0.1;

  const xStep = points.length > 1 ? w / (points.length - 1) : 0;
  const yFor = (v) => padT + h - ((v - minY) / (maxY - minY)) * h;
  const xFor = (i) => padL + i * xStep;

  // gridlines + y labels
  ctx.strokeStyle = '#2C303C';
  ctx.fillStyle = '#5B5F70';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.lineWidth = 1;
  const gridLines = 3;
  for (let i = 0; i <= gridLines; i++) {
    const v = minY + (maxY - minY) * (i / gridLines);
    const y = yFor(v);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + w, y);
    ctx.stroke();
    ctx.fillText(v.toFixed(1), 2, y + 3);
  }

  // line
  const accent = opts.color || '#7C5CFF';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = xFor(i), y = yFor(p.y);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // fill under line
  const grad = ctx.createLinearGradient(0, padT, 0, padT + h);
  grad.addColorStop(0, accent + '33');
  grad.addColorStop(1, accent + '00');
  ctx.lineTo(xFor(points.length - 1), padT + h);
  ctx.lineTo(xFor(0), padT + h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // points
  ctx.fillStyle = accent;
  points.forEach((p, i) => {
    const x = xFor(i), y = yFor(p.y);
    ctx.beginPath();
    ctx.arc(x, y, i === points.length - 1 ? 3.5 : 2.2, 0, Math.PI * 2);
    ctx.fill();
  });

  // x labels (first, middle, last)
  ctx.fillStyle = '#5B5F70';
  ctx.font = '10.5px Inter, sans-serif';
  const labelIdxs = points.length > 1 ? [0, points.length - 1] : [0];
  if (points.length > 4) labelIdxs.splice(1, 0, Math.floor((points.length - 1) / 2));
  labelIdxs.forEach(i => {
    const x = xFor(i);
    const text = points[i].x;
    const tw = ctx.measureText(text).width;
    let tx = x - tw / 2;
    tx = Math.max(padL, Math.min(tx, padL + w - tw));
    ctx.fillText(text, tx, cssHeight - 4);
  });
}
