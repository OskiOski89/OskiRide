import { RideLogStore } from './rideLogStore.js';

export function trainerConnectionState(state, controller, connecting = false, lost = false) {
  if (state.bleConnected) return { key: 'connected', label: `Trainer connected: ${controller.deviceName || 'Bluetooth device'}` };
  if (connecting || controller.isAutoReconnecting) return { key: 'connecting', label: 'Connecting to trainer' };
  if (lost) return { key: 'lost', label: 'Trainer disconnected' };
  return { key: 'disconnected', label: 'Trainer disconnected' };
}

export class RideDiagnostics {
  constructor(snapshot, store = new RideLogStore()) {
    this.snapshot = snapshot;
    this.store = store;
    this.current = null;
    this.pending = [];
    this.beforeRide = [];
    this.elapsed = 0;
    this.frames = 0;
    this.frameSeconds = 0;
    this.maxFrameMs = 0;
    this.slowFrames = 0;
    this.store.open().catch(() => {});
  }

  event(type, message, data = null, level = 'info') {
    const entry = { at: new Date().toISOString(), type, level, message: String(message).slice(0, 2000), data };
    if (!this.current) {
      this.beforeRide.push(entry);
      if (this.beforeRide.length > 100) this.beforeRide.shift();
      return;
    }
    this.pending.push({ ...entry, rideId: this.current.id, seq: ++this.current.entryCount });
  }

  session(status) {
    if (status === 'ready') { this.finish('interrupted', 'Preparing the next ride'); return; }
    if (status === 'finished') { this.finish('finished', 'Ride ended'); return; }
    if (!['riding', 'paused'].includes(status)) return;
    if (!this.current) {
      const snapshot = this.snapshot();
      this.current = {
        id: crypto.randomUUID(), version: 1, startedAt: new Date().toISOString(), endedAt: null,
        routeName: snapshot.routeName, status, entryCount: 0,
        environment: { userAgent: navigator.userAgent, width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        summary: snapshot,
      };
      const setup = this.beforeRide.splice(0);
      for (const entry of setup) this.pending.push({ ...entry, rideId: this.current.id, seq: ++this.current.entryCount });
      this.event('session', status === 'paused' ? 'Ride restored and paused' : 'Ride started', snapshot);
      this.elapsed = 0;
      this.resetFrames();
    } else if (this.current.status !== status) {
      this.current.status = status;
      this.event('session', status === 'paused' ? 'Ride paused' : 'Ride resumed', this.snapshot());
    } else return;
    this.flush();
  }

  resetFrames() { this.frames = 0; this.frameSeconds = 0; this.maxFrameMs = 0; this.slowFrames = 0; }

  frame(seconds) {
    if (!this.current || !Number.isFinite(seconds) || seconds <= 0) return;
    this.frames++;
    this.frameSeconds += seconds;
    this.maxFrameMs = Math.max(this.maxFrameMs, seconds * 1000);
    if (seconds > .05) this.slowFrames++;
  }

  tick() {
    if (!this.current) return;
    this.elapsed++;
    if (this.elapsed % 5 === 0) {
      const snapshot = this.snapshot();
      this.current.summary = snapshot;
      this.event('sample', 'Diagnostic reading', {
        ...snapshot,
        frames: this.frames,
        measuredFps: this.frameSeconds ? Math.round(this.frames / this.frameSeconds * 10) / 10 : null,
        maxFrameMs: Math.round(this.maxFrameMs * 10) / 10,
        framesOver50ms: this.slowFrames,
      });
      this.resetFrames();
    }
    if (this.elapsed % 10 === 0) this.flush();
  }

  flush() {
    if (!this.current) return this.store.queue;
    this.current.updatedAt = new Date().toISOString();
    this.current.summary = this.snapshot();
    return this.store.write(this.current, this.pending.splice(0));
  }

  finish(status, message) {
    if (!this.current) return;
    this.event('session', message, this.snapshot());
    this.current.status = status;
    this.current.endedAt = new Date().toISOString();
    const result = this.flush();
    this.current = null;
    this.resetFrames();
    return result;
  }
}
