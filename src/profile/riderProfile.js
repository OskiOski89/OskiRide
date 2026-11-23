export const RIDER_PROFILE_KEY = 'oskiride_rider_profile_v1';
export const DEFAULT_PROFILE = Object.freeze({name:'OskiRide',ftpWatts:250,weightKg:75,bikeType:'aero'});
const clamp = (v,lo,hi,fallback) => Number.isFinite(Number(v)) && v !== '' && v !== null
  ? Math.min(hi,Math.max(lo,Number(v))) : fallback;

export function normalizeProfile(value = {}) {
  const data = value && typeof value === 'object' ? value : {};
  return {
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0,40) : DEFAULT_PROFILE.name,
    ftpWatts: Math.round(clamp(data.ftpWatts,80,550,250)),
    weightKg: clamp(data.weightKg,35,180,75),
    bikeType: ['aero','tt','mtb'].includes(data.bikeType) ? data.bikeType : 'aero',
    preferences: {
      quality: ['eco','medium','ultra'].includes(data.preferences?.quality) ? data.preferences.quality : 'medium',
      adaptiveGraphics: data.preferences?.adaptiveGraphics !== false,
      timeOfDay: ['day','dynamic','sunset','night'].includes(data.preferences?.timeOfDay) ? data.preferences.timeOfDay : 'day',
      ghostMode: ['gpx','ftp','tempo','off'].includes(data.preferences?.ghostMode) ? data.preferences.ghostMode : 'gpx',
      recordGhost: data.preferences?.recordGhost !== false,
    },
  };
}

export function readProfile(storage) {
  try {
    const raw = storage.getItem(RIDER_PROFILE_KEY);
    if (!raw) return {profile:{...DEFAULT_PROFILE},status:'empty'};
    const value = JSON.parse(raw);
    if (value.version !== 1 || !value.profile || typeof value.profile!=='object' || Array.isArray(value.profile)) throw new Error('Invalid profile.');
    return {profile:normalizeProfile(value.profile),status:'loaded'};
  } catch { return {profile:{...DEFAULT_PROFILE},status:'error'}; }
}

export function saveProfile(storage, profile) {
  const normalized = normalizeProfile(profile);
  storage.setItem(RIDER_PROFILE_KEY,JSON.stringify({version:1,profile:normalized}));
  return normalized;
}
