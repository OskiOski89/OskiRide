const LOW_BATTERY_PCT = 20;
const DISPLAY_MS = 8000;
const CONNECTION_TEXT = {
  reconnecting: 'Connection lost',
  activation: 'Wymaga aktywacji w Zwift',
};

export function mountShifterRideAlerts(list) {
  const notices = new Map();
  const warnedBattery = new Set();
  let devices = new Map();
  let rideId = null;
  let riding = false;

  function dismiss(id) {
    const notice = notices.get(id);
    if (!notice) return;
    clearTimeout(notice.timer);
    notice.element.remove();
    notices.delete(id);
    list.hidden = !notices.size;
  }

  function show(device, kind, text) {
    dismiss(device.id);
    const element = document.createElement('li');
    element.className = 'shifter-ride-alert';
    element.dataset.kind = kind;
    element.textContent = `${device.label} — ${text}`;
    notices.set(device.id, { element, kind, timer: setTimeout(() => dismiss(device.id), DISPLAY_MS) });
    list.append(element);
    list.hidden = false;
  }

  function check(device, previous) {
    const issue = CONNECTION_TEXT[device.phase];
    if (issue && device.phase !== previous?.phase) {
      show(device, 'connection', issue);
    } else if (device.phase === 'connected') {
      if (notices.get(device.id)?.kind === 'connection') dismiss(device.id);
      if (Number.isInteger(device.battery) && device.battery <= LOW_BATTERY_PCT && !warnedBattery.has(device.id)) {
        warnedBattery.add(device.id);
        show(device, 'battery', `Low battery ${device.battery}%`);
      }
    }
  }

  return {
    updateDevices(snapshot) {
      const previous = devices;
      devices = new Map(snapshot.map(device => [device.id, device]));
      for (const id of notices.keys()) if (!devices.has(id)) dismiss(id);
      if (riding) for (const device of devices.values()) check(device, previous.get(device.id));
    },
    setSession(id, running) {
      if (id === rideId && running === riding) return;
      if (id !== rideId) warnedBattery.clear();
      rideId = id;
      riding = running;
      for (const deviceId of notices.keys()) dismiss(deviceId);
      if (riding) for (const device of devices.values()) check(device);
    },
  };
}
