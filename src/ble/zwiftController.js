import {
  BATTERY_LEVEL, BATTERY_SERVICE, ZWIFT_INDICATIONS, ZWIFT_NOTIFICATIONS, ZWIFT_SERVICE, ZWIFT_WRITE,
  decodeZwiftBattery, decodeZwiftButtons, isZwiftActivationNotice, zwiftHandshake, zwiftRequestOptions,
} from './zwiftProtocol.js';

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 32000];
const CLICK_V2_LABELS = { 'click-v2': 'Click V2 · prawa (+)', 'click-v2-left': 'Click V2 · lewa (−)' };
const LEFT_ACTIVATION_MESSAGE = 'Pair the left Click V2 in Zwift to activate its buttons, then return to OskiRide.';

export class ZwiftController {
  constructor({ requestDevice, onStatusChange, onPress, onButtonsChange }) {
    this.requestDevice = requestDevice;
    this.onStatusChange = onStatusChange;
    this.onPress = onPress;
    this.onButtonsChange = onButtonsChange;
    this.links = new Map();
    this.busy = false;
    this.requestVersion = 0;
    this.message = 'Connect a controller directly to OskiRide.';
  }

  publish(message = this.message) {
    this.message = message;
    const devices = Array.from(this.links.values(), ({ device, label, model, phase, battery }) => ({ id: device.id, label, model, phase, battery }));
    this.onStatusChange({ devices, busy: this.busy, message });
  }

  async connectController(model) {
    if (this.busy) return;
    this.busy = true;
    const request = ++this.requestVersion;
    let link;
    this.publish('Searching for a Bluetooth controller…');
    try {
      const device = await this.requestDevice(zwiftRequestOptions(model));
      if (request !== this.requestVersion) return;
      const label = CLICK_V2_LABELS[model] || device.name || 'Zwift controller';
      if (this.links.has(device.id)) {
        this.publish(`Controller ${label} is already listed.`);
        return;
      }
      link = { device, label, model, phase: 'connecting', battery: null, pressed: new Set() };
      link.onDisconnect = () => this.handleDisconnect(link);
      this.links.set(device.id, link);
      device.addEventListener('gattserverdisconnected', link.onDisconnect);
      this.publish(`Connecting to ${label}…`);
      await this.openLink(link);
      if (this.hasLink(link)) {
        this.publish(link.phase === 'activation' ? LEFT_ACTIVATION_MESSAGE : `Connected to ${label}. Try the buttons to check the connection.`);
      }
    } catch (error) {
      if (request !== this.requestVersion) return;
      if (link) {
        this.removeLink(link);
        this.publish(`Connection to ${link.label} failed. Check the model and try again.`);
      } else if (error.name === 'NotSupportedError' || error.name === 'SecurityError') {
        this.publish('Bluetooth is unavailable. Open OskiRide in Chrome, Edge, or the desktop app.');
      } else if (error.name === 'NotFoundError' || error.name === 'AbortError') {
        this.publish('No controller selected. Turn on Bluetooth and press a button to wake the controller.');
      } else {
        this.publish('Bluetooth scan failed. Check that Bluetooth is on.');
      }
    } finally {
      this.busy = false;
      this.publish();
    }
  }

  hasLink(link) {
    return this.links.get(link.device.id) === link;
  }

  async openLink(link) {
    const server = await link.device.gatt.connect();
    const ensureConnected = () => {
      if (this.hasLink(link) && server.connected) return;
      if (!this.links.has(link.device.id) && server.connected) server.disconnect();
      throw new Error('Bluetooth connection ended.');
    };
    ensureConnected();
    const service = await server.getPrimaryService(ZWIFT_SERVICE);
    const control = await service.getCharacteristic(ZWIFT_WRITE);
    const input = await service.getCharacteristic(ZWIFT_NOTIFICATIONS);
    ensureConnected();
    link.input = input;
    link.needsActivation = false;
    link.onInput = event => this.receive(link, event.target.value);
    input.addEventListener('characteristicvaluechanged', link.onInput);
    await input.startNotifications();
    try {
      const indications = await service.getCharacteristic(ZWIFT_INDICATIONS);
      await indications.startNotifications();
      ensureConnected();
      if (link.model === 'click-v2-left') {
        link.indications = indications;
        indications.addEventListener('characteristicvaluechanged', link.onInput);
      }
    } catch (error) {
      if (error.name !== 'NotFoundError' && error.name !== 'NotSupportedError') throw error;
    }
    ensureConnected();
    const handshake = zwiftHandshake(link.model);
    if (control.properties.writeWithoutResponse) await control.writeValueWithoutResponse(handshake);
    else await control.writeValueWithResponse(handshake);
    ensureConnected();
    link.phase = link.needsActivation ? 'activation' : 'connected';
    void this.readBattery(link, server, input);
  }

  async readBattery(link, server, input) {
    try {
      const service = await server.getPrimaryService(BATTERY_SERVICE);
      const characteristic = await service.getCharacteristic(BATTERY_LEVEL);
      const properties = characteristic.properties;
      if (properties?.read !== false) {
        try {
          const battery = await characteristic.readValue();
          if (link.input === input && link.battery === null && battery.byteLength) {
            this.updateBattery(link, battery.getUint8(0));
          }
        } catch {
          // Niektóre manetki udostępniają baterię tylko przez notyfikacje.
        }
      }
      if (link.input !== input || !(properties?.notify || properties?.indicate)) return;
      link.batteryInput = characteristic;
      link.onBattery = event => {
        const value = event.target.value;
        if (link.input === input && value?.byteLength) this.updateBattery(link, value.getUint8(0));
      };
      characteristic.addEventListener('characteristicvaluechanged', link.onBattery);
      await characteristic.startNotifications();
    } catch {
      // Nie każda manetka udostępnia standardową usługę baterii.
    }
  }

  updateBattery(link, percentage) {
    if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100 || link.battery === percentage) return;
    link.battery = percentage;
    this.publish();
  }

  receive(link, frame) {
    if (!this.hasLink(link) || !frame?.byteLength) return;
    if (link.model === 'click-v2-left' && isZwiftActivationNotice(frame)) {
      link.needsActivation = true;
      if (link.phase === 'connected') {
        link.phase = 'activation';
        link.pressed.clear();
        this.publish(LEFT_ACTIVATION_MESSAGE);
      }
      return;
    }
    if (link.phase !== 'connected' && link.phase !== 'activation') return;
    if (frame.getUint8(0) === 0x19) {
      this.updateBattery(link, decodeZwiftBattery(frame));
      return;
    }
    const buttons = decodeZwiftButtons(link.model, frame);
    if (buttons === null) return;
    if (link.phase === 'activation') {
      link.phase = 'connected';
      link.needsActivation = false;
      this.publish(`Buttons ${link.label} are active.`);
    }
    const pressed = buttons.filter(button => !link.pressed.has(button));
    if (!pressed.length && buttons.length === link.pressed.size) return;
    link.pressed = new Set(buttons);
    this.onButtonsChange?.(link.device.id, link.model, buttons, pressed);
    if (pressed.length) this.onPress(link.model, pressed);
  }

  handleDisconnect(link) {
    if (!this.hasLink(link) || (link.phase !== 'connected' && link.phase !== 'activation')) return;
    this.clearInput(link);
    link.phase = 'reconnecting';
    link.battery = null;
    this.retryLink(link, 0);
  }

  retryLink(link, attempt) {
    if (attempt === RECONNECT_DELAYS.length) {
      this.removeLink(link);
      this.publish(`Could not reconnect to ${link.label}. Wake the controller and select “Connect controller.”`);
      return;
    }
    this.publish(`Lost connection to ${link.label}. Reconnecting.`);
    link.retry = setTimeout(async () => {
      try {
        await this.openLink(link);
        if (this.hasLink(link)) {
          this.publish(link.phase === 'activation' ? LEFT_ACTIVATION_MESSAGE : `Reconnected to ${link.label}.`);
        }
      } catch {
        if (!this.hasLink(link)) return;
        this.clearInput(link);
        link.device.gatt.disconnect();
        this.retryLink(link, attempt + 1);
      }
    }, RECONNECT_DELAYS[attempt]);
  }

  clearInput(link) {
    link.input?.removeEventListener('characteristicvaluechanged', link.onInput);
    link.indications?.removeEventListener('characteristicvaluechanged', link.onInput);
    link.batteryInput?.removeEventListener('characteristicvaluechanged', link.onBattery);
    link.input = null;
    link.indications = null;
    link.batteryInput = null;
    link.pressed.clear();
  }

  removeLink(link) {
    this.links.delete(link.device.id);
    clearTimeout(link.retry);
    this.clearInput(link);
    link.device.removeEventListener('gattserverdisconnected', link.onDisconnect);
    link.device.gatt?.disconnect();
  }

  disconnectAll() {
    this.requestVersion++;
    for (const link of this.links.values()) this.removeLink(link);
    this.publish('Bluetooth controllers disconnected.');
  }
}
