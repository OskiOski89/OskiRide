export const ALL_GPX = 'all-gpx';

const normalizeName = name => typeof name === 'string' ? name.trim().normalize().toLocaleLowerCase('pl-PL') : '';
export const rideDate = ride => new Date(ride.startedAtIso || ride.savedAtIso);

export function indexJournalRoutes(rides, library, presets) {
  const routes = new Map();
  const names = new Map();
  const remember = (key, name) => {
    const normalized = normalizeName(name);
    if (!normalized) return;
    if (!names.has(normalized)) names.set(normalized, new Set());
    names.get(normalized).add(key);
  };

  for (const [key, name] of Object.entries(presets)) {
    routes.set(`preset:${key}`, { name, group: 'preset' });
    remember(`preset:${key}`, name);
  }
  for (const route of library) {
    const key = `gpx:${route.id}`;
    routes.set(key, { name: route.name, group: 'gpx', distanceM: route.distanceM });
    remember(key, route.name);
  }
  for (const { routeKey, routeName, routeLengthM } of rides) {
    if (!routeKey) continue;
    if (!routes.has(routeKey)) {
      routes.set(routeKey, { name: routeName || 'Unnamed route', group: routeKey.startsWith('preset:') ? 'preset' : 'gpx', distanceM: routeLengthM });
    }
    remember(routeKey, routeName);
  }

  const indexedRides = rides.map(ride => {
    const name = normalizeName(ride.routeName);
    const matches = names.get(name);
    const key = ride.routeKey || (matches?.size === 1 ? matches.values().next().value : `legacy:${name}`);
    if (!routes.has(key)) routes.set(key, { name: ride.routeName || 'Unnamed route', group: 'legacy' });
    const route = routes.get(key);
    const legacyGpx = route.group === 'legacy' && (name.endsWith('.gpx') || matches?.size > 0
      && [...matches].every(match => routes.get(match).group === 'gpx'));
    return { ...ride, journalRouteKey: key, journalRouteName: route.name, journalIsGpx: route.group === 'gpx' || legacyGpx };
  });
  return { routes, rides: indexedRides.sort((a, b) => (rideDate(b).getTime() || 0) - (rideDate(a).getTime() || 0)) };
}

export function filterJournalRides({ rides }, routeKey, range, now = new Date()) {
  let start = null;
  if (range === 'year') start = new Date(now.getFullYear(), 0, 1);
  if (range === '30' || range === '90') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - Number(range) + 1);
  }
  return rides.filter(ride => {
    if (start && !(rideDate(ride) >= start)) return false;
    if (routeKey === ALL_GPX) return ride.journalIsGpx;
    return !routeKey || ride.journalRouteKey === routeKey;
  });
}

export function distanceKm(ride) {
  const distance = ride.distanceTravelledM ?? ride.distanceM;
  return Number.isFinite(distance) ? distance / 1000 : null;
}

export function peakPower(ride, seconds, key) {
  const value = ride.peaks?.[key];
  const samples = ride.recordedSampleCount ?? ride.elapsedSeconds;
  return samples >= seconds && Number.isFinite(value) ? value : null;
}

export function summarizeRides(rides) {
  const totals = { count: rides.length, distance: 0, duration: 0, ascent: 0, m5: null, m20: null };
  for (const ride of rides) {
    totals.distance += distanceKm(ride) ?? 0;
    totals.duration += Number.isFinite(ride.elapsedSeconds) ? ride.elapsedSeconds : 0;
    totals.ascent += Number.isFinite(ride.elevationGainM) ? ride.elevationGainM : 0;
    for (const [key, seconds] of [['m5', 300], ['m20', 1200]]) {
      const peak = peakPower(ride, seconds, key);
      if (peak !== null) totals[key] = Math.max(totals[key] ?? 0, peak);
    }
  }
  return totals;
}

export function journalPeriods(rides, grouping) {
  const groups = new Map();
  for (const ride of rides) {
    const day = rideDate(ride);
    if (!Number.isFinite(day.getTime())) continue;
    day.setHours(0, 0, 0, 0);
    if (grouping === 'month') day.setDate(1);
    else day.setDate(day.getDate() - (day.getDay() + 6) % 7);
    const key = day.getTime();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ride);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([start, rows]) => ({
    day: new Date(start), ...summarizeRides(rows),
  }));
}

export function comparisonSeries(ride, metric, axis) {
  let lastX = 0;
  let lastDist = null;
  let estimatedDistance = 0;
  const points = ride.points || [];
  return points.flatMap((point, index) => {
    if (Number.isFinite(point.dist)) {
      estimatedDistance += Math.max(0, point.dist - (lastDist ?? point.dist));
      lastDist = point.dist;
    }
    const time = point.rideElapsedSeconds ?? (index + 1) * (ride.elapsedSeconds || 0) / points.length;
    const x = axis === 'route' ? point.dist / 1000 : axis === 'distance'
      ? (point.rideDistanceM ?? estimatedDistance) / 1000 : time / 60;
    const raw = point[metric];
    const y = Number.isFinite(raw) && (metric !== 'hr' || raw > 0) ? (metric === 'speedMps' ? raw * 3.6 : raw) : null;
    if (!Number.isFinite(x)) return [];
    const previous = points[index - 1];
    const jumped = axis === 'route' && Number.isFinite(previous?.rideDistanceM) && Number.isFinite(point.rideDistanceM)
      && Math.abs((point.dist - previous.dist) - (point.rideDistanceM - previous.rideDistanceM)) > 2;
    const split = index > 0 && (x < lastX || jumped);
    lastX = x;
    return [{ x, y, split }];
  });
}
