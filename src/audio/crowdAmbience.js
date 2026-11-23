const SETTINGS_KEY = 'oskiride_audio_settings_v1';
const clamp = value => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));

export function crowdProximity(distanceM, centerM) {
  if (!Number.isFinite(distanceM) || !Number.isFinite(centerM)) return 0;
  const d = Math.abs(distanceM - centerM);
  if (d >= 190) return 0;
  const t = clamp((190 - d) / 145);
  return t * t * (3 - 2 * t);
}

// Only local crowd ambience. Bicycle/trainer synthesis remains disabled.
// Context creation/resumption is restricted to unlock(), called by a user action.
export class CrowdAmbience {
  constructor({ storage, createContext, random = Math.random } = {}) {
    if (storage === undefined) { try { storage = globalThis.localStorage; } catch {} }
    this.storage = storage; this.random = random;
    this.createContext = createContext || (() => {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      return Context ? new Context() : null;
    });
    let saved = {};
    try { saved = JSON.parse(storage?.getItem(SETTINGS_KEY) || '{}') || {}; } catch {}
    this.settings = { ...saved, masterVolume: saved.masterVolume == null ? 0.7 : clamp(saved.masterVolume),
      sfxVolume: saved.sfxVolume == null ? 0.45 : clamp(saved.sfxVolume),
      uiVolume: saved.uiVolume == null ? 1 : clamp(saved.uiVolume), crowdEnabled: saved.crowdEnabled !== false };
    this.nodes = new Set(); this.nextCheerAt = 0; this.lastTarget = -1; this.disposed = false;
  }
  save() { try { this.storage?.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch {} }
  setEnabled(enabled) { this.settings.crowdEnabled = Boolean(enabled); this.save(); if (!enabled) this.stop(); }
  setVolume(volume) { this.settings.sfxVolume = clamp(volume); this.save(); if (!volume) this.stop(); }
  async unlock() {
    if (this.disposed || !this.settings.crowdEnabled) return false;
    try {
      if (!this.context) {
        this.context = this.createContext();
        if (!this.context) { this.unavailable = true; return false; }
        const ctx = this.context;
        this.master = ctx.createGain(); this.master.gain.value = this.settings.masterVolume;
        this.bus = ctx.createGain(); this.bus.gain.value = 0; this.bus.connect(this.master); this.master.connect(ctx.destination);
        this.noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 2), ctx.sampleRate);
        const data = this.noise.getChannelData(0); let previous = 0;
        for (let i = 0; i < data.length; i++) { previous = previous * 0.76 + (this.random() * 2 - 1) * 0.24; data[i] = previous; }
        this.murmur = ctx.createBufferSource(); this.murmur.buffer = this.noise; this.murmur.loop = true;
        this.filter = ctx.createBiquadFilter(); this.filter.type = 'bandpass'; this.filter.frequency.value = 650; this.filter.Q.value = 0.6;
        this.murmurGain = ctx.createGain(); this.murmurGain.gain.value = 0.14;
        this.murmur.connect(this.filter); this.filter.connect(this.murmurGain); this.murmurGain.connect(this.bus); this.murmur.start();
      }
      if (this.context.state === 'suspended') await this.context.resume();
      return !this.disposed && this.context.state === 'running';
    } catch { this.unavailable = true; this.stop(); return false; }
  }
  target(value) {
    if (!this.bus || Math.abs(this.lastTarget - value) < 0.002) return;
    this.bus.gain.setTargetAtTime(value, this.context.currentTime, 0.07); this.lastTarget = value;
  }
  stop() { this.target(0); this.nextCheerAt = 0; }
  update({ distanceM, centerM, active, visible = true }) {
    const proximity = active && visible && this.settings.crowdEnabled ? crowdProximity(distanceM, centerM) : 0;
    const volume = proximity * this.settings.sfxVolume;
    this.target(volume);
    if (!volume || this.disposed || this.context?.state !== 'running') return;
    const now = this.context.currentTime;
    if (now >= this.nextCheerAt) {
      this.cheer(now + 0.02);
      this.nextCheerAt = now + 1.3 + this.random() * 0.9;
    }
  }
  transient(source, filter, gain, time, duration, level) {
    const ctx = this.context;
    source.connect(filter); filter.connect(gain); gain.connect(this.bus);
    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(level, time + Math.min(0.04, duration / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    const entry = { source, filter, gain }; this.nodes.add(entry);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); this.nodes.delete(entry); };
    source.start(time); source.stop(time + duration + 0.02);
    return ctx;
  }
  cheer(time) {
    const ctx = this.context;
    // A short group vowel, two claps and an occasional cowbell, no speech API
    // or downloaded recordings. Slightly different pitches avoid a single tone.
    for (let i = 0; i < 3; i++) {
      const voice = ctx.createOscillator(); voice.type = 'sawtooth';
      voice.frequency.setValueAtTime(115 + i * 27 + this.random() * 12, time);
      voice.frequency.linearRampToValueAtTime(140 + i * 23, time + 0.35);
      const formant = ctx.createBiquadFilter(); formant.type = 'bandpass'; formant.frequency.value = 650 + i * 320; formant.Q.value = 3;
      this.transient(voice, formant, ctx.createGain(), time + i * 0.035, 0.75, 0.09);
    }
    for (let i = 0; i < 2; i++) {
      const clap = ctx.createBufferSource(); clap.buffer = this.noise;
      const filter = ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 1000;
      this.transient(clap, filter, ctx.createGain(), time + 0.25 + i * 0.23, 0.09, 0.5);
    }
    if (this.random() < 0.45) {
      const bell = ctx.createOscillator(); bell.type = 'sine'; bell.frequency.value = 1320;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 2200;
      this.transient(bell, filter, ctx.createGain(), time + 0.12, 0.45, 0.09);
    }
  }
  dispose() {
    this.stop(); this.disposed = true;
    for (const { source, filter, gain } of this.nodes) {
      try { source.stop(); } catch {}
      source.disconnect(); filter.disconnect(); gain.disconnect();
    }
    this.nodes.clear();
    try { this.murmur?.stop(); } catch {}
    this.murmur?.disconnect(); this.filter?.disconnect(); this.murmurGain?.disconnect(); this.bus?.disconnect(); this.master?.disconnect();
    this.context?.close().catch(() => {});
  }
}
