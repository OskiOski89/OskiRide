import { formatNumber } from './formatters.js';

function tickStep(span, intervals) {
  const rough = span / intervals;
  const magnitude = 10 ** Math.floor(Math.log10(rough || 1));
  return [1, 2, 5, 10].find(step => step * magnitude >= rough) * magnitude;
}

function makePlot(canvas, yMin, yMax, unit) {
  const { clientWidth: width, clientHeight: height } = canvas;
  if (!width || !height) return null;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  const styles = getComputedStyle(canvas);
  const color = property => styles.getPropertyValue(property).trim();
  const bounds = { left: 50, top: 24, right: width - 18, bottom: height - 28 };
  const step = tickStep(Math.max(yMax - yMin, 1), 4);
  const lower = Math.floor(yMin / step) * step;
  const upper = Math.max(lower + step, Math.ceil(yMax / step) * step);
  const y = value => bounds.bottom - (value - lower) / (upper - lower) * (bounds.bottom - bounds.top);
  const labels = color('--or-muted');
  ctx.scale(dpr, dpr);
  ctx.font = `12px ${styles.fontFamily}`;
  ctx.fillStyle = labels;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;
  ctx.strokeStyle = color('--or-border');
  for (let value = lower; value <= upper + step / 10; value += step) {
    ctx.beginPath();
    ctx.moveTo(bounds.left, y(value));
    ctx.lineTo(bounds.right, y(value));
    ctx.stroke();
    ctx.fillText(formatNumber(value, step < 1 ? 1 : 0), bounds.left - 7, y(value));
  }
  ctx.textAlign = 'left';
  ctx.fillText(unit, 2, 9);
  const drawXLabel = (text, at) => {
    ctx.fillStyle = labels;
    ctx.textAlign = 'center';
    const half = ctx.measureText(text).width / 2;
    ctx.fillText(text, Math.max(half, Math.min(width - half, at)), bounds.bottom + 14);
  };
  return { ctx, bounds, color, y, drawXLabel };
}

export function drawJournalBars(canvas, rows, { key, unit, grouping }) {
  const values = rows.map(row => key === 'duration' ? row.duration / 3600 : row[key]);
  const plot = makePlot(canvas, 0, Math.max(0, ...values), unit);
  if (!plot) return;
  const { ctx, bounds, color, y, drawXLabel } = plot;
  const asDate = (day, month) => month ? day.getFullYear() * 12 + day.getMonth()
    : Math.floor(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / (7 * 86400000));
  const byMonth = grouping === 'month';
  const first = asDate(rows[0].day, byMonth);
  const last = asDate(rows.at(-1).day, byMonth);
  const size = (bounds.right - bounds.left) / (last - first + 1);
  const barWidth = Math.max(1, Math.min(size * 0.68, 40));
  const dateFormat = new Intl.DateTimeFormat('en-US', byMonth ? { month: 'short', year: '2-digit' } : { day: '2-digit', month: '2-digit' });
  let lastLabelX = -Infinity;
  for (const [index, row] of rows.entries()) {
    const x = bounds.left + (asDate(row.day, byMonth) - first + 0.5) * size;
    if (Number.isFinite(values[index])) {
      ctx.fillStyle = color('--journal-line-a');
      ctx.fillRect(x - barWidth / 2, y(values[index]), barWidth, bounds.bottom - y(values[index]));
    }
    if (x - lastLabelX >= 57) {
      drawXLabel(dateFormat.format(row.day), x);
      lastLabelX = x;
    }
  }
}

export function drawJournalLines(canvas, series, { unit, xUnit, includeZero, startAtZero }) {
  const all = series.flat().filter(point => point.y !== null);
  if (!all.length) return;
  let minX = startAtZero ? 0 : Infinity;
  let maxX = 0;
  let minY = includeZero ? 0 : Infinity;
  let maxY = -Infinity;
  for (const point of all) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const plot = makePlot(canvas, minY, maxY, unit);
  if (!plot) return;
  const { ctx, bounds, color, y, drawXLabel } = plot;
  const xStep = tickStep(Math.max(maxX - minX, 0.01), 4);
  const startX = Math.floor(minX / xStep) * xStep;
  const endX = Math.max(startX + xStep, Math.ceil(maxX / xStep) * xStep);
  const x = value => bounds.left + (value - startX) / (endX - startX) * (bounds.right - bounds.left);
  for (let tick = startX; tick <= endX + xStep / 10; tick += xStep) {
    const digits = xStep >= 1 ? 0 : xStep >= 0.1 ? 1 : 2;
    drawXLabel(`${formatNumber(tick, digits)}${tick >= endX - xStep / 10 ? ` ${xUnit}` : ''}`, x(tick));
  }

  for (const [index, points] of series.entries()) {
    const stroke = color(index === 0 ? '--journal-line-a' : '--journal-line-b');
    ctx.strokeStyle = stroke;
    ctx.fillStyle = stroke;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.setLineDash(index === 0 ? [] : [6, 4]);
    ctx.beginPath();
    let from = null;
    for (const point of points) {
      if (point.y === null) {
        from = null;
        continue;
      }
      if (point.split || !from) ctx.moveTo(x(point.x), y(point.y));
      else ctx.lineTo(x(point.x), y(point.y));
      from = point;
    }
    ctx.stroke();
    const firstPoint = points.find(point => point.y !== null);
    if (firstPoint) {
      ctx.beginPath();
      ctx.arc(x(firstPoint.x), y(firstPoint.y), 2.5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
}
