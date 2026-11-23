export const RIDE_RECOVERY_KEY = 'oskiride_ride_recovery_v1';
const PRESETS = ['mountain','alpedhuez','switchbacks','rolling','flat'];
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function validateRecovery(value) {
  if (!value || value.version !== 1 || !value.route || !value.ride || !value.profile) throw new Error('Invalid saved session.');
  if(typeof value.routeName!=='string'||!value.routeName.trim()||typeof value.savedAt!=='string'||!Number.isFinite(Date.parse(value.savedAt)))throw new Error('Invalid session metadata.');
  if(!finite(value.profile.ftpWatts)||value.profile.ftpWatts<80||value.profile.ftpWatts>550||!finite(value.profile.weightKg)||value.profile.weightKg<35||value.profile.weightKg>180||!['aero','tt','mtb'].includes(value.profile.bikeType))throw new Error('Invalid session profile.');
  if (value.route.type === 'preset') {
    if (!PRESETS.includes(value.route.key)) throw new Error('Unknown route.');
  } else if (value.route.type === 'gpx') {
    if (typeof value.route.text !== 'string' || !value.route.text.includes('<gpx')) throw new Error('Missing GPX data.');
  } else throw new Error('Missing route source.');
  for (const key of ['distanceM','elapsedSeconds','energyJoules','elevationGainM','speedMps','workoutElapsedSec']) {
    if (!finite(value.ride[key]) || value.ride[key] < 0) throw new Error('Invalid session counters.');
  }
  for (const key of ['rideStartDistanceM', 'rideDistanceM']) {
    const count = value.ride[key];
    if (count != null && (!finite(count) || count < 0)) throw new Error('Invalid ride distance.');
  }
  if(value.ride.requiresTrainerReconnect!==undefined&&typeof value.ride.requiresTrainerReconnect!=='boolean')throw new Error('Invalid session connection status.');
  if (!Array.isArray(value.points) || value.points.length > 30000 || !value.points.every(p =>
    p && ['lat','lon','ele','dist','speedMps','watts','cadence','hr'].every(k=>finite(p[k])) &&
    typeof p.isoTime === 'string' && Number.isFinite(Date.parse(p.isoTime)))) throw new Error('Invalid telemetry.');
  if (!Array.isArray(value.zoneSeconds) || value.zoneSeconds.length !== 7 || !value.zoneSeconds.every(v=>finite(v)&&v>=0)) throw new Error('Invalid session zones.');
  if (value.workout && (!Array.isArray(value.workout.blocks) || !value.workout.blocks.length ||
      !finite(value.workout.totalDurationSec) || value.workout.totalDurationSec <= 0 ||
      !value.workout.blocks.every(b=>finite(b.durationSec)&&b.durationSec>0))) throw new Error('Invalid workout plan.');
  return value;
}

export function readRecovery(storage) {
  try {
    const raw = storage.getItem(RIDE_RECOVERY_KEY);
    return raw ? {snapshot:validateRecovery(JSON.parse(raw)),status:'loaded'} : {snapshot:null,status:'empty'};
  } catch { return {snapshot:null,status:'error'}; }
}

export function saveRecovery(storage, snapshot) {
  validateRecovery(snapshot);
  const text = JSON.stringify(snapshot);
  if (text.length > 3500000) throw new Error('The saved session is too large.');
  storage.setItem(RIDE_RECOVERY_KEY,text);
}
