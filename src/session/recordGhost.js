import { formatNumber, formatTimeMMSS } from '../ui/formatters.js';

const dateFormat = new Intl.DateTimeFormat('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' });

export function normalizeRouteName(name) {
  return typeof name === 'string' ? name.trim().normalize().toLocaleLowerCase('pl-PL') : '';
}

function formatClock(seconds) {
  const safe = Math.max(0, Math.round(seconds || 0));
  return safe < 3600
    ? formatTimeMMSS(safe)
    : `${Math.floor(safe / 3600)}:${formatTimeMMSS(safe % 3600)}`;
}

export function matchesRoute(ride, routeKey, routeName) {
  if (!ride || typeof ride !== 'object') return false;
  const targetName = normalizeRouteName(routeName);
  if (ride.routeKey) {
    if (ride.routeKey === routeKey) return true;
    if (routeKey?.startsWith('gpx:') && targetName && ride.routeKey === `gpx-name:${targetName}`) return true;
    return false;
  }
  return Boolean(targetName && normalizeRouteName(ride.routeName) === targetName);
}

export function isFullRouteRide(ride, totalDistanceM) {
  const routeLen = Math.max(100, Number(totalDistanceM) || Number(ride?.routeLengthM) || 0);
  const startDist = Number.isFinite(ride?.rideStartDistanceM) ? ride.rideStartDistanceM : 0;
  const endDist = Number.isFinite(ride?.distanceM) ? ride.distanceM : 0;
  const travelled = Number.isFinite(ride?.distanceTravelledM) ? ride.distanceTravelledM : Math.max(0, endDist - startDist);
  return startDist <= Math.max(60, routeLen * 0.03) && (endDist >= routeLen * 0.95 || (ride?.finished && travelled >= routeLen * 0.9));
}

export function compareRecordCandidates(a, b, totalDistanceM) {
  const fullA = isFullRouteRide(a, totalDistanceM);
  const fullB = isFullRouteRide(b, totalDistanceM);
  if (fullA !== fullB) return fullA ? -1 : 1;

  const distA = Number.isFinite(a?.distanceTravelledM) ? a.distanceTravelledM : (Number(a?.distanceM) || 0);
  const distB = Number.isFinite(b?.distanceTravelledM) ? b.distanceTravelledM : (Number(b?.distanceM) || 0);
  const timeA = Math.max(1, Number(a?.elapsedSeconds) || Infinity);
  const timeB = Math.max(1, Number(b?.elapsedSeconds) || Infinity);

  if (fullA && fullB) {
    if (Math.abs(timeA - timeB) > 0.5) return timeA - timeB;
    const wattsDiff = (Number(b?.avgWatts) || 0) - (Number(a?.avgWatts) || 0);
    if (wattsDiff !== 0) return wattsDiff;
  } else {
    if (Math.abs(distB - distA) > 25) return distB - distA;
    const speedA = distA / timeA;
    const speedB = distB / timeB;
    if (Math.abs(speedB - speedA) > 0.05) return speedB - speedA;
  }

  const dateA = Date.parse(a?.startedAtIso || a?.savedAtIso || '') || 0;
  const dateB = Date.parse(b?.startedAtIso || b?.savedAtIso || '') || 0;
  return dateB - dateA;
}

export function filterRouteRecordCandidates(rides, routeKey, routeName, totalDistanceM) {
  if (!Array.isArray(rides)) return [];
  return rides
    .filter(ride => {
      if (!matchesRoute(ride, routeKey, routeName)) return false;
      const dist = ride.distanceTravelledM ?? ride.distanceM ?? 0;
      const samples = ride.recordedSampleCount ?? (Array.isArray(ride.points) ? ride.points.length : null);
      if (samples !== null && samples <= 0) return false;
      return Number.isFinite(ride.elapsedSeconds) && ride.elapsedSeconds > 0 && Number.isFinite(dist) && dist > 0;
    })
    .sort((a, b) => compareRecordCandidates(a, b, totalDistanceM));
}

export function formatRecordCandidateOption(ride, totalDistanceM, isBest = false) {
  const distKm = formatNumber((ride.distanceTravelledM ?? ride.distanceM ?? 0) / 1000, 2);
  const clock = formatClock(ride.elapsedSeconds || 0);
  const watts = Math.round(ride.avgWatts || 0);
  const date = new Date(ride.startedAtIso || ride.savedAtIso);
  const dateText = Number.isFinite(date.getTime())
    ? `${dateFormat.format(date)}, ${timeFormat.format(date)}`
    : 'Saved ride';
  const prefix = isBest
    ? (isFullRouteRide(ride, totalDistanceM) ? 'Record · ' : 'Best attempt · ')
    : '';
  return `${prefix}${clock} · ${watts} W · ${distKm} km (${dateText})`;
}

export function formatRecordGhostStatus(ghostData, enabled, isBest = true) {
  if (!enabled) {
    return 'Second ghost is off. Turn it on to race a saved ride.';
  }
  if (!ghostData) {
    return 'No saved ride on this route. Save a ride to race your personal best.';
  }
  const clock = formatClock(ghostData.elapsedSeconds);
  const watts = Math.round(ghostData.avgWatts || 0);
  const distKm = formatNumber((ghostData.distanceTravelledM ?? ghostData.distanceM ?? 0) / 1000, 2);
  const date = new Date(ghostData.startedAtIso);
  const dateText = Number.isFinite(date.getTime()) ? ` z ${dateFormat.format(date)}` : '';
  const label = isBest
    ? (ghostData.isFullRoute ? 'Route record' : 'Best saved segment')
    : 'Selected ride';
  return `${label}: ${clock} · ${watts} W · ${distKm} km${dateText}.`;
}

export function buildRecordGhostSamples(ride, totalDistanceM) {
  if (!ride || !Array.isArray(ride.points) || ride.points.length === 0) return null;
  const rawPoints = ride.points.filter(point => point && Number.isFinite(point.dist));
  if (rawPoints.length === 0) return null;

  const totalSec = Math.max(1, Number(ride.elapsedSeconds) || rawPoints.length);
  const samples = [];
  let lastTime = 0;
  let lastDist = Number.isFinite(ride.rideStartDistanceM)
    ? Math.max(0, Math.min(ride.rideStartDistanceM, rawPoints[0].dist))
    : Math.max(0, rawPoints[0].dist - Math.max(1, rawPoints[0].speedMps || 5));

  const startDistM = lastDist;
  samples.push({
    timeSec: 0,
    distM: startDistM,
    watts: Math.round(Number.isFinite(rawPoints[0].watts) ? rawPoints[0].watts : (ride.avgWatts || 180)),
    cadence: Math.round(Number.isFinite(rawPoints[0].cadence) && rawPoints[0].cadence > 0 ? rawPoints[0].cadence : (ride.avgCadence || 85)),
    speedMps: 0,
  });

  for (let i = 0; i < rawPoints.length; i++) {
    const point = rawPoints[i];
    const fallbackTime = ((i + 1) * totalSec) / rawPoints.length;
    const rawTime = Number.isFinite(point.rideElapsedSeconds) && point.rideElapsedSeconds > 0
      ? point.rideElapsedSeconds
      : fallbackTime;
    const timeSec = Math.max(lastTime + 0.01, rawTime);
    const distM = Math.max(lastDist, point.dist);
    const dt = Math.max(0.01, timeSec - lastTime);
    const derivedSpeed = (distM - lastDist) / dt;
    const speedMps = Number.isFinite(point.speedMps) && point.speedMps >= 0 ? point.speedMps : derivedSpeed;
    const watts = Math.round(Number.isFinite(point.watts) ? point.watts : (ride.avgWatts || 180));
    const cadence = Math.round(Number.isFinite(point.cadence) && point.cadence >= 0 ? point.cadence : (ride.avgCadence || 85));

    samples.push({ timeSec, distM, watts, cadence, speedMps });
    lastTime = timeSec;
    lastDist = distM;
  }

  const endDistM = Number.isFinite(ride.distanceM) ? Math.max(lastDist, ride.distanceM) : lastDist;
  if (endDistM > lastDist + 0.05) {
    const lastSample = samples[samples.length - 1];
    const extraTime = (endDistM - lastDist) / Math.max(1.5, lastSample.speedMps || 5);
    const endTime = Math.max(lastTime + Math.min(5, extraTime), Number(ride.elapsedSeconds) || lastTime + 0.1);
    samples.push({
      timeSec: endTime,
      distM: endDistM,
      watts: lastSample.watts,
      cadence: lastSample.cadence,
      speedMps: lastSample.speedMps,
    });
    lastTime = endTime;
    lastDist = endDistM;
  }

  return {
    id: ride.id,
    routeName: ride.routeName || 'Route',
    elapsedSeconds: Math.max(Number(ride.elapsedSeconds) || 0, lastTime),
    avgWatts: Math.round(Number(ride.avgWatts) || 0),
    weightKg: Math.max(35, Number(ride.weightKg) || 75),
    startDistM,
    distanceM: lastDist,
    distanceTravelledM: Number.isFinite(ride.distanceTravelledM) ? ride.distanceTravelledM : Math.max(0, lastDist - startDistM),
    startedAtIso: ride.startedAtIso || ride.savedAtIso || null,
    isFullRoute: isFullRouteRide(ride, totalDistanceM),
    samples,
  };
}

export function sampleRecordGhostAtTime(ghostData, elapsedSec) {
  if (!ghostData?.samples?.length) {
    return { distanceM: 0, speedMps: 0, watts: 0, cadence: 0, finished: false };
  }
  const samples = ghostData.samples;
  const first = samples[0];
  const last = samples[samples.length - 1];

  if (elapsedSec <= 0) {
    return { distanceM: first.distM, speedMps: 0, watts: first.watts, cadence: 0, finished: false };
  }
  if (elapsedSec >= last.timeSec) {
    return { distanceM: last.distM, speedMps: 0, watts: 0, cadence: 0, finished: true };
  }

  let low = 0;
  let high = samples.length - 1;
  while (low < high - 1) {
    const mid = (low + high) >> 1;
    if (samples[mid].timeSec <= elapsedSec) low = mid;
    else high = mid;
  }

  const p0 = samples[low];
  const p1 = samples[high];
  const tSpan = Math.max(p1.timeSec - p0.timeSec, 0.001);
  const t = Math.min(1, Math.max(0, (elapsedSec - p0.timeSec) / tSpan));
  const distanceM = p0.distM + (p1.distM - p0.distM) * t;
  const segSpeed = Math.max(0, (p1.distM - p0.distM) / tSpan);
  const rawSpeed = p0.speedMps + (p1.speedMps - p0.speedMps) * t;
  const speedMps = segSpeed > 0.05 ? segSpeed : Math.max(0, rawSpeed);
  const watts = Math.round(p0.watts + (p1.watts - p0.watts) * t);
  const cadence = speedMps > 0.1 ? Math.round(p0.cadence + (p1.cadence - p0.cadence) * t) : 0;

  return { distanceM, speedMps, watts, cadence, finished: false };
}

export function sampleRecordTimeAtDistance(samples, distM) {
  if (!Array.isArray(samples) || samples.length === 0) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (distM <= first.distM) return first.timeSec;
  if (distM >= last.distM) return last.timeSec;

  let low = 0;
  let high = samples.length - 1;
  while (low < high - 1) {
    const mid = (low + high) >> 1;
    if (samples[mid].distM <= distM) low = mid;
    else high = mid;
  }

  const p0 = samples[low];
  const p1 = samples[high];
  const dSpan = p1.distM - p0.distM;
  if (dSpan <= 0.001) return p0.timeSec;
  const t = Math.min(1, Math.max(0, (distM - p0.distM) / dSpan));
  return p0.timeSec + (p1.timeSec - p0.timeSec) * t;
}

export function computeRecordGhostGap(ghostData, playerDistM, playerElapsedSec, playerSpeedMps, timeOffsetSec = 0) {
  const ghostState = sampleRecordGhostAtTime(ghostData, playerElapsedSec + timeOffsetSec);
  const gapMeters = playerDistM - ghostState.distanceM;
  if (!ghostData?.samples?.length || playerElapsedSec <= 0.05) {
    return { gapSeconds: 0, gapMeters, ghostState };
  }

  if (playerDistM >= ghostData.startDistM && playerDistM <= ghostData.distanceM + 2) {
    const recordTimeAtPlayerDist = Math.max(0, sampleRecordTimeAtDistance(ghostData.samples, playerDistM) - timeOffsetSec);
    const gapSeconds = recordTimeAtPlayerDist - playerElapsedSec;
    return { gapSeconds, gapMeters, ghostState };
  }

  const refSpeed = Math.max(playerSpeedMps || 0, ghostState.speedMps || 0, 4.0);
  return { gapSeconds: gapMeters / refSpeed, gapMeters, ghostState };
}
