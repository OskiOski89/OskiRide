const PROFILE_NAMES = {
  'click-v2-left': 'Left Click V2',
  'click-v2': 'Right Click V2',
  'click-v1': 'Zwift Click V1',
};
const DIRECTIONS = { up: '↑', down: '↓', left: '←', right: '→' };
const FLASH_MS = 650;

function createDiagram(profile, buttons) {
  const diagram = document.createElement('div');
  diagram.className = 'shifter-test-device';
  diagram.dataset.profile = profile;

  const heading = document.createElement('h4');
  heading.textContent = PROFILE_NAMES[profile];

  const connection = document.createElement('p');
  connection.className = 'shifter-test-connection';

  const controller = document.createElement('div');
  controller.className = 'shifter-test-controller';
  const keys = new Map(buttons.map(([id, label]) => {
    const badge = document.createElement('kbd');
    badge.className = 'shifter-key shifter-test-key';
    badge.dataset.shifterButton = id;
    badge.style.gridArea = id;
    badge.textContent = DIRECTIONS[id] ?? label;
    badge.title = label;
    controller.append(badge);
    return [id, { badge, label }];
  }));
  diagram.append(heading, connection, controller);
  return { diagram, connection, keys };
}

export function mountShifterButtonTest({ profiles, connectionLabels, getActionLabel }) {
  const panel = document.getElementById('shifter-test-panel');
  const container = document.getElementById('shifter-test-diagrams');
  const result = document.getElementById('shifter-test-status');
  const diagrams = new Map(Object.keys(PROFILE_NAMES).map(profile => {
    const view = createDiagram(profile, profiles[profile]);
    container.append(view.diagram);
    return [profile, view];
  }));
  const inputs = new Map();
  let connectedIds = new Set();
  let lastDeviceId = null;
  let presses = 0;

  function highlight(profile) {
    const active = new Set();
    for (const input of inputs.values()) {
      if (input.profile !== profile) continue;
      for (const button of input.held) active.add(button);
      for (const button of input.recent) active.add(button);
    }
    for (const [id, { badge }] of diagrams.get(profile).keys) {
      badge.toggleAttribute('data-active', active.has(id));
    }
  }

  function syncDevices(devices, selectedProfile) {
    connectedIds = new Set(devices.filter(device => device.phase === 'connected').map(device => device.id));
    for (const [id, input] of inputs) {
      if (connectedIds.has(id)) continue;
      clearTimeout(input.timer);
      inputs.delete(id);
    }
    if (!connectedIds.has(lastDeviceId)) {
      lastDeviceId = null;
      const message = connectedIds.size ? 'Press a controller button.' : 'Waiting for a controller connection.';
      if (result.textContent !== message) result.textContent = message;
    }

    const visible = new Set([selectedProfile, ...devices.map(device => device.model)]);
    if (visible.has('click-v2-left') || visible.has('click-v2')) {
      visible.add('click-v2-left');
      visible.add('click-v2');
    }
    for (const [profile, { diagram, connection }] of diagrams) {
      const matching = devices.filter(device => device.model === profile);
      const current = matching.find(device => device.phase === 'connected') ?? matching[0];
      const phase = current?.phase ?? 'disconnected';
      diagram.hidden = !visible.has(profile);
      if (diagram.dataset.phase !== phase) {
        diagram.dataset.phase = phase;
        connection.textContent = connectionLabels[phase];
      }
      highlight(profile);
    }
  }

  return {
    syncDevices,
    setActive(enabled, devices, selectedProfile) {
      panel.hidden = !enabled;
      if (enabled) {
        syncDevices(devices, selectedProfile);
        panel.scrollIntoView({ block: 'nearest' });
        return;
      }
      for (const input of inputs.values()) clearTimeout(input.timer);
      inputs.clear();
      for (const profile of diagrams.keys()) highlight(profile);
      lastDeviceId = null;
      presses = 0;
      result.textContent = '';
    },
    showButtons(id, profile, held, pressed) {
      if (!connectedIds.has(id)) return;
      const input = inputs.get(id) ?? { profile, recent: [] };
      input.held = held;
      inputs.set(id, input);
      if (pressed.length) {
        clearTimeout(input.timer);
        input.recent = pressed;
        input.timer = setTimeout(() => {
          input.recent = [];
          highlight(profile);
        }, FLASH_MS);
        const { keys } = diagrams.get(profile);
        const actions = pressed.map(button => `${keys.get(button).label} → ${getActionLabel(profile, button)}`);
        result.textContent = `${++presses}. ${actions.join(' / ')}`;
        lastDeviceId = id;
      }
      highlight(profile);
    },
  };
}
