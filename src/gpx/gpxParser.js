import * as THREE from 'three';
import { createAlpeDHuezRoute } from './presets/alpeDHuezRoute.js';

/**
 * Przelicza wspolrzedne geograficzne (lat, lon) na lokalny uklad metryczny (x, z)
 */
export function latLonToMeters(lat, lon, refLat, refLon) {
  const R = 6371000;
  const dLat = THREE.MathUtils.degToRad(lat - refLat);
  const dLon = THREE.MathUtils.degToRad(lon - refLon);
  const x = dLon * R * Math.cos(THREE.MathUtils.degToRad(refLat));
  const z = -dLat * R; // Polnoc = -Z
  return { x, z };
}

/**
 * Przelicza lokalne wspolrzedne metryczne (x, z) z powrotem na GPS (lat, lon) do eksportu TCX/GPX
 */
export function metersToLatLon(x, z, refLat = 49.25, refLon = 19.95) {
  const R = 6371000;
  const dLat = -z / R;
  const dLon = x / (R * Math.cos(THREE.MathUtils.degToRad(refLat)));
  return {
    lat: refLat + THREE.MathUtils.radToDeg(dLat),
    lon: refLon + THREE.MathUtils.radToDeg(dLon),
  };
}

/**
 * Wyznacza fizycznie dokladna predkosc kolarza (m/s) na podstawie nachylenia trasy (%)
 * metodą numeryczną Newtona-Raphsona dla zadanego poziomu mocy (domyslnie 220W dla kolarza 75kg + 8.5kg roweru)
 */
export function calculateRealisticGhostSpeed(gradePct, riderWatts = 220, totalMassKg = 83.5) {
  const g = 9.80665;
  const rho = 1.225; // gestosc powietrza na poziomie morza
  const cdA = 0.315; // wspolczynnik oporu aerodynamicznego szosowego
  const crr = 0.0036; // opor toczenia po asfalcie
  const theta = Math.atan(gradePct / 100);
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);

  // Na ostrym zjezdzie (<-4%) kolarz osiaga predkosc graniczna z lekkim dokrecaniem
  if (gradePct < -4.0) {
    const gravForce = -totalMassKg * g * sinT;
    const rollForce = totalMassKg * g * cosT * crr;
    const netDownhillForce = gravForce - rollForce;
    if (netDownhillForce > 0) {
      const vTerm = Math.sqrt((2 * (netDownhillForce + 70 / 14)) / (rho * cdA));
      return THREE.MathUtils.clamp(vTerm, 10.5, 22.0); // 38 - 79.2 km/h
    }
  }

  // Rozwiazanie rownania sil oporow: f(v) = F_res * v - P = 0
  const gravityRolling = totalMassKg * g * (sinT + crr * cosT);
  let v = 7.5; // punkt startowy ~27 km/h

  for (let iter = 0; iter < 10; iter++) {
    const fv = gravityRolling * v + 0.5 * rho * cdA * v * v * v - riderWatts;
    const dfv = gravityRolling + 1.5 * rho * cdA * v * v;
    if (Math.abs(dfv) < 1e-6) break;
    const nextV = v - fv / dfv;
    if (Math.abs(nextV - v) < 0.01) {
      v = nextV;
      break;
    }
    v = Math.max(1.5, nextV);
  }

  return THREE.MathUtils.clamp(v, 2.2, 21.5); // min 7.9 km/h na scianach, max 77.4 km/h
}

/**
 * Oblicza rzeczywiste przewyzszenie trasy (+m) za pomoca algorytmu histerezy (prog 0.6m),
 * eliminujac sztuczne zawyzanie sumy podjazdow wynikajace z szumow probkowania GPS
 */
export function calculateCumulativeAscent(points) {
  if (!points || points.length < 2) return 0;
  let totalAscent = 0;
  let valleyAlt = points[0].ele;
  let peakAlt = points[0].ele;
  let ascending = false;

  for (let i = 1; i < points.length; i++) {
    const alt = points[i].ele;
    if (alt > peakAlt) {
      peakAlt = alt;
      if (!ascending && peakAlt - valleyAlt >= 0.6) {
        ascending = true;
      }
    } else if (alt < peakAlt - 0.6) {
      if (ascending) {
        totalAscent += peakAlt - valleyAlt;
      }
      valleyAlt = alt;
      peakAlt = alt;
      ascending = false;
    }
  }

  if (ascending && peakAlt > valleyAlt) {
    totalAscent += peakAlt - valleyAlt;
  }

  return Math.round(totalAscent);
}

/**
 * Wylicza krzywizne zakretow, azymut geograficzny, roze wiatrow, przechyłke szosy
 * oraz uzupelnia czasy przejazdu Ducha (Ghost Rider) za pomoca fizyki aerodynamicznej
 */
export function enrichRoutePoints(points) {
  let simGhostTime = 0;
  const CARDINAL_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];

    // 1. Krzywizna zakretu (kat zmiany kierunku jazdy miedzy sasiednimi odcinkami)
    if (i > 0 && i < points.length - 1) {
      const prev = points[Math.max(0, i - 2)];
      const next = points[Math.min(points.length - 1, i + 2)];
      const a1 = Math.atan2(p.x - prev.x, -(p.z - prev.z));
      const a2 = Math.atan2(next.x - p.x, -(next.z - p.z));
      let diff = THREE.MathUtils.radToDeg(a2 - a1);
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;
      p.turnAngleDeg = diff;
    } else {
      p.turnAngleDeg = 0;
    }

    // 2. Azymut geograficzny (0-360 st., Polnoc = 0, Wschod = 90) oraz roza wiatrow (N..NW)
    let dx = 0, dz = 0;
    if (i < points.length - 1) {
      const next = points[i + 1];
      dx = next.x - p.x;
      dz = next.z - p.z;
    } else if (i > 0) {
      const prev = points[i - 1];
      dx = p.x - prev.x;
      dz = p.z - prev.z;
    }
    const headingRad = Math.atan2(dx, -dz);
    const headingDeg = (THREE.MathUtils.radToDeg(headingRad) + 360) % 360;
    p.headingDeg = Math.round(headingDeg);
    const cardIdx = Math.round(headingDeg / 45) % 8;
    p.cardinalDir = CARDINAL_DIRS[cardIdx];

    // 3. Przechylka poprzeczna jezdni (Superelevation / Banking) proporcjonalna do promienia luku
    if (i > 0 && i < points.length - 1) {
      const segDist = Math.max(1.0, points[i + 1].dist - points[i - 1].dist);
      const curveRateRad = THREE.MathUtils.degToRad(p.turnAngleDeg || 0) / segDist;
      // Inzynieria drogowa: maks 5.5% nachylenia poprzecznego szosy
      p.bankingPct = THREE.MathUtils.clamp(curveRateRad * 8.5, -0.055, 0.055);
    } else {
      p.bankingPct = 0;
    }

    // 4. Czas Ducha (jesli plik GPX nie mial znacznikow <time>, wyliczamy dokladne tempo fizyczne)
    if (i > 0) {
      const prev = points[i - 1];
      const segDist = Math.max(0.1, p.dist - prev.dist);
      const estSpeedMps = calculateRealisticGhostSpeed(p.grade);
      simGhostTime += segDist / estSpeedMps;
    }

    if (typeof p.ghostElapsedSec !== 'number' || isNaN(p.ghostElapsedSec)) {
      p.ghostElapsedSec = simGhostTime;
    }
  }

  // Wygładzenie przechyłki szosy wzdluz sasiednich punktow
  for (let i = 1; i < points.length - 1; i++) {
    points[i].bankingPct =
      (points[i - 1].bankingPct + points[i].bankingPct * 2 + points[i + 1].bankingPct) * 0.25;
  }

  return points;
}

/**
 * Automatyczny detektor podjazdow (system ClimbPro / KOM) wg standardu UCI / Tour de France
 */
export function detectClimbs(points) {
  if (!points || points.length < 5) return [];

  // The named D211 ascent remains one HC climb through the resort's short
  // recovery/flat section; the generic detector would split off a second KOM.
  if (points.routeId === 'alpedhuez') {
    const first = points[0], last = points[points.length - 1];
    const elevationGainM = last.ele - first.ele;
    const avgGradePct = elevationGainM / last.dist * 100;
    return [{ index: 1, name: 'Alpe d’Huez (HC)', category: 'HC',
      startDist: 0, endDist: last.dist, startEle: first.ele, endEle: last.ele,
      lengthM: last.dist, elevationGainM, avgGradePct,
      maxGradePct: Math.max(...points.map(p => p.grade)) }];
  }

  const climbs = [];
  let inClimb = false;
  let startIdx = 0;
  let maxGrade = 0;
  let flatToleranceDist = 0;

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const prev = points[i - 1];
    const segDist = p.dist - prev.dist;

    if (!inClimb) {
      if (p.grade >= 3.0) {
        inClimb = true;
        startIdx = Math.max(0, i - 1);
        maxGrade = p.grade;
        flatToleranceDist = 0;
      }
    } else {
      if (p.grade > maxGrade) maxGrade = p.grade;

      if (p.grade < 1.5) {
        flatToleranceDist += segDist;
      } else {
        flatToleranceDist = 0;
      }

      const isEnd = flatToleranceDist > 160 || i === points.length - 1;
      if (isEnd) {
        const endIdx = i === points.length - 1 ? i : Math.max(startIdx + 1, i - 2);
        const startPt = points[startIdx];
        const endPt = points[endIdx];
        const lengthM = endPt.dist - startPt.dist;
        const elevationGainM = endPt.ele - startPt.ele;
        const avgGradePct = lengthM > 1 ? (elevationGainM / lengthM) * 100 : 0;

        // Kwalifikujemy podjazd jesli ma min. 220m dlugosci i sr. nachylenie >= 2.8% oraz min 12m przewyzszenia
        if (lengthM >= 220 && elevationGainM >= 12 && avgGradePct >= 2.8) {
          const score = lengthM * (avgGradePct / 100) * avgGradePct;
          let category = 'Cat. 4';
          if (score > 350 || elevationGainM > 450) category = 'HC';
          else if (score > 180 || elevationGainM > 250) category = 'Cat. 1';
          else if (score > 90 || elevationGainM > 140) category = 'Cat. 2';
          else if (score > 40 || elevationGainM > 70) category = 'Cat. 3';

          climbs.push({
            index: climbs.length + 1,
            name: `Climb #${climbs.length + 1} (${category}, +${Math.round(elevationGainM)}m, ${avgGradePct.toFixed(1)}%)`,
            category,
            startDist: startPt.dist,
            endDist: endPt.dist,
            startEle: startPt.ele,
            endEle: endPt.ele,
            lengthM,
            elevationGainM,
            avgGradePct,
            maxGradePct: maxGrade,
          });
        }
        inClimb = false;
      }
    }
  }

  return climbs;
}

/**
 * Przekształca łamaną trasę GPS w autentyczne, gładkie łuki drogowe (klotoidy inżynierii drogowej).
 * Zagęszcza rzadkie punkty (np. co 4.0m) i wygładza współrzędne poziome (x, z) filtrem Gaussa,
 * eliminując ostre kanty i efekt „drogi z linijki”, przy zachowaniu prostych odcinków szosy.
 */
export function smoothRouteHorizontalArcs(
  rawPoints,
  refLat,
  refLon,
  targetStep = 4.0,
  sigmaXZ = 13.0,
  radiusXZ = 30.0
) {
  if (!rawPoints || rawPoints.length < 2) return rawPoints;

  // 1. Dystans skumulowany wzdłuż surowej łamanej
  const cumRaw = [0];
  for (let i = 1; i < rawPoints.length; i++) {
    const d = Math.hypot(rawPoints[i].x - rawPoints[i - 1].x, rawPoints[i].z - rawPoints[i - 1].z);
    cumRaw.push(cumRaw[cumRaw.length - 1] + d);
  }
  const totalRawDist = cumRaw[cumRaw.length - 1];
  if (totalRawDist < 8.0) return rawPoints;

  // 2. Zagęszczenie punktów w stałym kroku (np. 4m)
  const numSteps = Math.max(2, Math.ceil(totalRawDist / targetStep));
  const dense = [];
  let seg = 0;
  for (let i = 0; i <= numSteps; i++) {
    const s = Math.min(totalRawDist, i * targetStep);
    while (seg < rawPoints.length - 2 && cumRaw[seg + 1] < s) seg++;
    const segSpan = Math.max(0.001, cumRaw[seg + 1] - cumRaw[seg]);
    const t = Math.min(1, Math.max(0, (s - cumRaw[seg]) / segSpan));
    const p0 = rawPoints[seg];
    const p1 = rawPoints[seg + 1];

    dense.push({
      x: p0.x + (p1.x - p0.x) * t,
      y: p0.y + (p1.y - p0.y) * t,
      z: p0.z + (p1.z - p0.z) * t,
      rawEle: p0.rawEle + (p1.rawEle - p0.rawEle) * t,
      ghostElapsedSec:
        typeof p0.ghostElapsedSec === 'number' && typeof p1.ghostElapsedSec === 'number'
          ? p0.ghostElapsedSec + (p1.ghostElapsedSec - p0.ghostElapsedSec) * t
          : NaN,
      s,
    });
  }

  // 3. Poziomy filtr Gaussa dla współrzędnych (x, z)
  const arcSmoothed = dense.map((p, i) => {
    // Zachowaj dokładne punkty startu i mety
    if (i === 0 || i === dense.length - 1) return { ...p };

    let sumW = 0;
    let sumX = 0;
    let sumZ = 0;
    // Samples are ordered by distance: visit only the Gaussian support window.
    const windowSteps = Math.ceil(radiusXZ / targetStep) + 1;
    const first = Math.max(0, i - windowSteps);
    const last = Math.min(dense.length - 1, i + windowSteps);
    for (let j = first; j <= last; j++) {
      const ds = dense[j].s - p.s;
      if (Math.abs(ds) > radiusXZ) continue;
      const w = Math.exp(-(ds * ds) / (2 * sigmaXZ * sigmaXZ));
      sumW += w;
      sumX += dense[j].x * w;
      sumZ += dense[j].z * w;
    }
    return {
      x: sumW > 0 ? sumX / sumW : p.x,
      y: p.y,
      z: sumW > 0 ? sumZ / sumW : p.z,
      rawEle: p.rawEle,
      ghostElapsedSec: p.ghostElapsedSec,
      s: p.s,
    };
  });

  // 4. Przypisanie współrzędnych geograficznych lat/lon z wygładzonych x, z
  for (let i = 0; i < arcSmoothed.length; i++) {
    const { lat, lon } = metersToLatLon(arcSmoothed[i].x, arcSmoothed[i].z, refLat, refLon);
    arcSmoothed[i].lat = lat;
    arcSmoothed[i].lon = lon;
  }

  return arcSmoothed;
}

/**
 * Parsuje tekst XML pliku .GPX na tablice punktow 3D z wygladzona gausowsko wysokoscia,
 * autentycznym nachyleniem inzynieryjnym szosy (%), zakretami, przechyłkami i czasem Ducha
 */
export function parseGPXToRoute(xmlString) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlString, 'application/xml');

  let nodes = Array.from(xml.querySelectorAll('trkpt'));
  if (nodes.length < 2) nodes = Array.from(xml.querySelectorAll('rtept'));
  if (nodes.length < 2) nodes = Array.from(xml.querySelectorAll('wpt'));

  if (nodes.length < 2) {
    throw new Error('No track points (<trkpt> or <rtept>) found in the GPX file.');
  }

  const rawPoints = [];
  const refLat = parseFloat(nodes[0].getAttribute('lat'));
  const refLon = parseFloat(nodes[0].getAttribute('lon'));
  const eleNode0 = nodes[0].querySelector('ele');
  const refEle = eleNode0 ? parseFloat(eleNode0.textContent) : 0;

  const timeNode0 = nodes[0].querySelector('time');
  const refTimeMs = timeNode0 ? Date.parse(timeNode0.textContent) : NaN;
  const hasGpxTimestamps = !isNaN(refTimeMs);

  for (let i = 0; i < nodes.length; i++) {
    const lat = parseFloat(nodes[i].getAttribute('lat'));
    const lon = parseFloat(nodes[i].getAttribute('lon'));
    const eleTag = nodes[i].querySelector('ele');
    const ele = eleTag ? parseFloat(eleTag.textContent) : refEle;

    const timeTag = nodes[i].querySelector('time');
    const ptTimeMs = timeTag ? Date.parse(timeTag.textContent) : NaN;
    const ghostElapsedSec =
      hasGpxTimestamps && !isNaN(ptTimeMs) ? Math.max(0, (ptTimeMs - refTimeMs) / 1000) : NaN;

    if (isNaN(lat) || isNaN(lon)) continue;
    const { x, z } = latLonToMeters(lat, lon, refLat, refLon);
    rawPoints.push({ x, y: ele - refEle, z, rawEle: ele, lat, lon, ghostElapsedSec });
  }

  // Odrzuc punkty zbyt blisko siebie (< 3.5 m), aby uniknac ostrych zalaman siatki 3D
  const filtered = [rawPoints[0]];
  for (let i = 1; i < rawPoints.length; i++) {
    const prev = filtered[filtered.length - 1];
    const curr = rawPoints[i];
    const dist2d = Math.hypot(curr.x - prev.x, curr.z - prev.z);
    if (dist2d >= 3.5) {
      filtered.push(curr);
    }
  }

  if (filtered.length < 2) {
    throw new Error('The GPX route is too short. It needs two points at least 3.5 m apart.');
  }

  // Jesli GPX mial realne znaczniki <time>, filtrujemy postoje (np. swiatla, woda >10s) i anomalie predkosci
  if (hasGpxTimestamps && filtered.length > 2) {
    let compressedElapsed = 0;
    filtered[0].ghostElapsedSec = 0;
    for (let i = 1; i < filtered.length; i++) {
      const curr = filtered[i];
      const prev = filtered[i - 1];
      let dt = curr.ghostElapsedSec - prev.ghostElapsedSec;
      const ds = Math.hypot(curr.x - prev.x, curr.z - prev.z);

      if (isNaN(dt) || dt < 0) {
        dt = ds / calculateRealisticGhostSpeed(0);
      } else if (dt > 10.0 && ds < 4.0) {
        // Kompresujemy dlugi postoj do 2.0s plynnego toczenia, by rywal nie zamarzl na trasie
        dt = 2.0;
      } else if (ds > 1.0 && dt > 0) {
        const spd = ds / dt;
        if (spd > 28.0) {
          dt = ds / 22.0; // max 80 km/h
        }
      }
      compressedElapsed += dt;
      curr.ghostElapsedSec = compressedElapsed;
    }
  }

  // Zastosuj wygładzanie geometrii poziomej: zamień ostre załamania GPS w inżynieryjne łuki drogowe (klotoidy)
  const routePointsDense = smoothRouteHorizontalArcs(filtered, refLat, refLon, 4.0, 13.0, 30.0);

  // 1. Oblicz odleglosci wzdluz trasy
  const cumDists = [0];
  let totalDist2D = 0;
  for (let i = 1; i < routePointsDense.length; i++) {
    const d = Math.hypot(routePointsDense[i].x - routePointsDense[i - 1].x, routePointsDense[i].z - routePointsDense[i - 1].z);
    totalDist2D += d;
    cumDists.push(totalDist2D);
  }

  // 2. Wygladzanie wysokosci: filtr Gaussa oparty na rzeczywistym dystansie metrycznym
  // Okno +/- 38m z sigma = 16m usuwa skoki barometryczne GPS bez splaszczania realnych szczytow
  const smoothedY = routePointsDense.map((pt, i) => {
    const s_i = cumDists[i];
    let sumW = 0;
    let sumY = 0;
    for (let j = i; j >= 0; j--) {
      const ds = Math.abs(cumDists[j] - s_i);
      if (ds > 40) break;
      const w = Math.exp(-(ds * ds) / (2 * 16 * 16));
      sumW += w;
      sumY += routePointsDense[j].y * w;
    }
    for (let j = i + 1; j < routePointsDense.length; j++) {
      const ds = Math.abs(cumDists[j] - s_i);
      if (ds > 40) break;
      const w = Math.exp(-(ds * ds) / (2 * 16 * 16));
      sumW += w;
      sumY += routePointsDense[j].y * w;
    }
    return sumW > 0 ? sumY / sumW : pt.y;
  });

  // Pomocnicza interpolacja wygladzonej wysokosci dla dowolnego dystansu metrycznego
  function sampleSmoothedYAtDist(targetDist) {
    if (targetDist <= 0) return smoothedY[0];
    if (targetDist >= totalDist2D) return smoothedY[smoothedY.length - 1];
    let l = 0, r = cumDists.length - 1;
    while (l < r - 1) {
      const m = (l + r) >> 1;
      if (cumDists[m] <= targetDist) l = m;
      else r = m;
    }
    const span = Math.max(0.001, cumDists[r] - cumDists[l]);
    const t = (targetDist - cumDists[l]) / span;
    return THREE.MathUtils.lerp(smoothedY[l], smoothedY[r], t);
  }

  // 3. Autentyczne nachylenie inzynieryjne szosy (%) mierzone na bazie cieciwy 28m (+/- 14m)
  const baselineHalf = 14.0;
  const rawGrades = [];
  for (let i = 0; i < routePointsDense.length; i++) {
    const s = cumDists[i];
    const sBefore = Math.max(0, s - baselineHalf);
    const sAfter = Math.min(totalDist2D, s + baselineHalf);
    const chordSpan = Math.max(1.0, sAfter - sBefore);
    const yBefore = sampleSmoothedYAtDist(sBefore);
    const yAfter = sampleSmoothedYAtDist(sAfter);
    const grade = ((yAfter - yBefore) / chordSpan) * 100;
    rawGrades.push(THREE.MathUtils.clamp(grade, -22, 24));
  }

  // Ogranicznik maksymalnego skoku nachylenia w pionie (maks 0.22% na metr trasy)
  const smoothedGrades = [rawGrades[0]];
  for (let i = 1; i < rawGrades.length; i++) {
    const ds = Math.max(0.1, cumDists[i] - cumDists[i - 1]);
    const maxGradeDelta = 0.22 * ds;
    const prevG = smoothedGrades[i - 1];
    const targetG = rawGrades[i];
    const clampedG = THREE.MathUtils.clamp(targetG, prevG - maxGradeDelta, prevG + maxGradeDelta);
    smoothedGrades.push(clampedG);
  }

  const points = [];
  for (let i = 0; i < routePointsDense.length; i++) {
    const p = routePointsDense[i];
    p.y = smoothedY[i];
    p.rawEle = refEle + p.y;
    const grade = smoothedGrades[i];

    points.push({
      x: p.x,
      y: p.y,
      z: p.z,
      dist: cumDists[i],
      ele: p.rawEle,
      grade,
      lat: p.lat,
      lon: p.lon,
      ghostElapsedSec: p.ghostElapsedSec,
      hasRealGpxTime: hasGpxTimestamps && !isNaN(p.ghostElapsedSec),
    });
  }

  // Odczytaj punkty orientacyjne (Waypoints <wpt>) z pliku GPX (szczyty, bufety, punkty widokowe)
  const wptNodes = Array.from(xml.querySelectorAll('wpt'));
  const rawWaypoints = [];
  for (const wn of wptNodes) {
    const wLat = parseFloat(wn.getAttribute('lat'));
    const wLon = parseFloat(wn.getAttribute('lon'));
    const nameNode = wn.querySelector('name');
    const eleNode = wn.querySelector('ele');
    const name = nameNode ? nameNode.textContent.trim() : 'Viewpoint';
    const ele = eleNode ? parseFloat(eleNode.textContent) : 0;
    if (!isNaN(wLat) && !isNaN(wLon)) {
      const { x, z } = latLonToMeters(wLat, wLon, refLat, refLon);
      rawWaypoints.push({ name, ele, lat: wLat, lon: wLon, x, z });
    }
  }

  const enriched = enrichRoutePoints(points);

  // Przypisz waypoints do najblizszego punktu na trasie
  const waypoints = [];
  for (const wp of rawWaypoints) {
    let minDistSq = Infinity;
    let bestPt = enriched[0];
    for (const p of enriched) {
      const d2 = (p.x - wp.x) ** 2 + (p.z - wp.z) ** 2;
      if (d2 < minDistSq) {
        minDistSq = d2;
        bestPt = p;
      }
    }
    if (minDistSq < 400 * 400) {
      waypoints.push({
        name: wp.name,
        ele: wp.ele || bestPt.ele,
        dist: bestPt.dist,
        x: bestPt.x,
        y: bestPt.y,
        z: bestPt.z,
      });
    }
  }
  enriched.waypoints = waypoints;

  return enriched;
}

/**
 * Wbudowane trasy demonstracyjne (Gorska Przelecz, Krete Serpentyny, Pagorkowata Dolina, Plaska Czasowka)
 */
export function generatePresetRoute(presetName = 'mountain') {
  if (presetName === 'alpedhuez') return enrichRoutePoints(createAlpeDHuezRoute());
  const points = [];
  const targetDistM = presetName === 'switchbacks' ? 7500 : 5200;
  const stepDist = 4.0; // Gęste próbkowanie 4m zamiast 20m dla idealnie obłych łuków
  const numSteps = Math.floor(targetDistM / stepDist);
  let x = 0;
  let z = 0;
  let y = 0;
  let heading = 0;
  let totalDist = 0;
  const baseEle = (presetName === 'mountain' || presetName === 'switchbacks' ? 650 : 220);
  const refLat = 49.25;
  const refLon = 19.95;
  const headingScale = stepDist / 20.0;

  for (let i = 0; i <= numSteps; i++) {
    const t = i / numSteps;
    const curDist = i * stepDist;
    let gradePct = 0;

    if (presetName === 'mountain') {
      // Alpejska wspinaczka z serpentynami + zjazd
      heading += (Math.sin(t * 22.1) * 0.11 + Math.cos(t * 9.1) * 0.05) * headingScale;
      if (t < 0.08) gradePct = 1.2;
      else if (t < 0.52) gradePct = 6.0 + 5.0 * Math.sin((t - 0.08) * Math.PI * 3.5);
      else if (t < 0.64) gradePct = -1.5 + 2.5 * Math.cos(t * 20);
      else if (t < 0.88) gradePct = -7.0 * Math.sin(((t - 0.64) / 0.24) * Math.PI);
      else gradePct = 1.5 * Math.sin(t * 30);
    } else if (presetName === 'switchbacks') {
      // Trasa testowa z wyraznymi zakretami, znakami ostrzegawczymi i dwoma podjazdami KOM
      heading += (Math.sin(t * 45.0) * 0.145 + Math.cos(t * 15.0) * 0.06) * headingScale;
      if (t < 0.38) gradePct = 5.5 + 5.5 * Math.sin(t * Math.PI * 5);
      else if (t < 0.58) gradePct = -5.5 * Math.sin(((t - 0.38) / 0.2) * Math.PI);
      else if (t < 0.85) gradePct = 7.2 + 4.2 * Math.cos((t - 0.58) * Math.PI * 4);
      else gradePct = -3.0;
    } else if (presetName === 'rolling') {
      // Interwalowe pagorki (od -5% do +6%)
      heading += Math.sin(t * 13.0) * 0.07 * headingScale;
      gradePct = 5.5 * Math.sin(t * Math.PI * 8);
    } else {
      // Szybka plaska trasa czasowa (TT)
      heading += Math.sin(t * 7.8) * 0.04 * headingScale;
      gradePct = 0.8 * Math.sin(t * Math.PI * 4);
    }

    if (i > 0) {
      x += Math.sin(heading) * stepDist;
      z -= Math.cos(heading) * stepDist;
      y += (gradePct / 100) * stepDist;
      totalDist += stepDist;
    }

    const { lat, lon } = metersToLatLon(x, z, refLat, refLon);
    points.push({
      x,
      y,
      z,
      dist: totalDist,
      ele: baseEle + y,
      rawEle: baseEle + y,
      grade: gradePct,
      lat,
      lon,
      ghostElapsedSec: NaN,
      hasRealGpxTime: false,
    });
  }

  // Przepuść przez wygładzanie łuków (zamiana łamanej w łuki)
  const smoothed = smoothRouteHorizontalArcs(points, refLat, refLon, 4.0, 12.0, 28.0);
  for (let i = 0; i < smoothed.length; i++) {
    smoothed[i].dist = i === 0 ? 0 : smoothed[i - 1].dist + Math.hypot(smoothed[i].x - smoothed[i - 1].x, smoothed[i].z - smoothed[i - 1].z);
    smoothed[i].ele = baseEle + smoothed[i].y;
    smoothed[i].grade = points[Math.min(points.length - 1, i)].grade;
  }

  return enrichRoutePoints(smoothed);
}
