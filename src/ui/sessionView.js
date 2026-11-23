import { SESSION_LABELS, isRideRunning } from '../session/rideSession.js';
import { formatNumber } from './formatters.js';

function put(id, text) {
  const node=document.getElementById(id);
  if(node && node.textContent!==text) node.textContent=text;
}

export function describeSources(state, mode, now = performance.now(), hasControl = true) {
  const freshness = (at,label) => at == null ? `Waiting for readings · ${label}` : now-at>5000 ? `No signal · ${label}` : label;
  const powerLabels={'trainer':'Trainer','power-meter':'Power meter','virtual-power':'Estimated zPower'};
  const externalPower=state.bleConnected||state.powerMeterConnected||state.cadenceSensorConnected&&state.lastPowerSource==='virtual-power';
  const externalCadence=state.bleConnected||state.cadenceSensorConnected||state.powerMeterConnected;
  return {
    power: externalPower ? freshness(state.lastPowerAtMs,powerLabels[state.lastPowerSource] || (state.powerMeterConnected?'Power meter':'Bluetooth device')) : state.requiresTrainerReconnect ? 'Waiting for trainer' : 'Keyboard simulation',
    cadence: externalCadence ? freshness(state.lastCadenceAtMs,state.lastCadenceSource==='cadence-sensor'?'Cadence sensor':state.lastCadenceSource==='power-meter'?'Crank power meter':'Bluetooth device') : state.requiresTrainerReconnect ? 'Waiting for trainer' : 'Estimated in simulation',
    heart: state.heartRateConnected ? freshness(state.lastHeartRateAtMs,'Bluetooth heart rate monitor') : 'No heart rate monitor',
    control: !state.bleConnected || !hasControl ? 'No Bluetooth control' : state.isRidePaused || state.isRideFinished ? 'Resistance paused · neutral SIM' : !state.hasRideStarted ? 'Waiting to start' : mode.toUpperCase(),
  };
}

export function renderSessionView(state, controller, selectedWorkout) {
  const active=state.hasRideStarted&&!state.isRideFinished;
  const workoutView=document.querySelector('.main-menu-shell')?.dataset.menuView==='workouts';
  const startWorkout=workoutView&&!state.hasRideStarted;
  const mainLabel=state.isRidePaused?'Resume ride':state.isRideFinished?'New ride':isRideRunning(state)?'Back to ride':startWorkout?'Start workout':'Start ride';
  const mainButton=document.querySelector('#btn-settings-close .button-label');
  if(mainButton && mainButton.textContent!==mainLabel)mainButton.textContent=mainLabel;
  const toggle=document.querySelector('#btn-session-toggle .button-label');
  const toggleLabel=isRideRunning(state)?'Pause':state.isRidePaused?'Resume ride':state.isRideFinished?'New ride':'Start ride';
  if(toggle && toggle.textContent!==toggleLabel)toggle.textContent=toggleLabel;
  const blocked=state.requiresTrainerReconnect&&!state.bleConnected;
  for(const id of ['btn-settings-close','btn-session-toggle','btn-trainer-resume'])document.getElementById(id)?.toggleAttribute('disabled',blocked||Boolean(state.isDeviceTestActive)||Boolean(state.deviceTestNeedsNeutral));
  const banner=document.getElementById('trainer-pause-banner');
  if(banner)banner.hidden=!state.requiresTrainerReconnect&&!state.deviceTestNeedsNeutral;
  document.getElementById('btn-trainer-resume')?.toggleAttribute('hidden',!state.requiresTrainerReconnect);
  put('trainer-pause-title',state.bleConnected?'Trainer connected. Ride paused.':'Paused — trainer disconnected');
  put('trainer-pause-description',state.bleConnected?'Ride and interval timers are paused. Resume when ready.':'Reconnect your trainer. Ride and interval timers are paused.');
  if(state.deviceTestNeedsNeutral){put('trainer-pause-title','Waiting for neutral resistance');put('trainer-pause-description','Connect the trainer and reset resistance in Device check before starting the ride.');}
  put('hud-session-status',SESSION_LABELS[state.sessionStatus]||'Ride setup');
  put('session-ready-status',state.isRidePaused?'Paused · ride and interval timers stopped.':state.isRideFinished?'Ride finished. You can start a new session.':isRideRunning(state)?'Ride in progress.':'Choose a route, profile, and devices before starting.');
  if(state.deviceTestNeedsNeutral)put('session-ready-status','Reset resistance in Device check before starting the ride.');
  put('ready-route',state.routeName);
  put('ready-profile',`${state.riderName} · FTP ${state.ftpWatts} W · ${formatNumber(state.weightKg)} kg`);
  put('ready-workout',state.activeWorkout?.name || (startWorkout?selectedWorkout?.name:'Free ride') || 'Free ride');
  const end=document.getElementById('btn-end-ride');if(end)end.disabled=!state.hasRideStarted||state.isRideFinished;
  const keyboardPower=!state.requiresTrainerReconnect&&!state.bleConnected&&!state.powerMeterConnected&&!(state.cadenceSensorConnected&&state.lastPowerSource==='virtual-power');
  const powerSlider=document.getElementById('sim-watts');if(powerSlider){powerSlider.disabled=!keyboardPower;if(keyboardPower)powerSlider.value=state.watts;}
  put('sim-watts-label',`${Math.round(state.watts)} W`);
  for(const id of ['rider-name','rider-ftp','rider-weight','bike-type-select','gpx-input','start-km-slider']){
    const e=document.getElementById(id);if(e)e.disabled=active;
  }
  document.querySelectorAll('.route-card[data-preset]').forEach(e=>e.disabled=active);
  document.querySelectorAll('label[for="gpx-input"]').forEach(e=>{e.setAttribute('aria-disabled',String(active));e.tabIndex=active?-1:0;});
  put('profile-save-status',active?'You can edit the rider profile when this session ends.':state.profileStorageMessage||'Profile changes are saved automatically.');
  const sources=describeSources(state,controller.trainerMode,performance.now(),Boolean(controller.ftmsControlPointChar||controller.tacxTxChar||controller.wahooControlChar));
  document.querySelectorAll('[data-source-key]').forEach(e=>{const text=sources[e.dataset.sourceKey];if(e.textContent!==text)e.textContent=text;});
}
