const statuses = { riding: 'W trakcie', paused: 'Pause', finished: 'Finished', interrupted: 'Interrupted' };
const types = { session: 'Session', connection: 'Connection', device: 'Device', sample: 'Reading', change: 'Change', error: 'Error', warning: 'Note', visibility: 'Window' };
const date = value => new Date(value).toLocaleString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
};

export function mountRideLogsView(diagnostics) {
  const store = diagnostics.store;
  const list = document.getElementById('ride-log-list');
  const detail = document.getElementById('ride-log-detail');
  const status = document.getElementById('ride-log-status');
  let selectedId = null, selectedRide = null, rides = [], listLimit = 24, entryLimit = 200, revision = 0;
  const exportButton = document.getElementById('btn-log-export');
  const statusLabel = ride => ['riding', 'paused'].includes(ride.status) && ride.id !== diagnostics.current?.id
    ? 'Open session' : statuses[ride.status] || 'Open session';

  function storageStatus() {
    status.textContent = store.error
      ? 'Could not save or read logs. Download new entries before closing OskiRide. ' + store.error
      : 'Logs are saved on this device every 10 seconds and when the ride status changes.';
    status.classList.toggle('log-storage-error', Boolean(store.error));
  }

  function renderList() {
    list.replaceChildren();
    for (const ride of rides.slice(0, listLimit)) {
      const button = node('button', null, 'ride-log-choice');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(ride.id === selectedId));
      button.append(node('strong', ride.routeName), node('span', date(ride.startedAt)), node('small', statusLabel(ride)));
      button.addEventListener('click', () => { entryLimit = 200; select(ride.id); });
      list.append(button);
    }
    if (rides.length > listLimit) {
      const more = node('button', 'Show more rides', 'btn btn-secondary');
      more.type = 'button';
      more.addEventListener('click', () => { listLimit += 24; renderList(); });
      list.append(more);
    }
  }

  function renderDetail(ride) {
    detail.replaceChildren();
    exportButton.disabled = !ride;
    selectedRide = ride;
    if (!ride) {
      detail.append(node('h3', 'Each ride has its own log'), node('p', 'Start a ride to log connections, mode changes, errors, and performance.'));
      return;
    }
    detail.append(node('h3', ride.routeName), node('p', `${date(ride.startedAt)} · ${statusLabel(ride)} · ${ride.entries.length} entries`, 'ride-log-meta'));
    const stats = node('dl', null, 'ride-log-facts');
    const snapshot = ride.summary || {};
    for (const [label, value] of [
      ['Ride time', `${Math.floor((snapshot.elapsedSeconds || 0) / 60)} min ${Math.floor((snapshot.elapsedSeconds || 0) % 60)} s`],
      ['Pozycja na trasie', `${((snapshot.distanceM || 0) / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })} km`],
      ['Trainer', snapshot.trainerName || 'Disconnected'],
      ['Graphics quality', { eco: 'Low', medium: 'Standard', ultra: 'High' }[snapshot.quality] || '—'],
    ]) {
      const item = node('div'); item.append(node('dt', label), node('dd', value)); stats.append(item);
    }
    detail.append(stats);
    if (ride.entries.length > entryLimit) {
      const more = node('button', 'Load earlier entries', 'btn btn-secondary');
      more.type = 'button';
      more.addEventListener('click', () => { entryLimit += 200; renderDetail(ride); });
      detail.append(more);
    }
    const table = node('table', null, 'ride-log-table');
    table.setAttribute('aria-label', 'Diagnostic entries for the selected ride');
    const head = node('thead'), labels = node('tr');
    for (const label of ['Time', 'Type', 'Event']) { const th = node('th', label); th.scope = 'col'; labels.append(th); }
    head.append(labels); table.append(head);
    const body = node('tbody');
    for (const entry of ride.entries.slice(-entryLimit)) {
      const row = node('tr'); row.dataset.level = entry.level;
      row.append(node('td', new Date(entry.at).toLocaleTimeString('en-US')), node('td', types[entry.type] || entry.type));
      const message = node('td');
      if (entry.data) {
        const details = node('details');
        details.append(node('summary', entry.message), node('pre', JSON.stringify(entry.data, null, 2)));
        message.append(details);
      } else message.textContent = entry.message;
      row.append(message); body.append(row);
    }
    table.append(body); const scroll = node('div', null, 'ride-log-table-scroll'); scroll.append(table); detail.append(scroll);
  }

  async function select(id) {
    const request = ++revision;
    selectedId = id;
    exportButton.disabled = true;
    renderList();
    const ride = id ? await store.get(id) : null;
    if (request !== revision) return;
    renderDetail(ride); storageStatus();
  }

  async function refresh() {
    status.textContent = 'Loading logs…';
    await diagnostics.flush();
    rides = await store.list();
    document.getElementById('ride-log-count').textContent = `Saved rides: ${rides.length}`;
    await select(rides.some(ride => ride.id === selectedId) ? selectedId : rides[0]?.id || null);
  }

  document.getElementById('btn-log-refresh').addEventListener('click', refresh);
  exportButton.addEventListener('click', async () => {
    if (!selectedRide) return;
    await diagnostics.flush();
    const ride = await store.get(selectedRide.id);
    if (!ride) return;
    const blob = new Blob([JSON.stringify(ride, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = node('a');
    link.href = url; link.download = `OskiRide-logs-${ride.startedAt.replaceAll(/[:.]/g, '-')}-${ride.id.slice(0, 8)}.json`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return { refresh };
}
