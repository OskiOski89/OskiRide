import * as THREE from 'three';

/**
 * Interpolacja danych trasy (wysokosc n.p.m., nachylenie %, kat zakretu, czas Ducha, lat, lon) dla biezacego dystansu (w metrach)
 */
export function sampleRouteAtDistance(routePoints, distM) {
  if (!routePoints || routePoints.length < 2) {
    return {
      ele: 0,
      grade: 0,
      turnAngleDeg: 0,
      ghostElapsedSec: 0,
      lat: 49.25,
      lon: 19.95,
      headingDeg: 0,
      cardinalDir: 'N',
      bankingPct: 0,
    };
  }

  let low = 0;
  let high = routePoints.length - 1;
  while (low < high - 1) {
    const mid = (low + high) >> 1;
    if (routePoints[mid].dist <= distM) low = mid;
    else high = mid;
  }

  const p0 = routePoints[low];
  const p1 = routePoints[high];
  const span = Math.max(p1.dist - p0.dist, 0.001);
  const t = THREE.MathUtils.clamp((distM - p0.dist) / span, 0, 1);

  // Plynna interpolacja azymutu z uwzglednieniem przejscia 360/0 stopni
  const h0 = p0.headingDeg || 0;
  const h1 = p1.headingDeg || 0;
  let dh = h1 - h0;
  while (dh > 180) dh -= 360;
  while (dh < -180) dh += 360;
  const interpHeading = (h0 + dh * t + 360) % 360;

  return {
    ele: THREE.MathUtils.lerp(p0.ele, p1.ele, t),
    grade: THREE.MathUtils.lerp(p0.grade, p1.grade, t),
    turnAngleDeg: THREE.MathUtils.lerp(p0.turnAngleDeg || 0, p1.turnAngleDeg || 0, t),
    ghostElapsedSec: THREE.MathUtils.lerp(p0.ghostElapsedSec || 0, p1.ghostElapsedSec || 0, t),
    lat: THREE.MathUtils.lerp(p0.lat, p1.lat, t),
    lon: THREE.MathUtils.lerp(p0.lon, p1.lon, t),
    headingDeg: interpHeading,
    cardinalDir: t < 0.5 ? p0.cardinalDir || 'N' : p1.cardinalDir || 'N',
    bankingPct: THREE.MathUtils.lerp(p0.bankingPct || 0, p1.bankingPct || 0, t),
  };
}

/**
 * Wyznacza dystans (m) Ducha dla zadanego czasu przejazdu z pliku GPX (Ghost GPX Time Mode)
 */
export function sampleDistanceAtGhostTime(routePoints, elapsedSec) {
  if (!routePoints || routePoints.length < 2) return 0;
  const maxTime = routePoints[routePoints.length - 1].ghostElapsedSec || 1;
  const loopedTime = elapsedSec % Math.max(1, maxTime);

  let low = 0;
  let high = routePoints.length - 1;
  while (low < high - 1) {
    const mid = (low + high) >> 1;
    if ((routePoints[mid].ghostElapsedSec || 0) <= loopedTime) low = mid;
    else high = mid;
  }

  const p0 = routePoints[low];
  const p1 = routePoints[high];
  const tSpan = Math.max((p1.ghostElapsedSec || 0) - (p0.ghostElapsedSec || 0), 0.001);
  const t = THREE.MathUtils.clamp((loopedTime - (p0.ghostElapsedSec || 0)) / tSpan, 0, 1);
  return THREE.MathUtils.lerp(p0.dist, p1.dist, t);
}

/**
 * Skanuje odcinek trasy przed kolarzem (25m - 220m), aby ostrzec o ostrym zakrecie lub stromej sciance.
 * Zwraca czytelny obiekt z duza ikona kierunku, tytulem i zaokraglonym dystansem (co 5m, zeby cyfry nie migaly).
 */
export function scanUpcomingRoute(routePoints, currentDistM) {
  if (!routePoints || routePoints.length < 2) return null;

  let sharpestTurn = 0;
  let turnDistAhead = 0;
  let maxUpcomingGrade = 0;
  let gradeDistAhead = 0;

  for (let i = 0; i < routePoints.length; i++) {
    const ahead = routePoints[i].dist - currentDistM;
    if (ahead < 20) continue;
    if (ahead > 220) break;

    const absTurn = Math.abs(routePoints[i].turnAngleDeg || 0);
    if (absTurn > Math.abs(sharpestTurn) && absTurn >= 30) {
      sharpestTurn = routePoints[i].turnAngleDeg;
      turnDistAhead = ahead;
    }

    if (routePoints[i].grade > maxUpcomingGrade && routePoints[i].grade >= 8.5) {
      maxUpcomingGrade = routePoints[i].grade;
      gradeDistAhead = ahead;
    }
  }

  if (Math.abs(sharpestTurn) >= 30) {
    const isRight = sharpestTurn > 0;
    const isHairpin = Math.abs(sharpestTurn) >= 65;
    const cleanDist = Math.max(10, Math.round(turnDistAhead / 5) * 5);
    const arrowSvg = isRight
      ? `<svg viewBox="0 0 36 36" width="34" height="34"><path d="M8 28 V16 C8 11 12 8 17 8 H27 M20 2 L28 8 L20 14" fill="none" stroke="#0f172a" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg viewBox="0 0 36 36" width="34" height="34"><path d="M28 28 V16 C28 11 24 8 19 8 H9 M16 2 L8 8 L16 14" fill="none" stroke="#0f172a" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    return {
      type: 'turn',
      isRight,
      isHairpin,
      subtitle: '',
      iconHtml: arrowSvg,
      title: isHairpin
        ? isRight
          ? 'Right hairpin'
          : 'Left hairpin'
        : isRight
        ? 'Right turn'
        : 'Left turn',
      distText: `Za ${cleanDist} m`,
    };
  }

  if (maxUpcomingGrade >= 8.5 && gradeDistAhead > 30) {
    const cleanDist = Math.max(10, Math.round(gradeDistAhead / 5) * 5);
    const steepSvg = `<svg viewBox="0 0 36 36" width="34" height="34"><path d="M4 28 L30 8 L30 28 Z" fill="#0f172a"/></svg>`;
    return {
      type: 'steep',
      iconHtml: steepSvg,
      title: `Steep climb +${maxUpcomingGrade.toFixed(1).replace('.', ',')}%`,
      subtitle: '',
      distText: `Za ${cleanDist} m`,
    };
  }

  return null;
}

/**
 * 24 realne przelozenia szosowe (odpowiednik napedu 2x12 Shimano/SRAM 50/34 z kaseta 11-34T)
 * Posortowane rosnaco od ultramiekkiego mlynka (1.00) do twardego blatu na sprint i zjazd (5.09)
 */
export const GEARING_PROFILES = Object.freeze({
  allaround: {
    id: 'allaround',
    name: 'All-round road (50/34, 11-34T)',
    ratios: Object.freeze([
      1.000, 1.133, 1.259, 1.417, 1.545, 1.700, 1.889, 2.000, 2.125, 2.267, 2.429, 2.632,
      2.778, 2.941, 3.125, 3.333, 3.571, 3.846, 4.167, 4.333, 4.545, 4.727, 4.909, 5.091,
    ]),
    details: Object.freeze([
      { gear: 1, ring: 34, cog: 34, ratio: 1.000, desc: '34×34T' },
      { gear: 2, ring: 34, cog: 30, ratio: 1.133, desc: '34×30T' },
      { gear: 3, ring: 34, cog: 27, ratio: 1.259, desc: '34×27T' },
      { gear: 4, ring: 34, cog: 24, ratio: 1.417, desc: '34×24T' },
      { gear: 5, ring: 34, cog: 22, ratio: 1.545, desc: '34×22T' },
      { gear: 6, ring: 34, cog: 20, ratio: 1.700, desc: '34×20T' },
      { gear: 7, ring: 34, cog: 18, ratio: 1.889, desc: '34×18T' },
      { gear: 8, ring: 34, cog: 17, ratio: 2.000, desc: '34×17T' },
      { gear: 9, ring: 34, cog: 16, ratio: 2.125, desc: '34×16T' },
      { gear: 10, ring: 34, cog: 15, ratio: 2.267, desc: '34×15T' },
      { gear: 11, ring: 34, cog: 14, ratio: 2.429, desc: '34×14T' },
      { gear: 12, ring: 50, cog: 19, ratio: 2.632, desc: '50×19T' },
      { gear: 13, ring: 50, cog: 18, ratio: 2.778, desc: '50×18T' },
      { gear: 14, ring: 50, cog: 17, ratio: 2.941, desc: '50×17T' },
      { gear: 15, ring: 50, cog: 16, ratio: 3.125, desc: '50×16T' },
      { gear: 16, ring: 50, cog: 15, ratio: 3.333, desc: '50×15T' },
      { gear: 17, ring: 50, cog: 14, ratio: 3.571, desc: '50×14T' },
      { gear: 18, ring: 50, cog: 13, ratio: 3.846, desc: '50×13T' },
      { gear: 19, ring: 50, cog: 12, ratio: 4.167, desc: '50×12T' },
      { gear: 20, ring: 52, cog: 12, ratio: 4.333, desc: '52×12T' },
      { gear: 21, ring: 50, cog: 11, ratio: 4.545, desc: '50×11T' },
      { gear: 22, ring: 52, cog: 11, ratio: 4.727, desc: '52×11T' },
      { gear: 23, ring: 54, cog: 11, ratio: 4.909, desc: '54×11T' },
      { gear: 24, ring: 56, cog: 11, ratio: 5.091, desc: '56×11T' },
    ]),
  },
  climbing: {
    id: 'climbing',
    name: 'Climbing (46/30, 11–36T)',
    ratios: Object.freeze([
      0.833, 0.938, 1.071, 1.154, 1.250, 1.364, 1.500, 1.667, 1.765, 1.875, 2.000, 2.190,
      2.300, 2.421, 2.556, 2.706, 2.875, 3.067, 3.286, 3.538, 3.833, 4.000, 4.182, 4.364,
    ]),
    details: Object.freeze([
      { gear: 1, ring: 30, cog: 36, ratio: 0.833, desc: '30×36T (Alpy >15%)' },
      { gear: 2, ring: 30, cog: 32, ratio: 0.938, desc: '30×32T' },
      { gear: 3, ring: 30, cog: 28, ratio: 1.071, desc: '30×28T' },
      { gear: 4, ring: 30, cog: 26, ratio: 1.154, desc: '30×26T' },
      { gear: 5, ring: 30, cog: 24, ratio: 1.250, desc: '30×24T' },
      { gear: 6, ring: 30, cog: 22, ratio: 1.364, desc: '30×22T' },
      { gear: 7, ring: 30, cog: 20, ratio: 1.500, desc: '30×20T' },
      { gear: 8, ring: 30, cog: 18, ratio: 1.667, desc: '30×18T' },
      { gear: 9, ring: 30, cog: 17, ratio: 1.765, desc: '30×17T' },
      { gear: 10, ring: 30, cog: 16, ratio: 1.875, desc: '30×16T' },
      { gear: 11, ring: 30, cog: 15, ratio: 2.000, desc: '30×15T' },
      { gear: 12, ring: 46, cog: 21, ratio: 2.190, desc: '46×21T' },
      { gear: 13, ring: 46, cog: 20, ratio: 2.300, desc: '46×20T' },
      { gear: 14, ring: 46, cog: 19, ratio: 2.421, desc: '46×19T' },
      { gear: 15, ring: 46, cog: 18, ratio: 2.556, desc: '46×18T' },
      { gear: 16, ring: 46, cog: 17, ratio: 2.706, desc: '46×17T' },
      { gear: 17, ring: 46, cog: 16, ratio: 2.875, desc: '46×16T' },
      { gear: 18, ring: 46, cog: 15, ratio: 3.067, desc: '46×15T' },
      { gear: 19, ring: 46, cog: 14, ratio: 3.286, desc: '46×14T' },
      { gear: 20, ring: 46, cog: 13, ratio: 3.538, desc: '46×13T' },
      { gear: 21, ring: 46, cog: 12, ratio: 3.833, desc: '46×12T' },
      { gear: 22, ring: 48, cog: 12, ratio: 4.000, desc: '48×12T' },
      { gear: 23, ring: 46, cog: 11, ratio: 4.182, desc: '46×11T' },
      { gear: 24, ring: 48, cog: 11, ratio: 4.364, desc: '48×11T' },
    ]),
  },
  flat: {
    id: 'flat',
    name: 'Flat / time trial (53/39, 11–25T)',
    ratios: Object.freeze([
      1.560, 1.625, 1.696, 1.773, 1.857, 1.950, 2.053, 2.167, 2.294, 2.438, 2.600, 2.786,
      2.944, 3.118, 3.313, 3.533, 3.786, 4.077, 4.250, 4.417, 4.600, 4.818, 5.000, 5.200,
    ]),
    details: Object.freeze([
      { gear: 1, ring: 39, cog: 25, ratio: 1.560, desc: '39×25T' },
      { gear: 2, ring: 39, cog: 24, ratio: 1.625, desc: '39×24T' },
      { gear: 3, ring: 39, cog: 23, ratio: 1.696, desc: '39×23T' },
      { gear: 4, ring: 39, cog: 22, ratio: 1.773, desc: '39×22T' },
      { gear: 5, ring: 39, cog: 21, ratio: 1.857, desc: '39×21T' },
      { gear: 6, ring: 39, cog: 20, ratio: 1.950, desc: '39×20T' },
      { gear: 7, ring: 39, cog: 19, ratio: 2.053, desc: '39×19T' },
      { gear: 8, ring: 39, cog: 18, ratio: 2.167, desc: '39×18T' },
      { gear: 9, ring: 39, cog: 17, ratio: 2.294, desc: '39×17T' },
      { gear: 10, ring: 39, cog: 16, ratio: 2.438, desc: '39×16T' },
      { gear: 11, ring: 39, cog: 15, ratio: 2.600, desc: '39×15T' },
      { gear: 12, ring: 39, cog: 14, ratio: 2.786, desc: '39×14T' },
      { gear: 13, ring: 53, cog: 18, ratio: 2.944, desc: '53×18T' },
      { gear: 14, ring: 53, cog: 17, ratio: 3.118, desc: '53×17T' },
      { gear: 15, ring: 53, cog: 16, ratio: 3.313, desc: '53×16T' },
      { gear: 16, ring: 53, cog: 15, ratio: 3.533, desc: '53×15T' },
      { gear: 17, ring: 53, cog: 14, ratio: 3.786, desc: '53×14T' },
      { gear: 18, ring: 53, cog: 13, ratio: 4.077, desc: '53×13T' },
      { gear: 19, ring: 51, cog: 12, ratio: 4.250, desc: '51×12T' },
      { gear: 20, ring: 53, cog: 12, ratio: 4.417, desc: '53×12T' },
      { gear: 21, ring: 53, cog: 11.5, ratio: 4.600, desc: '53×11.5' },
      { gear: 22, ring: 53, cog: 11, ratio: 4.818, desc: '53×11T' },
      { gear: 23, ring: 55, cog: 11, ratio: 5.000, desc: '55×11T' },
      { gear: 24, ring: 56, cog: 11, ratio: 5.200, desc: '56×11T' },
    ]),
  },
});

export function getVirtualGearRatios(profileKey = 'allaround') {
  return GEARING_PROFILES[profileKey]?.ratios || GEARING_PROFILES.allaround.ratios;
}

export function getVirtualGearDetails(profileKey = 'allaround') {
  return GEARING_PROFILES[profileKey]?.details || GEARING_PROFILES.allaround.details;
}

export const VIRTUAL_GEAR_RATIOS = GEARING_PROFILES.allaround.ratios;
export const VIRTUAL_GEAR_DETAILS = GEARING_PROFILES.allaround.details;

export function getGearDetails(gearNum, profileKey = 'allaround') {
  const details = getVirtualGearDetails(profileKey);
  const idx = THREE.MathUtils.clamp((gearNum || 12) - 1, 0, details.length - 1);
  return details[idx];
}

/**
 * Zwraca status i rekomendacje asystenta kadencji na podjazdy i plaski teren
 */
export function getCadenceCoachStatus(cadence, gradePct = 0, watts = 0) {
  if (!cadence || cadence <= 10 || watts < 25) {
    return { state: 'idle', label: 'Not pedaling', color: '#94a3b8' };
  }
  const isClimbing = gradePct >= 4.0;
  if (isClimbing) {
    if (cadence < 65) {
      return { state: 'grind', label: 'Cadence too low. Shift down.', color: '#f97316' };
    }
    if (cadence > 95) {
      return { state: 'spin', label: 'High cadence. Shift up.', color: '#38bdf8' };
    }
    return { state: 'optimal', label: 'Cadence on target for climbing', color: '#22c55e' };
  }

  // Płasko i lekki podjazd/zjazd
  if (cadence < 72) {
    return { state: 'grind', label: 'Low cadence. Shift down.', color: '#facc15' };
  }
  if (cadence > 105) {
    return { state: 'spin', label: 'Very high cadence', color: '#38bdf8' };
  }
  return { state: 'optimal', label: 'Steady road cadence', color: '#22c55e' };
}

/**
 * Standard stref mocy Coggana (Z1–Z7)
 */
export function getCogganPowerZone(watts, ftpWatts = 250) {
  const safeFtp = Math.max(80, ftpWatts || 250);
  const pct = Math.round(((watts || 0) / safeFtp) * 100);

  if (pct < 55) {
    return { zone: 1, code: 'Z1', name: 'Z1 Active recovery', pct, color: '#94a3b8' };
  }
  if (pct <= 75) {
    return { zone: 2, code: 'Z2', name: 'Z2 Endurance', pct, color: '#3b82f6' };
  }
  if (pct <= 90) {
    return { zone: 3, code: 'Z3', name: 'Z3 Tempo', pct, color: '#22c55e' };
  }
  if (pct <= 105) {
    return { zone: 4, code: 'Z4', name: 'Z4 Threshold', pct, color: '#eab308' };
  }
  if (pct <= 120) {
    return { zone: 5, code: 'Z5', name: 'Z5 VO2 Max', pct, color: '#f97316' };
  }
  if (pct <= 150) {
    return { zone: 6, code: 'Z6', name: 'Z6 Anaerobic', pct, color: '#ef4444' };
  }
  return { zone: 7, code: 'Z7', name: 'Z7 Neuromuscular (sprint)', pct, color: '#a855f7' };
}

export function getHeartRateZoneInfo(bpm, hrMax = 185) {
  if (!bpm || bpm <= 0) return { label: '—', zone: 'Z0', color: '#94a3b8' };
  const pct = (bpm / hrMax) * 100;
  if (pct < 60) return { label: 'Z1 Recovery', zone: 'Z1', color: '#94a3b8' };
  if (pct < 70) return { label: 'Z2 Endurance', zone: 'Z2', color: '#38bdf8' };
  if (pct < 80) return { label: 'Z3 Tempo', zone: 'Z3', color: '#22c55e' };
  if (pct < 90) return { label: 'Z4 Threshold', zone: 'Z4', color: '#facc15' };
  return { label: 'Z5 beztlenowa', zone: 'Z5', color: '#ef4444' };
}

/**
 * Oblicza predkosc (m/s) i pozycje kolarza (lub bota) w oparciu o moc (W), nachylenie (%) i opory ruchu
 */
export function stepRiderPhysics(
  rider,
  routePoints,
  totalDistanceM,
  dt,
  draftFactor = 1.0,
  onFinishCallback = null
) {
  const totalMass = rider.weightKg + (rider.bikeWeightKg || 8.5);
  // Bezwladnosc obrotowa kół szosowych 700c (masa wirujaca 2 x I_wheel / r^2 ok. 1.8 kg)
  const wheelRotationalInertiaMass = 1.8;
  const effectiveInertialMass = totalMass + wheelRotationalInertiaMass;

  const g = 9.81;
  const slopeRad = Math.atan(rider.currentGradePct / 100);

  // Redukcja CdA w pozycji Aero Tuck na szybkich zjazdach (>52 km/h i nachylenie <= -4%)
  const isAeroTuck = rider.speedMps > 14.4 && rider.currentGradePct <= -4.0;
  const aeroPostureFactor = isAeroTuck ? 0.86 : 1.0;

  // Wstawanie z siodełka (taniec na pedałach na stromiznach powyżej 8% lub przy zrywach mocy)
  const isStanding =
    (rider.currentGradePct >= 8.0 || (rider.watts >= 320 && (rider.cadence || 80) < 74)) &&
    rider.speedMps > 1.0;

  // Dynamiczny wektor wiatru (predkosc i azymut zrodla wiatru)
  const windSpeedMps = typeof rider.windSpeedMps === 'number' ? rider.windSpeedMps : 4.2; // ~15 km/h
  const windDirDeg = typeof rider.windDirDeg === 'number' ? rider.windDirDeg : 45; // NE
  const headingDeg = rider.currentHeadingDeg || 0;

  // Kat wzgledny wiatru: 0 st. = wiatr w twarz (headwind), 180 st. = wiatr w plecy (tailwind)
  let relAngleDeg = Math.abs(headingDeg - windDirDeg) % 360;
  if (relAngleDeg > 180) relAngleDeg = 360 - relAngleDeg;
  const relAngleRad = (relAngleDeg * Math.PI) / 180;

  // Skladowa czolowa wiatru (dodatnia = headwind, ujemna = tailwind)
  const headwindMps = Math.cos(relAngleRad) * windSpeedMps;
  const apparentAirspeed = Math.max(0, rider.speedMps + headwindMps);
  const crosswindMps = Math.abs(Math.sin(relAngleRad) * windSpeedMps);
  const crosswindFactor = 1.0 + 0.005 * crosswindMps;

  // Wysokogórska gestosc powietrza wg m.n.p.m. (standard ISA - wzór barometryczny)
  const altitudeM = Math.max(0, rider.currentAltitudeM || 0);
  const airDensity = 1.225 * Math.exp(-altitudeM / 8500);

  // Sily oporu (N): Grawitacja + Toczenie + Aerodynamika (z uwzglednieniem wysokosci, draftingu i wiatru)
  const fGravity = totalMass * g * Math.sin(slopeRad);
  const fRolling = totalMass * g * Math.cos(slopeRad) * (rider.crr || 0.004);
  const cdA = (rider.cdA || 0.32) * draftFactor * aeroPostureFactor * crosswindFactor;
  const fAero = 0.5 * airDensity * cdA * apparentAirspeed * apparentAirspeed;

  rider.windSpeedMps = windSpeedMps;
  rider.windDirDeg = windDirDeg;
  rider.windRelAngleDeg = Math.round(relAngleDeg);
  rider.windHeadwindMps = headwindMps;
  rider.isAeroTuck = isAeroTuck;
  rider.isStanding = isStanding;

  const drivetrainEfficiency = 0.97;
  const effectiveSpeed = Math.max(rider.speedMps, 1.25);
  const fDrive = (rider.watts * drivetrainEfficiency) / effectiveSpeed;

  const fNet = fDrive - (fGravity + fRolling + fAero);
  // Przyspieszenie liniowe z uwzglednieniem pedu kół (wybieg / coasting)
  const accel = fNet / effectiveInertialMass;

  rider.speedMps = Math.max(0, rider.speedMps + accel * dt);

  if (rider.watts < 5 && rider.currentGradePct >= -0.3 && rider.speedMps < 0.8) {
    rider.speedMps = 0;
  }

  const prevEle = rider.currentAltitudeM;
  rider.distanceM += rider.speedMps * dt;

  if (rider.distanceM >= totalDistanceM) {
    rider.distanceM = totalDistanceM;
    rider.speedMps = 0;
    if (onFinishCallback) {
      onFinishCallback();
    }
  }

  const telemetry = sampleRouteAtDistance(routePoints, rider.distanceM);
  if (prevEle > 0 && telemetry.ele > prevEle && telemetry.ele - prevEle < 5) {
    rider.elevationGainM = (rider.elevationGainM || 0) + (telemetry.ele - prevEle);
  }

  rider.currentAltitudeM = telemetry.ele;
  rider.currentGradePct = telemetry.grade;
  rider.currentTurnAngleDeg = telemetry.turnAngleDeg;
  rider.currentHeadingDeg = telemetry.headingDeg;
  rider.currentCardinalDir = telemetry.cardinalDir;
  rider.currentBankingPct = telemetry.bankingPct;
  rider.lat = telemetry.lat;
  rider.lon = telemetry.lon;
}
