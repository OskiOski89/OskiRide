import {
  ALL_GPX, comparisonSeries, distanceKm, filterJournalRides, indexJournalRoutes, journalPeriods,
  peakPower, rideDate, summarizeRides,
} from '../session/rideJournalData.js';
import { formatNumber, formatTimeMMSS, formatWorkoutDuration } from './formatters.js';
import { drawJournalBars, drawJournalLines } from './rideJournalCharts.js';

const PAGE_SIZE = 6;
const dateFormat = new Intl.DateTimeFormat('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' });
const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const sourceLabels = {
  simulation: 'Simulation', device: 'Device power', 'virtual-power': 'Estimated zPower', mixed: 'Mixed power sources',
};

const unitValue = (unit, digits = 0) => value => `${formatNumber(value, digits)} ${unit}`;
const km = unitValue('km', 2);
const metres = unitValue('m');
const watts = unitValue('W');
const clock = seconds => seconds < 3600 ? formatTimeMMSS(seconds)
  : `${Math.floor(seconds / 3600)}:${formatTimeMMSS(seconds % 3600)}`;
const duration = seconds => {
  const rounded = Math.round(seconds);
  if (rounded < 3600) return formatWorkoutDuration(rounded);
  return `${Math.floor(rounded / 3600)} h ${Math.floor(rounded % 3600 / 60)} min`;
};
const compareMetrics = [
  ['Ride time', ride => ride.elapsedSeconds, clock],
  ['Distance', distanceKm, km, 2],
  ['Elevation gain', ride => ride.elevationGainM, metres],
  ['Avg. speed', ride => ride.elapsedSeconds > 0 && distanceKm(ride) !== null ? distanceKm(ride) * 3600 / ride.elapsedSeconds : null, unitValue('km/h', 1), 1],
  ['Avg. power', ride => ride.avgWatts, watts],
  ['Normalized power (NP)', ride => ride.np, watts],
  ['Best 5-minute power', ride => peakPower(ride, 300, 'm5'), watts],
  ['Best 20-minute power', ride => peakPower(ride, 1200, 'm20'), watts],
  ['Avg. heart rate', ride => ride.avgHr > 0 ? ride.avgHr : null, unitValue('bpm')],
  ['Avg. cadence', ride => ride.avgCadence, unitValue('rpm')],
  ['Work', ride => ride.energyKj, unitValue('kJ')],
  ['TSS', ride => ride.tss, value => formatNumber(value, 0)],
];
const trendMetrics = {
  distance: { unit: 'km', format: km },
  duration: { unit: 'h', format: duration },
  ascent: { unit: 'm', format: metres },
  m5: { unit: 'W', format: watts },
  m20: { unit: 'W', format: watts },
};
const traceUnits = { watts: 'W', hr: 'bpm', cadence: 'rpm', speedMps: 'km/h', ele: 'm above sea level' };

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function dateLabel(ride) {
  const date = rideDate(ride);
  return Number.isFinite(date.getTime()) ? `${dateFormat.format(date)}, ${timeFormat.format(date)}` : 'No date';
}

const rideLabel = ride => `${ride.journalRouteName} · ${dateLabel(ride)}`;
const fmt = (value, format) => Number.isFinite(value) ? format(value) : '—';

export function mountRideJournal(history, routeLibrary, { presets, onViewRide, onChooseRoute }) {
  const byId = id => document.getElementById(id);
  const list = byId('ride-history-list');
  const route = byId('journal-route');
  const range = byId('journal-range');
  const trendMetric = byId('journal-trend-metric');
  const grouping = byId('journal-grouping');
  const comparison = byId('journal-comparison');
  const comparisonMetric = byId('journal-compare-metric');
  const comparisonAxis = byId('journal-compare-axis');
  const compareButton = byId('btn-journal-compare');
  const trendChart = byId('journal-trend-chart');
  const comparisonChart = byId('journal-comparison-chart');
  let indexed = { routes: new Map(), rides: [] };
  let filtered = [];
  let periods = [];
  let displayedTraces = [];
  let selectedIds = [];
  let comparedRides = [];
  let page = 0;
  let refreshNumber = 0;
  let comparisonNumber = 0;

  function showStatus(text, error = false) {
    byId('journal-status').textContent = text;
    byId('journal-status').classList.toggle('is-error', error);
    byId('btn-journal-retry').hidden = !error;
  }

  function populateRouteFilter(value) {
    route.replaceChildren(new Option('All routes', ''), new Option('All GPX routes', ALL_GPX));
    for (const [group, heading] of [['gpx', 'GPX routes'], ['preset', 'Built-in routes'], ['legacy', 'Older rides']]) {
      const entries = [...indexed.routes].filter(([, info]) => info.group === group)
        .sort(([, a], [, b]) => a.name.localeCompare(b.name, 'en'));
      if (!entries.length) continue;
      const counts = new Map();
      for (const [, info] of entries) counts.set(info.name, (counts.get(info.name) || 0) + 1);
      const options = element('optgroup');
      options.label = heading;
      for (const [key, info] of entries) {
        const name = counts.get(info.name) > 1 ? `${info.name} · ${fmt(info.distanceM / 1000, km)} · ${key.slice(4, 10)}` : info.name;
        options.append(new Option(name, key));
      }
      route.append(options);
    }
    route.value = [...route.options].some(option => option.value === value) ? value : '';
  }

  function hideComparison() {
    comparisonNumber++;
    comparedRides = [];
    comparison.hidden = true;
  }

  function renderSelection() {
    const count = selectedIds.length;
    byId('journal-selection').hidden = count === 0 && filtered.length === 0;
    byId('journal-selection-status').textContent = [
      'Select two rides to compare.', 'Select one more ride.', 'Two rides selected for comparison.',
    ][count];
    const legend = byId('journal-selected-rides');
    legend.hidden = count === 0;
    legend.replaceChildren(...selectedIds.map((id, i) => {
      const ride = indexed.rides.find(item => item.id === id);
      return element('li', `${i === 0 ? 'A' : 'B'} · ${rideLabel(ride)}`);
    }));
    byId('journal-selection-actions').hidden = count === 0;
    compareButton.disabled = count !== 2;
    for (const input of list.querySelectorAll('input[type="checkbox"]')) {
      input.checked = selectedIds.includes(input.value);
      input.disabled = count === 2 && !input.checked;
    }
  }

  function renderRide(ride) {
    const li = element('li', null, 'journal-ride');
    const check = element('label', null, 'journal-ride-check');
    const input = element('input');
    input.type = 'checkbox';
    input.value = ride.id;
    input.setAttribute('aria-label', `Select for comparison: ${rideLabel(ride)}`);
    input.addEventListener('change', () => {
      selectedIds = input.checked ? [...selectedIds, ride.id] : selectedIds.filter(id => id !== ride.id);
      hideComparison();
      renderSelection();
    });
    check.append(input);
    const copy = element('div');
    const facts = [dateLabel(ride), fmt(distanceKm(ride), km), fmt(ride.elapsedSeconds, clock), fmt(ride.avgWatts, watts)];
    if (sourceLabels[ride.powerSource]) facts.push(sourceLabels[ride.powerSource]);
    if (ride.finished === false) facts.push('Recorded during ride');
    copy.append(element('strong', ride.journalRouteName, 'journal-ride-name'), element('span', facts.join(' · '), 'journal-ride-meta'));
    const details = element('button', 'Details', 'btn btn-secondary');
    details.type = 'button';
    details.setAttribute('aria-label', `Ride details: ${rideLabel(ride)}`);
    details.addEventListener('click', async () => {
      details.disabled = true;
      try {
        const snapshot = await history.get(ride.id);
        if (!snapshot) {
          await refresh();
          showStatus('This ride is no longer in the journal.');
        } else if (details.offsetParent) onViewRide(snapshot);
      } catch {
        showStatus('Could not load ride details.', true);
      } finally {
        details.disabled = false;
      }
    });
    li.append(check, copy, details);
    return li;
  }

  function renderList() {
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    list.replaceChildren(...filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(renderRide));
    list.hidden = filtered.length === 0;
    byId('journal-empty').hidden = filtered.length > 0;
    byId('journal-empty').textContent = indexed.rides.length ? 'No rides in the selected period.'
      : 'Finish a ride to add it to the journal.';
    byId('btn-journal-choose-route').hidden = indexed.rides.length > 0;
    byId('btn-journal-reset-filters').hidden = !(indexed.rides.length && !filtered.length);
    byId('journal-pagination').hidden = pages === 1;
    byId('btn-journal-prev').disabled = page === 0;
    byId('btn-journal-next').disabled = page === pages - 1;
    byId('journal-page').textContent = `Page ${page + 1} z ${pages}`;
    renderSelection();
  }

  function plotTrend() {
    if (trendChart.hidden) return;
    drawJournalBars(trendChart, periods, { key: trendMetric.value, unit: trendMetrics[trendMetric.value].unit, grouping: grouping.value });
  }

  function renderTrend() {
    const key = trendMetric.value;
    const hasValues = periods.some(row => Number.isFinite(row[key]));
    const trendNote = byId('journal-trend-note');
    trendNote.hidden = hasValues;
    trendNote.textContent = filtered.length ? 'No data for this metric in the selected period.' : 'Save a ride in the selected period to see the chart.';
    trendChart.hidden = !hasValues;
    byId('journal-trend-details').hidden = periods.length === 0;
    const title = trendMetric.selectedOptions[0].textContent;
    const isMonth = grouping.value === 'month';
    const labels = isMonth ? monthFormat : dateFormat;
    trendChart.setAttribute('aria-label', `${title} · ${isMonth ? 'months' : 'tygodnie'}`);
    byId('journal-period-column').textContent = isMonth ? 'Month' : 'Week starting';
    byId('journal-trend-column').textContent = title;
    byId('journal-trend-values').replaceChildren(...periods.map(row => {
      const tr = element('tr');
      const label = element('th', labels.format(row.day));
      label.scope = 'row';
      tr.append(label, element('td', fmt(row[key], trendMetrics[key].format)));
      return tr;
    }));
    plotTrend();
  }

  function renderFilters() {
    filtered = filterJournalRides(indexed, route.value, range.value);
    const totals = summarizeRides(filtered);
    byId('journal-count').textContent = formatNumber(totals.count, 0);
    byId('journal-distance').textContent = km(totals.distance);
    byId('journal-duration').textContent = duration(totals.duration);
    byId('journal-ascent').textContent = metres(totals.ascent);
    byId('journal-legacy-note').hidden = !filtered.some(ride => ride.legacy);
    periods = journalPeriods(filtered, grouping.value);
    renderList();
    renderTrend();
  }

  async function refresh(routeKey) {
    const generation = ++refreshNumber;
    if (byId('journal-content').hidden) showStatus('Loading saved rides…');
    const [readRides, readLibrary] = await Promise.allSettled([history.list(), routeLibrary.list()]);
    if (generation !== refreshNumber) return;
    if (readRides.status === 'rejected') {
      showStatus('Could not load saved rides. Refresh the journal and try again.', true);
      return;
    }
    indexed = indexJournalRoutes(readRides.value, readLibrary.status === 'fulfilled' ? readLibrary.value : [], presets);
    const availableIds = new Set(indexed.rides.map(ride => ride.id));
    const selection = selectedIds.filter(id => availableIds.has(id));
    if (selection.length !== selectedIds.length) hideComparison();
    selectedIds = selection;
    populateRouteFilter(routeKey ?? route.value);
    if (routeKey != null) {
      range.value = 'all';
      page = 0;
    }
    byId('journal-content').hidden = false;
    showStatus(readLibrary.status === 'fulfilled' ? 'Rides on this device' : 'The GPX route library is temporarily unavailable.', readLibrary.status === 'rejected');
    renderFilters();
  }

  function plotComparison() {
    if (comparison.hidden || comparisonChart.hidden || displayedTraces.length !== 2) return;
    drawJournalLines(comparisonChart, displayedTraces, {
      unit: traceUnits[comparisonMetric.value], xUnit: comparisonAxis.value === 'time' ? 'min' : 'km',
      includeZero: comparisonMetric.value !== 'ele', startAtZero: comparisonAxis.value !== 'route',
    });
  }

  function renderComparisonChart() {
    const metric = comparisonMetric.value;
    displayedTraces = comparedRides.map(ride => comparisonSeries(ride, metric, comparisonAxis.value));
    const present = displayedTraces.map(trace => trace.some(point => point.y !== null));
    const hasData = present.some(Boolean);
    const note = byId('journal-comparison-chart-note');
    note.hidden = present.every(Boolean);
    note.textContent = hasData ? `No ride data ${present[0] ? 'B' : 'A'}.` : 'No samples for the selected metric.';
    comparisonChart.hidden = !hasData;
    comparisonChart.setAttribute('aria-label', `${comparisonMetric.selectedOptions[0].textContent} · ${comparisonAxis.selectedOptions[0].textContent}`);
    plotComparison();
  }

  async function showComparison() {
    const generation = ++comparisonNumber;
    const chosen = selectedIds.map(id => indexed.rides.find(ride => ride.id === id));
    const note = byId('journal-comparison-note');
    comparison.hidden = false;
    byId('journal-comparison-content').hidden = true;
    note.textContent = 'Loading both rides…';
    comparison.scrollIntoView({ block: 'start' });
    byId('journal-comparison-heading').focus({ preventScroll: true });
    try {
      const snapshots = await Promise.all(chosen.map(ride => history.get(ride.id)));
      if (generation !== comparisonNumber) return;
      if (!snapshots.every(Boolean)) throw new Error('No saved ride.');
      comparedRides = snapshots;
      const [a, b] = snapshots;
      const [infoA, infoB] = chosen;
      const sameRoute = infoA.journalRouteKey === infoB.journalRouteKey;
      const exactMatch = Boolean(a.routeKey && a.routeKey === b.routeKey && !a.routeKey.startsWith('gpx-name:'));
      const routeAxis = comparisonAxis.querySelector('option[value="route"]');
      routeAxis.disabled = !exactMatch;
      comparisonAxis.value = exactMatch ? 'route' : 'time';
      const context = exactMatch ? 'Same route' : sameRoute ? 'Routes matched by saved name' : 'Different routes';
      const start = exactMatch && Number.isFinite(a.rideStartDistanceM) && Number.isFinite(b.rideStartDistanceM)
        ? ` · A start: ${km(a.rideStartDistanceM / 1000)} · B start: ${km(b.rideStartDistanceM / 1000)}` : '';
      note.textContent = context + start + (a.legacy || b.legacy || a.restoredLegacy || b.restoredLegacy
        ? '. Chart times are approximate for older rides.' : '.');
      byId('journal-comparison-legend').replaceChildren(...chosen.map((ride, index) => {
        const source = sourceLabels[snapshots[index].powerSource];
        return element('div', `${index === 0 ? 'A' : 'B'} · ${rideLabel(ride)}${source ? ` · ${source}` : ''}`, 'journal-legend-entry');
      }));
      byId('journal-comparison-values').replaceChildren(...compareMetrics.map(([name, value, format, digits = 0]) => {
        const x = value(a), y = value(b);
        const scale = 10 ** digits;
        const delta = Number.isFinite(x) && Number.isFinite(y) ? (Math.round(y * scale) - Math.round(x * scale)) / scale : null;
        const diff = delta === null ? '—' : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${format(Math.abs(delta))}`;
        const row = element('tr');
        const label = element('th', name);
        label.scope = 'row';
        row.append(label, element('td', fmt(x, format)), element('td', fmt(y, format)), element('td', diff));
        return row;
      }));
      byId('journal-comparison-content').hidden = false;
      renderComparisonChart();
      comparison.scrollIntoView({ block: 'start' });
    } catch {
      if (generation === comparisonNumber) note.textContent = 'Could not load both rides. Return to the list and try again.';
    }
  }

  for (const input of [route, range]) input.addEventListener('change', () => { page = 0; renderFilters(); });
  trendMetric.addEventListener('change', renderTrend);
  grouping.addEventListener('change', () => { periods = journalPeriods(filtered, grouping.value); renderTrend(); });
  for (const input of [comparisonMetric, comparisonAxis]) input.addEventListener('change', renderComparisonChart);
  compareButton.addEventListener('click', showComparison);
  byId('btn-journal-back-to-rides').addEventListener('click', () => compareButton.focus());
  byId('btn-journal-clear').addEventListener('click', () => {
    selectedIds = [];
    hideComparison();
    renderSelection();
    byId('journal-rides-heading').focus();
  });
  byId('btn-journal-reset-filters').addEventListener('click', () => {
    route.value = '';
    range.value = 'all';
    page = 0;
    renderFilters();
    route.focus();
  });
  byId('btn-journal-retry').addEventListener('click', () => refresh());
  byId('btn-journal-choose-route').addEventListener('click', onChooseRoute);
  for (const [id, direction] of [['btn-journal-prev', -1], ['btn-journal-next', 1]]) {
    byId(id).addEventListener('click', () => {
      page += direction;
      renderList();
      if (byId(id).disabled) byId('journal-rides-heading').focus();
    });
  }
  const resize = new ResizeObserver(() => { plotTrend(); plotComparison(); });
  resize.observe(trendChart);
  resize.observe(comparisonChart);
  return { refresh };
}
