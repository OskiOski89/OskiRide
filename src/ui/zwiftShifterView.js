import { mountShifterButtonTest } from './shifterButtonTest.js';
import { shifterMenuActionLabel } from './shifterMenuNavigation.js';

const SETTINGS_KEY = 'oskiride_shifter_bindings_v1';
const SETTINGS_VERSION = 2;
const FIXED_GEARS = { plus: 'gear-up', minus: 'gear-down' };
const ACTIONS = {
  'gear-up': 'Shift up',
  'gear-down': 'Shift down',
  camera: 'Change camera',
  pause: 'Pause / resume',
  menu: 'Ride menu',
  none: 'No action',
};
const PROFILES = {
  'click-v2': [
    ['plus', '+', FIXED_GEARS.plus], ['b', 'B', 'none'], ['a', 'A', 'camera'],
    ['y', 'Y', 'pause'], ['z', 'Z', 'menu'],
  ],
  'click-v2-left': [
    ['minus', '−', FIXED_GEARS.minus],
    ['up', 'Up arrow', 'none'], ['down', 'Down arrow', 'none'],
    ['left', 'Left arrow', 'none'], ['right', 'Right arrow', 'none'],
  ],
  'click-v1': [['plus', '+', FIXED_GEARS.plus], ['minus', '−', FIXED_GEARS.minus]],
};
const MODEL_HELP = {
  'click-v2': 'Press + to wake the right controller and connect it. To use −, select and connect the left controller as well.',
  'click-v2-left': 'Press − to wake the left controller and connect it. If the buttons stop responding, activate it in Zwift.',
};
const CONNECTION_LABELS = {
  connecting: 'connecting',
  reconnecting: 'reconnecting',
  connected: 'connected',
  activation: 'wymaga aktywacji w Zwift',
  disconnected: 'disconnected',
};

function readSettings() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch { /* Użyj ustawień domyślnych. */ }
  const model = Object.hasOwn(PROFILES, saved?.model) ? saved.model : 'click-v2';
  const bindings = {};
  for (const [profile, buttons] of Object.entries(PROFILES)) {
    bindings[profile] = Object.fromEntries(buttons.map(([id, , initial]) => {
      const action = saved?.bindings?.[profile]?.[id];
      const legacyDownshift = saved?.version !== SETTINGS_VERSION && profile === 'click-v2' && id === 'b' && action === 'gear-down';
      if (Object.hasOwn(FIXED_GEARS, id) || legacyDownshift) return [id, initial];
      return [id, Object.hasOwn(ACTIONS, action) ? action : initial];
    }));
  }
  return { version: SETTINGS_VERSION, model, bindings };
}

function mountDevicePicker() {
  const desktop = window.oskiControllerPicker;
  const dialog = document.getElementById('shifter-picker');
  const list = document.getElementById('shifter-picker-device');
  const status = document.getElementById('shifter-picker-status');
  const connect = document.getElementById('btn-shifter-picker-connect');
  if (desktop) {
    const pick = id => void desktop.pick(id).catch(() => {});
    document.getElementById('btn-shifter-picker-cancel').addEventListener('click', () => pick(''));
    connect.addEventListener('click', () => pick(list.value));
    list.addEventListener('change', () => { connect.disabled = !list.value; });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      pick('');
    });
  }

  function showDevices(devices) {
    const selected = list.value;
    list.replaceChildren(new Option('Select a controller', ''), ...devices.map(({ name, id }) => new Option(name || 'Zwift controller', id)));
    list.value = devices.some(device => device.id === selected) ? selected : '';
    list.disabled = devices.length === 0;
    connect.disabled = !list.value;
    status.textContent = devices.length ? 'Select a controller from the list.' : 'Searching for controllers. Press a button to wake yours.';
  }

  return async options => {
    if (!navigator.bluetooth?.requestDevice) throw new DOMException('Web Bluetooth is unavailable.', 'NotSupportedError');
    if (!desktop) return navigator.bluetooth.requestDevice(options);
    await desktop.start();
    const unsubscribe = desktop.subscribe(showDevices);
    try {
      showDevices([]);
      dialog.showModal();
      return await navigator.bluetooth.requestDevice(options);
    } finally {
      unsubscribe();
      dialog.close();
      await desktop.stop().catch(() => {});
    }
  };
}

export function mountZwiftShifterView({ onConnect, onDisconnect, onInput, onMenuPress, onMenuShortcuts, onAction }) {
  const panel = document.getElementById('shifter-panel');
  const model = document.getElementById('shifter-model');
  const help = document.getElementById('shifter-model-help');
  const status = document.getElementById('shifter-status');
  const connect = document.getElementById('btn-shifter-connect');
  const disconnect = document.getElementById('btn-shifter-disconnect');
  const gear = document.getElementById('shifter-gear');
  const list = document.getElementById('shifter-devices');
  const details = document.getElementById('shifter-settings');
  const mapping = document.getElementById('shifter-map');
  const menuNote = document.getElementById('shifter-menu-note');
  const test = document.getElementById('btn-shifter-test');
  const storageStatus = document.getElementById('shifter-storage-status');
  const settings = readSettings();
  const buttonTest = mountShifterButtonTest({
    profiles: PROFILES,
    connectionLabels: CONNECTION_LABELS,
    getActionLabel(profile, button) {
      const action = settings.bindings[profile][button];
      const menuAction = shifterMenuActionLabel(profile, button);
      if (!menuAction) return ACTIONS[action];
      return action === 'none' ? menuAction : `${ACTIONS[action]} · ${menuAction}`;
    },
  });
  let devices = [];
  let testing = false;

  function save() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      storageStatus.hidden = true;
    } catch {
      storageStatus.hidden = false;
      storageStatus.textContent = 'These settings apply until OskiRide closes.';
    }
  }

  function syncTestButton() {
    test.disabled = !testing && !devices.some(device => device.phase === 'connected');
    test.textContent = testing ? 'End test' : 'Test buttons';
    test.setAttribute('aria-pressed', String(testing));
  }

  function setTesting(enabled) {
    testing = enabled;
    buttonTest.setActive(enabled, devices, model.value);
    syncTestButton();
  }

  function updateMenuShortcuts(connected = devices.filter(device => device.phase === 'connected'), connectedManually = false) {
    const profiles = new Set(connected.map(device => device.model));
    const keys = [];
    for (const profile of profiles) {
      for (const [button, label] of PROFILES[profile]) {
        if (settings.bindings[profile][button] === 'menu') keys.push({ profile, button, label });
      }
    }
    onMenuShortcuts({ profiles, keys, connectedManually });
  }

  function renderBindings() {
    const profile = model.value;
    help.textContent = MODEL_HELP[profile] ?? 'Press a button to wake the controller, then start scanning.';
    menuNote.hidden = profile !== 'click-v2' && profile !== 'click-v2-left';
    const controls = PROFILES[profile].map(([id, name]) => {
      const label = document.createElement('label');
      const select = document.createElement('select');
      select.id = `shifter-binding-${id}`;
      select.className = 'select-input';
      label.htmlFor = select.id;
      label.append(name, select);
      if (Object.hasOwn(FIXED_GEARS, id)) {
        const action = FIXED_GEARS[id];
        select.disabled = true;
        select.dataset.fixed = 'true';
        select.add(new Option(ACTIONS[action], action));
        return label;
      }
      select.replaceChildren(...Object.entries(ACTIONS).map(([action, text]) => new Option(text, action)));
      select.value = settings.bindings[profile][id];
      select.addEventListener('change', () => {
        if (!Object.hasOwn(ACTIONS, select.value)) return;
        settings.bindings[profile][id] = select.value;
        save();
        updateMenuShortcuts();
      });
      return label;
    });
    mapping.replaceChildren(...controls);
  }

  model.value = settings.model;
  renderBindings();
  syncTestButton();
  model.addEventListener('change', () => {
    settings.model = model.value;
    save();
    setTesting(false);
    renderBindings();
  });
  connect.addEventListener('click', async () => {
    await onConnect(model.value);
    if (document.activeElement === document.body && panel.getClientRects().length) connect.focus({ preventScroll: true });
  });
  disconnect.addEventListener('click', () => {
    setTesting(false);
    onDisconnect();
    if (!connect.disabled) connect.focus();
  });
  document.getElementById('btn-shifter-reset').addEventListener('click', () => {
    settings.bindings[model.value] = Object.fromEntries(PROFILES[model.value].map(([id, , action]) => [id, action]));
    save();
    renderBindings();
    updateMenuShortcuts();
  });
  test.addEventListener('click', () => setTesting(!testing));
  details.addEventListener('toggle', () => { if (!details.open && testing) setTesting(false); });

  return {
    requestDevice: mountDevicePicker(),
    renderConnection(snapshot) {
      const connected = snapshot.devices.filter(device => device.phase === 'connected');
      const connectedManually = connected.some(device =>
        devices.some(previous => previous.id === device.id && previous.phase === 'connecting'));
      devices = snapshot.devices;
      updateMenuShortcuts(connected, connectedManually);
      panel.dataset.active = String(connected.length > 0);
      if (status.textContent !== snapshot.message) status.textContent = snapshot.message;
      connect.disabled = model.disabled = snapshot.busy;
      disconnect.hidden = devices.length === 0;
      disconnect.disabled = snapshot.busy;
      list.hidden = devices.length === 0;
      list.replaceChildren(...devices.map(({ label, phase, battery }) => {
        const row = document.createElement('li');
        row.textContent = `${label} · ${CONNECTION_LABELS[phase]}${battery === null ? '' : ` · battery ${battery}%`}`;
        return row;
      }));
      if (testing) buttonTest.syncDevices(devices, model.value);
      syncTestButton();
    },
    handleButtonsChange(id, profile, held, pressed) {
      if (testing) buttonTest.showButtons(id, profile, held, pressed);
    },
    handlePress(profile, buttons) {
      if (testing) return;
      const bindings = settings.bindings[profile];
      const mapped = buttons.map(id => [id, bindings[id]]).filter(([, action]) => action);
      if (!mapped.length) return;
      onInput();
      const actions = new Set(mapped.filter(([id]) => !onMenuPress(profile, id)).map(([, action]) => action));
      if (actions.has('gear-up') && actions.has('gear-down')) {
        actions.delete('gear-up');
        actions.delete('gear-down');
      }
      actions.delete('none');
      for (const action of actions) onAction(action);
    },
    updateGear(value) {
      const label = `${value} / 24`;
      if (gear.textContent !== label) gear.textContent = label;
    },
    stopTest() { if (testing) setTesting(false); },
  };
}

