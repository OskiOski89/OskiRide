import * as THREE from 'three';
import { convexHull, createSceneryPlacement } from './sceneryPlacement.js';
import { createSpectator, updateSpectatorVisibility, SPECTATOR_DESIGNS } from './spectatorCrowd.js';
import { batchStaticScenery, disposeRouteResources } from './sceneResources.js';
import { createAlpeDHuezTerrain, createAlpeHorizonRidges } from './alpeDHuezTerrain.js';
import { createAlpeDetailKit } from './alpeRouteDetails.js';
import { createRouteDetailKit, createRouteMasonryMaterial, createWornRoadMap, addRouteRoadDetails } from './routeDetails.js';
import { createRouteArchKit } from './routeArches.js';
import { createRoadsideKit, populateRoadsideLife } from './roadsideLife.js';
import { populateLandscapeFeatures } from './landscapeFeatures.js';

// Reserve the entire animated envelope before the asynchronous GLB arrives.
const spectatorEnvelope = new THREE.BoxGeometry(2.5, 3.0, 1.3);
spectatorEnvelope.translate(0, 1.5, 0);
const spectatorEnvelopeMaterial = new THREE.MeshBasicMaterial();

const placementByGroup = new WeakMap();
const placementBySamples = new WeakMap();

function addRoadsideObject(target, object, kind, commit = true) {
  object.updateWorldMatrix(true, true);
  const parts = [];
  object.traverse((mesh) => {
    if (!mesh.isMesh && !mesh.userData.sweptRadius) return;
    if (mesh.isMesh && !mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const radius = mesh.userData.sweptRadius;
    const box = radius ? new THREE.Box3(new THREE.Vector3(-radius, -radius, -radius), new THREE.Vector3(radius, radius, radius)) : mesh.geometry.boundingBox;
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      corners.push(new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld));
    }
    parts.push({
      polygon: convexHull(corners),
      minX: Math.min(...corners.map(p => p.x)), maxX: Math.max(...corners.map(p => p.x)),
      minY: Math.min(...corners.map(p => p.y)), maxY: Math.max(...corners.map(p => p.y)) + (kind === 'spectator' ? 0.28 : 0),
      minZ: Math.min(...corners.map(p => p.z)), maxZ: Math.max(...corners.map(p => p.z)),
    });
  });
  if (!placementByGroup.get(target).reserve(parts, kind, commit, object.userData.routeSpan)) return false;
  if (!commit) return true;
  object.userData.sceneryKind = kind;
  target.add(object);
  return true;
}

let cachedRoadTextures = null;
let cachedTerrainTextures = null;
let cachedWaterRippleTex = null;

/**
 * Generuje proceduralna mape fal wodnych (bumpMap + roughnessMap) dla jezior alpejskich i potokow
 */
function getWaterRippleTexture() {
  if (cachedWaterRippleTex) return cachedWaterRippleTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(256, 256);
  const data = img.data;
  const tau = Math.PI * 2;
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const u = x / 256;
      const v = y / 256;
      const w1 = Math.sin((u * 6 + v * 4) * tau);
      const w2 = Math.cos((u * 9 - v * 7) * tau) * 0.65;
      const w3 = Math.sin((u * 14 + v * 12) * tau) * 0.35;
      const val = Math.round(128 + (w1 + w2 + w3) * 38);
      const idx = (y * 256 + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  cachedWaterRippleTex = tex;
  return cachedWaterRippleTex;
}

/**
 * Generuje proceduralna teksture trawy alpejskiej i lupkow skalnych na nasypie przydroznym (map + bumpMap)
 */
function getTerrainTextures() {
  if (cachedTerrainTextures) return cachedTerrainTextures;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Neutralna baza (ok. #dcdcdc), dzieki czemu mnozenie przez vertexColors zachowuje barwy łąki i skał
  ctx.fillStyle = '#d8ded6';
  ctx.fillRect(0, 0, 512, 512);

  // Organiczne kobierce mchu i ciemniejszej darni
  for (let i = 0; i < 420; i++) {
    const cx = (i * 97) % 512;
    const cy = (i * 163) % 512;
    const rx = 8 + (i % 16);
    const ry = 6 + ((i * 7) % 14);
    const shade = i % 3 === 0 ? 'rgba(175, 190, 170, 0.36)' : i % 3 === 1 ? 'rgba(235, 242, 228, 0.28)' : 'rgba(155, 168, 152, 0.32)';
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, (i * 0.4) % Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Drobne źdźbła trawy i ziarnistość skalna
  for (let i = 0; i < 9500; i++) {
    const x = (i * 73 + (i % 19) * 13) % 512;
    const y = (i * 139 + (i % 23) * 7) % 512;
    const v = 175 + ((i * 31) % 68);
    ctx.fillStyle = `rgb(${v},${Math.min(255, v + 5)},${v - 4})`;
    ctx.fillRect(x, y, 2, 3);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;

  cachedTerrainTextures = { map, bumpMap: map };
  return cachedTerrainTextures;
}

/**
 * Generuje proceduralna teksture asfaltu (z pasami bocznymi i ziarnem) oraz mape chropowatosci (bumpMap)
 */
function getRoadTextures() {
  if (cachedRoadTextures) return cachedRoadTextures;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#2d333f';
  ctx.fillRect(0, 0, 512, 512);

  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, '#374151');
  grad.addColorStop(0.08, '#282e38');
  grad.addColorStop(0.28, '#222730');
  grad.addColorStop(0.5, '#2f3642');
  grad.addColorStop(0.72, '#222730');
  grad.addColorStop(0.92, '#282e38');
  grad.addColorStop(1, '#374151');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Drobne kruszywo mineralne asfaltu (bazalt + jasny kwarc)
  for (let i = 0; i < 12000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 28 + Math.floor(Math.random() * 44);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    ctx.fillRect(x, y, i % 4 === 0 ? 1.5 : 2, 2);
  }

  // Subtelna podłużna spoina bitumiczna na środku jezdni
  ctx.fillStyle = 'rgba(24, 28, 36, 0.55)';
  ctx.fillRect(254, 0, 4, 512);

  // Biale pasy krawedziowe szosy
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(18, 0, 10, 512);
  ctx.fillRect(484, 0, 10, 512);

  // Pobocze zwirowe z kamykami
  ctx.fillStyle = '#475569';
  ctx.fillRect(0, 0, 14, 512);
  ctx.fillRect(498, 0, 14, 512);
  for (let i = 0; i < 650; i++) {
    const sideX = i % 2 === 0 ? (i * 11) % 13 : 498 + ((i * 11) % 13);
    const py = (i * 47) % 512;
    const pv = 60 + (i % 55);
    ctx.fillStyle = `rgb(${pv},${pv + 2},${pv})`;
    ctx.fillRect(sideX, py, 2, 2);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;

  // Mapa szorstkości PBR (roughnessMap): wyjeżdżone koleiny mają subtelny połysk pod słońce, pobocze pozostaje matowe
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 256;
  roughCanvas.height = 256;
  const rCtx = roughCanvas.getContext('2d');
  const rGrad = rCtx.createLinearGradient(0, 0, 256, 0);
  rGrad.addColorStop(0, '#f0f0f0');
  rGrad.addColorStop(0.08, '#cccccc');
  rGrad.addColorStop(0.28, '#8c8c8c');
  rGrad.addColorStop(0.5, '#b8b8b8');
  rGrad.addColorStop(0.72, '#8c8c8c');
  rGrad.addColorStop(0.92, '#cccccc');
  rGrad.addColorStop(1, '#f0f0f0');
  rCtx.fillStyle = rGrad;
  rCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const rx = (i * 73) % 256;
    const ry = (i * 137) % 256;
    const rv = 135 + (i % 75);
    rCtx.fillStyle = `rgb(${rv},${rv},${rv})`;
    rCtx.fillRect(rx, ry, 2, 2);
  }
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = 4;

  cachedRoadTextures = { map, bumpMap: map, roughnessMap };
  return cachedRoadTextures;
}

/**
 * Dokladna wysokosc pobocza i zbocza gory w odleglosci poprzecznej `signedOffset` od osi szosy.
 * - Do 10.0m od srodka drogi: lagodny trawiasty taras (na ktorym stoja drzewa, skaly i domki).
 * - Poza tarasem (do krawedzi podstawy): zbocze gory schodzi AZ DO DNA DOLINY (`minRouteY - 14m`),
 *   dzieki czemu zadna czesc podjazdu NIGDY nie wisi w powietrzu jak wstega na niebie!
 */
function getEmbankmentY(roadY, signedOffset, roadWidth, minRouteY = 0, sideBank = 0) {
  const halfRoad = roadWidth * 0.5;
  const absOff = Math.abs(signedOffset);
  if (absOff <= halfRoad) {
    return roadY + sideBank - 0.04;
  }
  const distFromEdge = absOff - halfRoad;
  const terraceWidth = 6.4; // halfRoad (3.6) + 6.4 = 10.0m
  if (distFromEdge <= terraceWidth) {
    const bankFade = Math.max(0, 1 - distFromEdge / terraceWidth);
    return roadY + sideBank * bankFade - 0.04 - distFromEdge * 0.1;
  }
  // Poza tarasem: lite zbocze gory schodzace az do podstawy doliny (`minRouteY - 14.0m`)
  return Math.min(roadY - 28.0, minRouteY - 14.0);
}

/**
 * Generuje swiat 3D z dynamicznym oknem widocznosci wzdluz dystansu trasy (`updateVisibleWindow`),
 * dzieki czemu zapetlajace sie trasy GPX, serpentyny i powroty ta sama gora NIGDY nie nakladaja sie na siebie
 * ani nie wisza w powietrzu!
 */
export function buildRouteWorld(
  scene,
  points,
  prevRouteGroup,
  { climbs = [], quality = 'medium', waypoints = [] } = {}
) {
  if (prevRouteGroup) {
    const retained = new Set([
      ...(cachedRoadTextures ? Object.values(cachedRoadTextures) : []),
      ...(cachedTerrainTextures ? Object.values(cachedTerrainTextures) : []),
      ...(cachedWaterRippleTex ? [cachedWaterRippleTex] : []),
    ]);
    disposeRouteResources(prevRouteGroup, retained);
    scene.remove(prevRouteGroup);
  }

  const routeGroup = new THREE.Group();
  scene.add(routeGroup);

  const animatedObjects = {
    balloons: [],
    spectators: [],
    streetLights: [],
    windTurbines: [],
    boats: [],
  };
  routeGroup.userData.disposeSpectators = () => {
    for (const fan of animatedObjects.spectators) fan.dispose();
  };

  const totalDistanceM = points[points.length - 1].dist;
  const curveVectors = points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  const routeCurve = new THREE.CatmullRomCurve3(curveVectors, false, 'centripetal', 0.5);
  routeCurve.arcLengthDivisions = Math.max(2500, points.length * 3);
  routeCurve.updateArcLengths();

  const roadWidth = 7.2;
  const isAlpeDHuez = points.routeId === 'alpedhuez';
  const alpeTerrain = isAlpeDHuez ? createAlpeDHuezTerrain(routeGroup, points) : null;
  const halfRoad = roadWidth * 0.5;
  // Geometria jezdni i poboczy zachowuje tę samą dokładność we wszystkich jakościach.
  // Zbyt rzadkie próbki na bliskich nawrotach GPX wpuszczały trawę na asfalt.
  // Presety zmieniają cienie i scenerię, bez zmiany korytarza jazdy na nawrotach.
  const stepMeters = 3.0;
  const maxSamples = 7000;
  const sampleCount = Math.min(Math.max(Math.floor(totalDistanceM / stepMeters), 240), maxSamples);

  const up = new THREE.Vector3(0, 1, 0);

  let minRouteY = Infinity;
  for (const p of points) {
    if (p.y < minRouteY) minRouteY = p.y;
  }

  // Krok 1: Wyznacz wygladzone probki szosy (chroni przed ostrymi zalamaniami siatki na nawrotach GPX)
  const roadSamples = [];
  const smoothedRight = new THREE.Vector3(1, 0, 0);

  for (let i = 0; i <= sampleCount; i++) {
    const u = i / sampleCount;
    const distM = u * totalDistanceM;
    const pt = routeCurve.getPointAt(u);

    const du = Math.min(0.0025, 4.0 / Math.max(100, totalDistanceM));
    const pPrev = routeCurve.getPointAt(Math.max(0, u - du));
    const pNext = routeCurve.getPointAt(Math.min(1, u + du));
    const tangent = pNext.clone().sub(pPrev).normalize();

    const horizTan = new THREE.Vector3(tangent.x, 0, tangent.z);
    if (horizTan.lengthSq() < 0.0001) horizTan.set(0, 0, -1);
    else horizTan.normalize();

    const rawRight = new THREE.Vector3().crossVectors(horizTan, up).normalize();
    if (i === 0) smoothedRight.copy(rawRight);
    else smoothedRight.lerp(rawRight, 0.28).normalize();

    roadSamples.push({
      idx: i,
      u,
      distM,
      x: pt.x,
      y: pt.y,
      z: pt.z,
      pt,
      tangent,
      rawRight: rawRight.clone(),
      smoothedRight: smoothedRight.clone(),
      macroRight: rawRight.clone(),
    });
  }

  // Dwukierunkowe wygladzenie wektora `macroRight` (okno +/- 28 probek) dla szerokiego zbocza (+/- 36m),
  // dzieki czemu dalekie zbocze nigdy nie zagina sie na ostrych lukach i nie tworzy kanciastego muru
  const macroWindow = 28;
  for (let i = 0; i <= sampleCount; i++) {
    const sumVec = new THREE.Vector3();
    const kMin = Math.max(0, i - macroWindow);
    const kMax = Math.min(sampleCount, i + macroWindow);
    for (let k = kMin; k <= kMax; k++) {
      sumVec.add(roadSamples[k].rawRight);
    }
    if (sumVec.lengthSq() > 0.0001) {
      roadSamples[i].macroRight.copy(sumVec.normalize());
    }
  }

  // Wygładzenie wektora bocznego roadEdgeRight (okno +/- 2 próbki) dla idealnie obłych krawędzi asfaltu
  for (let i = 0; i <= sampleCount; i++) {
    const sum = new THREE.Vector3();
    for (let k = -2; k <= 2; k++) {
      const idx = THREE.MathUtils.clamp(i + k, 0, sampleCount);
      sum.add(roadSamples[idx].rawRight);
    }
    roadSamples[i].roadEdgeRight = sum.normalize();
  }

  // Wyznaczenie przechyłki szosy w zakrętach (Superelevation / Banking)
  for (let i = 0; i <= sampleCount; i++) {
    const prevIdx = Math.max(0, i - 2);
    const nextIdx = Math.min(sampleCount, i + 2);
    const t1 = roadSamples[prevIdx].tangent;
    const t2 = roadSamples[nextIdx].tangent;
    const a1 = Math.atan2(t1.x, -t1.z);
    const a2 = Math.atan2(t2.x, -t2.z);
    let diff = a2 - a1;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const segDist = Math.max(1.0, roadSamples[nextIdx].distM - roadSamples[prevIdx].distM);
    const curvature = diff / segDist;
    // Standard inżynierii drogowej: nachylenie poprzeczne łuku szosy do 5.5% (ok. 3.2 stopnia)
    roadSamples[i].rawBanking = THREE.MathUtils.clamp(curvature * 8.5, -0.055, 0.055);
  }

  for (let i = 0; i <= sampleCount; i++) {
    let sum = 0;
    let count = 0;
    for (let k = -3; k <= 3; k++) {
      const idx = THREE.MathUtils.clamp(i + k, 0, sampleCount);
      sum += roadSamples[idx].rawBanking;
      count++;
    }
    const banking = sum / count;
    roadSamples[i].banking = banking;
    roadSamples[i].bankHeight = banking * halfRoad;
  }

  // Krok 2: Siatka asfaltu (2 wierzcholki na krok = 6 indeksow na segment)
  // oraz zamknieta siatka szerokiego zbocza pod szosa (6 wierzcholkow na krok = 30 indeksow na segment)
  const roadPositions = [];
  const roadUVs = [];
  const roadIndices = [];

  const lateralOffsets = [
    -36.0,
    -10.0,
    -roadWidth * 0.5,
    roadWidth * 0.5,
    10.0,
    36.0,
  ];
  const terrainPositions = [];
  const terrainColors = [];
  const terrainUVs = [];
  const terrainIndices = [];

  const dashPositions = [];
  const dashColors = [];

  let accumDist = 0;

  for (let i = 0; i <= sampleCount; i++) {
    const s = roadSamples[i];
    const { pt, rawRight, roadEdgeRight, smoothedRight: sRight, macroRight, bankHeight = 0 } = s;
    if (i > 0) accumDist += pt.distanceTo(roadSamples[i - 1].pt);

    // Krawędzie szosy z uwzględnieniem wygładzonego wektora bocznego i przechyłki (Superelevation)
    const edgeRight = roadEdgeRight || rawRight;
    const leftEdge = pt.clone().addScaledVector(edgeRight, -halfRoad);
    leftEdge.y += 0.05 + bankHeight;

    const rightEdge = pt.clone().addScaledVector(edgeRight, halfRoad);
    rightEdge.y += 0.05 - bankHeight;

    roadPositions.push(leftEdge.x, leftEdge.y, leftEdge.z);
    roadPositions.push(rightEdge.x, rightEdge.y, rightEdge.z);

    const vCoord = accumDist / 8.0;
    roadUVs.push(0, vCoord, 1, vCoord);

    for (let c = 0; c < 6; c++) {
      let latOff = lateralOffsets[c];
      const heightAboveValley = Math.max(0, pt.y - minRouteY);

      let useVec;
      if (c === 2 || c === 3) {
        // Wierzcholki bezposrednio na krawedziach jezdni (-halfRoad i +halfRoad)
        // MUSZA miec identyczny wektor edgeRight co asfalt, by wyeliminowac poszarpane trojkaty i zabki
        useVec = edgeRight;
      } else if (c === 1 || c === 4) {
        // Trawiasty taras przydrozny (-10m i +10m) — idealnie rownolegly do korytarza szosy
        useVec = edgeRight;
      } else {
        // Podstawa masywu gorskiego schodzaca do doliny (c = 0 lub c = 5)
        const sign = c === 0 ? -1 : 1;
        const rawCurv = Math.abs(s.banking || 0) / 8.5;
        const turnRadius = rawCurv > 0.005 ? 1.0 / rawCurv : 999;
        const isInnerTurn = sign * (s.banking || 0) > 0;
        const maxInnerWidth = isInnerTurn
          ? Math.min(36.0, Math.max(12.0, turnRadius * 0.75))
          : isAlpeDHuez ? 36.0 : 36.0 + heightAboveValley * 0.65;
        latOff = sign * maxInnerWidth;

        // Bezpieczny wektor podstawy: zblizony do edgeRight, nie moze zaginac sie wstecz na lukach
        const baseVec = new THREE.Vector3().copy(edgeRight).lerp(macroRight, 0.6).normalize();
        useVec = baseVec.dot(edgeRight) > 0.65 ? baseVec : edgeRight;
      }

      const rp = pt.clone().addScaledVector(useVec, latOff);
      const sideBank = latOff < 0 ? bankHeight : -bankHeight;
      rp.y = getEmbankmentY(pt.y, latOff, roadWidth, minRouteY, sideBank);
      if (alpeTerrain && (c === 0 || c === 5)) rp.y = alpeTerrain.heightAt(rp.x, rp.z) - 0.08;

      terrainPositions.push(rp.x, rp.y, rp.z);
      terrainUVs.push(c * 1.4, accumDist / 12.0);

      let col;
      if (c === 2 || c === 3) {
        col = [0.27, 0.54, 0.21]; // Zielone pobocze przy szosie
      } else if (c === 1 || c === 4) {
        col = heightAboveValley > 45 ? [0.28, 0.46, 0.22] : [0.22, 0.48, 0.18]; // Trawiasty taras pod drzewami
      } else {
        col = [0.19, 0.39, 0.20]; // Podstawa masywu gorskiego wtapiajaca sie w dno doliny
      }
      if (isAlpeDHuez) {
        const high = THREE.MathUtils.clamp((pt.y - 800) / 500, 0, 1);
        col = new THREE.Color(0x537144).lerp(new THREE.Color(0x96917b), high).toArray();
      }
      terrainColors.push(...col);
    }

    if (i < sampleCount) {
      const base = i * 2;
      roadIndices.push(base, base + 1, base + 2);
      roadIndices.push(base + 1, base + 3, base + 2);

      const tBase = i * 6;
      // 5 pelnych pasow trojkatow na nasypie — w tym pas c=2 bezposrednio pod asfaltem (5 * 6 = 30 indeksow na kazdy krok `i`)
      for (const c of [0, 1, 2, 3, 4]) {
        terrainIndices.push(tBase + c, tBase + c + 1, tBase + c + 6);
        terrainIndices.push(tBase + c + 1, tBase + c + 7, tBase + c + 6);
      }

      // Przerywana linia srodkowa (6 wierzcholkow na kazdy krok `i` -> parzyste widoczne, nieparzyste zdegenerowane, by indeksowanie bylo 1:1 z `i`!)
      if (i % 2 === 0) {
        const nextU = Math.min((i + 0.62) / sampleCount, 1);
        const pt2 = routeCurve.getPointAt(nextU);
        const l1 = pt.clone().addScaledVector(rawRight, -0.075);
        const r1 = pt.clone().addScaledVector(rawRight, 0.075);
        const l2 = pt2.clone().addScaledVector(rawRight, -0.075);
        const r2 = pt2.clone().addScaledVector(rawRight, 0.075);

        const approxGrade = ((pt2.y - pt.y) / Math.max(0.1, pt.distanceTo(pt2))) * 100;
        const lineCol = isAlpeDHuez ? [0.92, 0.93, 0.91] :
          approxGrade >= 8.5
            ? [0.98, 0.32, 0.15]
            : approxGrade >= 5.0
            ? [0.98, 0.75, 0.18]
            : [0.97, 0.98, 0.99];

        dashPositions.push(
          l1.x, l1.y + 0.08, l1.z,
          r1.x, r1.y + 0.08, r1.z,
          l2.x, l2.y + 0.08, l2.z,
          r1.x, r1.y + 0.08, r1.z,
          r2.x, r2.y + 0.08, r2.z,
          l2.x, l2.y + 0.08, l2.z
        );
        for (let k = 0; k < 6; k++) dashColors.push(...lineCol);
      } else {
        for (let k = 0; k < 6; k++) {
          dashPositions.push(pt.x, pt.y, pt.z);
          dashColors.push(0, 0, 0);
        }
      }
    }
  }

  // 1. Siatka asfaltu
  const roadTextures = getRoadTextures();
  const roadMap = createWornRoadMap(roadTextures.map);
  const roadBump = roadTextures.bumpMap;
  const roadRoughness = roadTextures.roughnessMap;
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUVs, 2));
  roadGeo.setIndex(roadIndices);
  roadGeo.computeVertexNormals();

  const roadMesh = new THREE.Mesh(
    roadGeo,
    new THREE.MeshStandardMaterial({
      map: roadMap,
      bumpMap: roadBump,
      bumpScale: 0.015,
      roughnessMap: roadRoughness,
      roughness: 0.82,
      metalness: 0.09,
      envMapIntensity: 0.85,
      side: THREE.DoubleSide,
    })
  );
  roadMesh.receiveShadow = quality !== 'eco';
  routeGroup.userData.roadMaterial = roadMesh.material;
  routeGroup.userData.waterRippleTex = getWaterRippleTexture();
  routeGroup.add(roadMesh);

  // 2. Siatka nasypu / zbocza pod szosa (z organiczna tekstura trawy alpejskiej i lupkow skalnych)
  const terrainTextures = getTerrainTextures();
  const terrainGeo = new THREE.BufferGeometry();
  terrainGeo.setAttribute('position', new THREE.Float32BufferAttribute(terrainPositions, 3));
  terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3));
  terrainGeo.setAttribute('uv', new THREE.Float32BufferAttribute(terrainUVs, 2));
  terrainGeo.setIndex(terrainIndices);
  terrainGeo.computeVertexNormals();

  const terrainMesh = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshStandardMaterial({
      map: terrainTextures.map,
      bumpMap: terrainTextures.bumpMap,
      bumpScale: 0.04,
      vertexColors: true,
      roughness: 0.88,
      flatShading: true,
      side: THREE.DoubleSide,
    })
  );
  terrainMesh.receiveShadow = quality !== 'eco';
  routeGroup.add(terrainMesh);

  // 3. Pas srodkowy jezdni
  const dashGeo = new THREE.BufferGeometry();
  dashGeo.setAttribute('position', new THREE.Float32BufferAttribute(dashPositions, 3));
  dashGeo.setAttribute('color', new THREE.Float32BufferAttribute(dashColors, 3));
  routeGroup.add(
    new THREE.Mesh(
      dashGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
    )
  );

  // 4. Daleka panorama 3D osniezonych szczytow + zielone dno doliny podazajace za wysokoscia odcinka
  const { groundPlane } = createDistantAlpinePanorama(routeGroup, points);

  // 5. Podzial scenerii (drzew, skal, latarni, domkow, bram KOM) na sektory dystansowe (Chunks co 200m),
  // aby wyswietlac TYLKO otoczenie aktualnego odcinka trasy przed kolarzem (brak nakladania sie petli i serpentyn!)
  const chunkLengthM = 200;
  const placement = createSceneryPlacement(roadSamples, roadWidth);
  placementBySamples.set(roadSamples, placement);
  const numChunks = Math.max(1, Math.ceil(totalDistanceM / chunkLengthM));
  const sceneryChunks = Array.from({ length: numChunks }, (_, idx) => {
    const grp = new THREE.Group();
    grp.userData.minDistM = idx * chunkLengthM;
    grp.userData.maxDistM = (idx + 1) * chunkLengthM;
    placementByGroup.set(grp, placement);
    routeGroup.add(grp);
    return grp;
  });

  const getChunkForDist = (distM) => {
    const cIdx = THREE.MathUtils.clamp(
      Math.floor(distM / chunkLengthM),
      0,
      sceneryChunks.length - 1
    );
    return sceneryChunks[cIdx];
  };

  const sceneryData = populateChunkedScenery(
    routeGroup,
    getChunkForDist,
    routeCurve,
    roadSamples,
    points,
    totalDistanceM,
    roadWidth,
    climbs,
    quality,
    animatedObjects,
    waypoints.length > 0 ? waypoints : points.waypoints || []
  );
  const tunnelIntervals = sceneryData?.tunnelIntervals || [];
  const landscapeResources = { geometries: new Set(), materials: new Set() };
  routeGroup.userData.landscapeResources = landscapeResources;
  routeGroup.userData.landscapeFeatures = populateLandscapeFeatures({
    terrain: terrainMesh, samples: roadSamples, points, roadWidth, totalDistanceM,
    isInsideTunnel: d => tunnelIntervals.some(t => d >= t.startDist - 14 && d <= t.endDist + 14),
    add: addRoadsideObject, getChunk: getChunkForDist, resources: landscapeResources,
    waterRippleTex: routeGroup.userData.waterRippleTex,
  });
  alpeTerrain?.populateForest(getChunkForDist, quality);
  routeGroup.userData.batchingStats = batchStaticScenery(sceneryChunks);
  // Decorative parents can be culled without rebuilding road geometry or moving props.
  const decorativeKinds=new Set(['tree','rock','chalet','lamp','turbine','spectator','balloon','boat','tent','verge-detail','village-detail','roadside-life','landscape-feature']);
  const decorativeGroups=sceneryChunks.map(chunk=>{
    const decorations=new THREE.Group();decorations.name='AdaptiveDecorations';
    for(const child of [...chunk.children])if(decorativeKinds.has(child.userData.sceneryKind))decorations.add(child);
    chunk.add(decorations);return decorations;
  });

  // 6. Mobilny portal tunelu gorskiego na koncu widocznego horyzontu szosy (`horizonTunnelGroup`),
  // dzieki czemu w oddali szosa ZAWSZE wchodzi w kamienny portal tunelu i nigdy nie urywa sie w pustce!
  const horizonTunnelGroup = createHorizonTunnelMountain(roadWidth);
  routeGroup.add(horizonTunnelGroup);

  /**
   * Aktualizuje okno widocznosci drogi i scenerii wokół aktualnego dystansu kolarza `currentDistM`.
   */
  let lastWindowKey = '';
  let sceneryDetail=0,lastDistanceM=0;
  routeGroup.userData.sceneryDetail=0;
  routeGroup.userData.setSceneryDetail=level=>{
    sceneryDetail=THREE.MathUtils.clamp(Math.round(level),0,2);
    routeGroup.userData.sceneryDetail=sceneryDetail;lastWindowKey='';updateVisibleWindow(lastDistanceM);
  };
  function updateVisibleWindow(currentDistM) {
    lastDistanceM=currentDistM;
    const behindM = 220;
    const aheadM = 2200;
    const minDist = Math.max(0, currentDistM - behindM);
    const maxDist = Math.min(totalDistanceM, currentDistM + aheadM);

    const curStep = Math.min(
      sampleCount,
      Math.max(0, Math.floor((currentDistM / totalDistanceM) * sampleCount))
    );
    const startStep = Math.max(0, Math.floor((minDist / totalDistanceM) * sampleCount));
    let endStep = Math.min(sampleCount, Math.ceil((maxDist / totalDistanceM) * sampleCount));
    const windowKey = `${curStep}:${startStep}:${endStep}:${Math.floor(minDist / chunkLengthM)}`;
    if (windowKey === lastWindowKey) return;
    lastWindowKey = windowKey;

    // Sprawdz czy dalsza czesc petli GPX nie wraca fizycznie na aktualny odcinek pod kolami kolarza
    const nearEnd = Math.min(sampleCount, curStep + 40);
    const checkStart = curStep + 120;
    outerLoop: for (let k = checkStart; k <= endStep; k += 2) {
      const fk = roadSamples[k];
      for (let n = curStep; n <= nearEnd; n += 3) {
        const fn = roadSamples[n];
        const d2 = (fk.x - fn.x) ** 2 + (fk.z - fn.z) ** 2;
        if (d2 < 14.0 * 14.0 && Math.abs(fk.y - fn.y) < 7) {
          endStep = Math.min(endStep, Math.max(curStep + 1, k - 10));
          break outerLoop;
        }
      }
    }

    const stepSpan = Math.max(0, endStep - startStep);
    const actualMaxDist = (endStep / sampleCount) * totalDistanceM;

    // 1. Zakres rysowania asfaltu (6 indeksow na krok)
    roadGeo.setDrawRange(startStep * 6, stepSpan * 6);
    // 2. Zakres rysowania nasypu terenu (30 indeksow na krok — 5 pelnych pasow)
    terrainGeo.setDrawRange(startStep * 30, stepSpan * 30);
    // 3. Zakres rysowania pasow ruchu (6 wierzcholkow na krok)
    dashGeo.setDrawRange(startStep * 6, stepSpan * 6);

    // 4. Ustaw kamienny portal tunelu dokladnie na koncu wyrenderowanego odcinka (`endStep`)
    if (!isAlpeDHuez && endStep < sampleCount - 4 && roadSamples[endStep]) {
      const endSample = roadSamples[endStep];
      horizonTunnelGroup.visible = true;
      horizonTunnelGroup.position.copy(endSample.pt);
      horizonTunnelGroup.lookAt(endSample.pt.x+endSample.tangent.x,endSample.pt.y,endSample.pt.z+endSample.tangent.z);
    } else {
      horizonTunnelGroup.visible = false;
    }

    // 5. Dno doliny (`groundPlane`) zakotwiczone u podstawy trasy
    if (groundPlane) {
      groundPlane.position.y = minRouteY - 14.0;
    }

    // 6. Widocznosc sektorow scenerii dokladnie w zakresie wyrenderowanej szosy
    for (let i = 0; i < sceneryChunks.length; i++) {
      const ch = sceneryChunks[i];
      ch.visible = ch.userData.maxDistM >= minDist && ch.userData.minDistM <= actualMaxDist;
      decorativeGroups[i].visible=sceneryDetail===0||(
        ch.userData.maxDistM>=currentDistM-(sceneryDetail===1?150:100)&&
        ch.userData.minDistM<=currentDistM+(sceneryDetail===1?1200:600));
    }
    updateSpectatorVisibility(animatedObjects.spectators, currentDistM, quality);
  }

  // Inicjalne ustawienie okna na start trasy (0 m)
  updateVisibleWindow(0);

  routeGroup.userData.placementStats = placement.stats;
  return { routeGroup, routeCurve, totalDistanceM, animatedObjects, updateVisibleWindow, tunnelIntervals };
}

/**
 * Tworzy daleki pierscien wysokich, osniezonych szczytow alpejskich 3D oraz chmury
 */
function createDistantAlpinePanorama(routeGroup, points) {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const routeRadius = Math.max(Math.hypot(maxX - minX, maxZ - minZ) * 0.58, 900);

  // Teksturowane alpejskie dno doliny (laki + ciemniejsze kobierce lasu), zeby dolina pod zakretami wygladala naturalnie
  const meadowCanvas = document.createElement('canvas');
  meadowCanvas.width = 256;
  meadowCanvas.height = 256;
  const mCtx = meadowCanvas.getContext('2d');
  mCtx.fillStyle = '#244f26';
  mCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 180; i++) {
    mCtx.fillStyle = i % 2 === 0 ? 'rgba(46, 98, 40, 0.35)' : 'rgba(24, 62, 28, 0.35)';
    mCtx.beginPath();
    mCtx.arc((i * 73) % 256, (i * 139) % 256, 12 + (i % 18), 0, Math.PI * 2);
    mCtx.fill();
  }
  const meadowTex = new THREE.CanvasTexture(meadowCanvas);
  meadowTex.wrapS = THREE.RepeatWrapping;
  meadowTex.wrapT = THREE.RepeatWrapping;
  meadowTex.repeat.set(95, 95);

  const groundPlane = new THREE.Mesh(
    new THREE.CircleGeometry(routeRadius + 2200, 48),
    new THREE.MeshStandardMaterial({ map: meadowTex, roughness: 0.95 })
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.set(cx, minY - 22.0, cz);
  routeGroup.add(groundPlane);

  if (points.routeId === 'alpedhuez') {
    createAlpeHorizonRidges(routeGroup, cx, cz, routeRadius);
  } else {
  const peakGeo = new THREE.ConeGeometry(240, 480, 14, 7);
  const posAttr = peakGeo.attributes.position;
  const colors = [];
  for (let i = 0; i < posAttr.count; i++) {
    let vx = posAttr.getX(i);
    let vy = posAttr.getY(i);
    let vz = posAttr.getZ(i);
    const hNorm = THREE.MathUtils.clamp((vy + 240) / 480, 0, 1);
    const rad = Math.hypot(vx, vz);
    const theta = Math.atan2(vz, vx);

    // Rzeźbione granie skalne (arêtes) i wklęsłe żleby śnieżne (couloirs)
    const ridgeWave =
      Math.cos(theta * 4.0) * 0.17 +
      Math.sin(theta * 7.0 + 1.15) * 0.1 +
      Math.cos(theta * 11.0 - hNorm * 3.8) * 0.055;
    if (rad > 0.5 && hNorm < 0.97) {
      const radialScale = 1.0 + ridgeWave * (1.0 - hNorm * 0.45);
      vx *= radialScale;
      vz *= radialScale;
      vy += Math.sin(theta * 5.0 + hNorm * 6.0) * 12.0 * (1.0 - hNorm) * hNorm;
      posAttr.setXYZ(i, vx, vy, vz);
    }

    // Linia śniegu schodzi niżej w zacienionych żlebach (gdy ridgeWave < 0), wyżej na skalnych graniach
    const snowThreshold = 28 + ridgeWave * 95;
    const rockThreshold = -55 + ridgeWave * 65;
    if (vy > snowThreshold) {
      const glint = 0.92 + Math.max(0, ridgeWave) * 0.07;
      colors.push(glint, glint + 0.02, Math.min(1.0, glint + 0.05));
    } else if (vy > rockThreshold) {
      const rockMix = THREE.MathUtils.clamp((vy - rockThreshold) / Math.max(1, snowThreshold - rockThreshold), 0, 1);
      const rCol = 0.42 + rockMix * 0.18;
      colors.push(rCol, rCol + 0.04, rCol + 0.1);
    } else {
      colors.push(0.22, 0.36, 0.27);
    }
  }
  peakGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  peakGeo.computeVertexNormals();

  const peakMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.05,
    flatShading: true,
  });

  const peakCount = 28;
  const peakInst = new THREE.InstancedMesh(peakGeo, peakMat, peakCount);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < peakCount; i++) {
    const angle = (i / peakCount) * Math.PI * 2;
    const radius = routeRadius + 520 + (i % 3) * 180;
    const px = cx + Math.cos(angle) * radius;
    const pz = cz + Math.sin(angle) * radius;
    const scaleY = 0.75 + (i % 5) * 0.24;
    const scaleXZ = 0.95 + (i % 4) * 0.28;

    dummy.position.set(px, minY + 140 * scaleY, pz);
    dummy.rotation.set(0, i * 1.1, 0);
    dummy.scale.set(scaleXZ, scaleY, scaleXZ);
    dummy.updateMatrix();
    peakInst.setMatrixAt(i, dummy.matrix);
  }
  routeGroup.add(peakInst);
  }

  // Puszyste, biale chmury 3D zlozone z wielu miekkich obloczkow (wysoko ponad najwyzszym punktem trasy!)
  const cloudMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    emissive: 0xdbeafe,
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.92,
  });
  routeGroup.userData.cloudMat = cloudMat;
  const puffGeo = new THREE.SphereGeometry(14, 10, 10);

  for (let i = 0; i < 18; i++) {
    const cloudGroup = new THREE.Group();
    const puffs = [
      { x: 0, y: 4, z: 0, sx: 1.5, sy: 0.95, sz: 1.2 },
      { x: -14, y: 0, z: 2, sx: 1.15, sy: 0.75, sz: 1.0 },
      { x: 14, y: 1, z: -2, sx: 1.2, sy: 0.8, sz: 1.05 },
      { x: -6, y: 2, z: 9, sx: 1.0, sy: 0.7, sz: 0.9 },
      { x: 7, y: -1, z: -8, sx: 1.05, sy: 0.68, sz: 0.95 },
    ];
    for (const pf of puffs) {
      const m = new THREE.Mesh(puffGeo, cloudMat);
      m.position.set(pf.x, pf.y, pf.z);
      m.scale.set(pf.sx, pf.sy, pf.sz);
      cloudGroup.add(m);
    }

    const angle = (i / 18) * Math.PI * 2 + (i % 3) * 0.25;
    const rad = routeRadius * 0.4 + (i % 5) * 210;
    cloudGroup.position.set(
      cx + Math.cos(angle) * rad,
      maxY + 125 + (i % 4) * 32,
      cz + Math.sin(angle) * rad
    );
    cloudGroup.rotation.y = i * 0.8;
    const cScale = 1.1 + (i % 3) * 0.35;
    cloudGroup.scale.setScalar(cScale);
    routeGroup.add(cloudGroup);
  }

  return { groundPlane };
}

/**
 * Weryfikuje czy dany punkt 3D znajduje sie w bezpiecznej odleglosci od DOWOLNEGO fragmentu szosy.
 * Chroni przed pojawianiem sie drzew, skal czy domkow bezposrednio na jezdni w rejonie serpentyn,
 * petli alpejskich oraz wewnetrznych lukow ostrych zakretow.
 */
function isPositionClearOfRoad(pos, itemRadius, roadSamples, minHeightDiff = 7.0) {
  return placementBySamples.get(roadSamples).isPointClear(pos, itemRadius, minHeightDiff);
}

/**
 * Rozmieszcza drzewa 3-pietrowe, skaly, slupki, domki, latarnie i bramy KOM wewnatrz sektorow `sceneryChunks`.
 * Kazdy obiekt uzywa `getEmbankmentY`, wiec stoi idealnie na nasypie aktualnego odcinka drogi!
 */
function populateChunkedScenery(
  routeGroup,
  getChunkForDist,
  routeCurve,
  roadSamples,
  points,
  totalDistanceM,
  roadWidth,
  climbs,
  quality,
  animatedObjects,
  waypoints = []
) {
  const isAlpeDHuez = points.routeId === 'alpedhuez';
  const elevationRange = points.reduce((bounds, p) => [Math.min(bounds[0], p.y), Math.max(bounds[1], p.y)], [Infinity, -Infinity]);
  const alpineScenery = isAlpeDHuez || elevationRange[1] - elevationRange[0] >= 80;
  const routeDetails = isAlpeDHuez ? createAlpeDetailKit(quality) : createRouteDetailKit(quality, alpineScenery);
  routeGroup.userData.windowGlassMat = routeDetails.windowGlassMat || null;
  routeGroup.userData.chimneySmokeMat = routeDetails.smokeMat || null;
  routeGroup.userData.chimneySmokes = routeDetails.chimneySmokes || [];
  animatedObjects.chimneySmokes = routeDetails.chimneySmokes || [];
  const archKit = createRouteArchKit(roadWidth);
  const roadsideKit = createRoadsideKit();
  routeGroup.userData.roadsideKit = roadsideKit;
  const villageAnchors = [];
  const densityDivisor = quality === 'eco' ? 26 : quality === 'ultra' ? 12 : 16;
  const maxItems = quality === 'eco' ? 500 : quality === 'ultra' ? 1600 : 1000;
  const numItems = Math.min(Math.floor(totalDistanceM / densityDivisor), maxItems);

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.36, 3.4, 7, 2);
  {
    const tPos = trunkGeo.attributes.position;
    const tColors = [];
    for (let k = 0; k < tPos.count; k++) {
      let vx = tPos.getX(k);
      const vy = tPos.getY(k);
      let vz = tPos.getZ(k);
      const hNorm = THREE.MathUtils.clamp((vy + 1.7) / 3.4, 0, 1);
      // Lekkie rozszerzenie korzeni u podstawy pnia
      if (hNorm < 0.25) {
        const theta = Math.atan2(vz, vx);
        const rootFlare = 1.0 + Math.max(0, Math.cos(theta * 5.0)) * 0.14 * (1.0 - hNorm * 4.0);
        vx *= rootFlare;
        vz *= rootFlare;
        tPos.setXYZ(k, vx, vy, vz);
      }
      const shade = 0.55 + hNorm * 0.45;
      tColors.push(0.38 * shade, 0.26 * shade, 0.19 * shade);
    }
    trunkGeo.setAttribute('color', new THREE.Float32BufferAttribute(tColors, 3));
    trunkGeo.translate(0, 0.7, 0); // Pień wchodzi 1.0m w głąb nasypu
    trunkGeo.computeVertexNormals();
  }
  const trunkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });

  function createSculptedPineTierGeometry(baseRadius, height, yOffset, lobeCount, darkHex, midHex, tipHex) {
    const geo = new THREE.ConeGeometry(baseRadius, height, 9, 2);
    const pos = geo.attributes.position;
    const colors = [];
    const cDark = new THREE.Color(darkHex);
    const cMid = new THREE.Color(midHex);
    const cTip = new THREE.Color(tipHex);
    const tmpCol = new THREE.Color();

    for (let k = 0; k < pos.count; k++) {
      let vx = pos.getX(k);
      let vy = pos.getY(k);
      let vz = pos.getZ(k);
      const hNorm = THREE.MathUtils.clamp((vy + height * 0.5) / height, 0, 1);
      const rad = Math.hypot(vx, vz);
      const theta = Math.atan2(vz, vx);
      const boughWave = Math.cos(theta * lobeCount) * 0.12 + Math.sin(theta * (lobeCount * 2.0) + 0.7) * 0.04;

      if (rad > 0.02 && hNorm < 0.96) {
        // Wklęsły profil gałęzi świerku z falistymi wypustkami na końcach (mieszczący się w obrysie baseRadius)
        const concave = Math.pow(1.0 - hNorm * 0.12, 1.15);
        const radialScale = THREE.MathUtils.clamp((0.86 + boughWave * (1.0 - hNorm * 0.6)) * concave, 0.72, 0.995);
        vx *= radialScale;
        vz *= radialScale;
        vy -= Math.max(0, boughWave) * 0.24 * (1.0 - hNorm);
        pos.setXYZ(k, vx, vy, vz);
      }

      // Cieniowanie wierzchołkowe: głębokie wnętrze pod okapem gałęzi -> soczysta zieleń -> słoneczne końcówki igieł
      const tipLight = THREE.MathUtils.clamp(hNorm * 0.55 + Math.max(0, boughWave) * 3.2 + (rad > 0.02 ? 0.22 : -0.25), 0, 1);
      if (tipLight < 0.45) {
        tmpCol.copy(cDark).lerp(cMid, tipLight / 0.45);
      } else {
        tmpCol.copy(cMid).lerp(cTip, (tipLight - 0.45) / 0.55);
      }
      colors.push(tmpCol.r, tmpCol.g, tmpCol.b);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.translate(0, yOffset, 0);
    geo.computeVertexNormals();
    return geo;
  }

  const tier1Geo = createSculptedPineTierGeometry(1.85, 2.65, 2.5, 5, 0x0b2e19, 0x14532d, 0x228b46);
  const tier2Geo = createSculptedPineTierGeometry(1.45, 2.35, 3.9, 5, 0x0f3920, 0x15803d, 0x34a853);
  const tier3Geo = createSculptedPineTierGeometry(0.98, 1.95, 5.1, 5, 0x134626, 0x16a34a, 0x4ade80);

  const pineMatDark = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    flatShading: true,
  });
  const pineMatMid = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    flatShading: true,
  });
  const pineMatLight = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    flatShading: true,
  });

  // Rzeźbione, spękane głazy granitowe 3D z cieniowaniem mchu i porostów alpejskich na górnych półkach
  const rockGeo = new THREE.IcosahedronGeometry(1.68, 1);
  {
    const rPos = rockGeo.attributes.position;
    for (let k = 0; k < rPos.count; k++) {
      let vx = rPos.getX(k);
      let vy = rPos.getY(k);
      let vz = rPos.getZ(k);
      const len = Math.hypot(vx, vy, vz) || 1;
      const nx = vx / len;
      const ny = vy / len;
      const nz = vz / len;
      const crag =
        Math.sin(nx * 3.8 + nz * 2.4) * 0.11 +
        Math.cos(ny * 4.6 - nx * 3.1) * 0.08 +
        Math.sin((nx - nz) * 5.4) * 0.04;
      const scaleR = THREE.MathUtils.clamp(0.84 + crag, 0.68, 0.99);
      vx *= scaleR;
      vz *= scaleR;
      vy = (vy < 0 ? vy * 0.76 : vy * 0.94) * scaleR;
      rPos.setXYZ(k, vx, vy, vz);
    }
    rockGeo.computeVertexNormals();
    const rNorm = rockGeo.attributes.normal;
    const rColors = [];
    const cBase = new THREE.Color(0x334155);
    const cGranite = new THREE.Color(0x64748b);
    const cLightRock = new THREE.Color(0x94a3b8);
    const cMoss = new THREE.Color(0x4d7c4f);
    const tmpCol = new THREE.Color();

    for (let k = 0; k < rPos.count; k++) {
      const vy = rPos.getY(k);
      const ny = rNorm.getY(k);
      const nx = rNorm.getX(k);
      if (vy < -0.45) {
        tmpCol.copy(cBase);
      } else if (ny > 0.48 && vy > -0.1) {
        const mossMix = THREE.MathUtils.clamp((ny - 0.48) * 2.1 + Math.sin(nx * 4.0) * 0.15, 0, 0.82);
        tmpCol.copy(cLightRock).lerp(cMoss, mossMix);
      } else {
        const heightLight = THREE.MathUtils.clamp((vy + 0.8) / 2.2, 0, 1);
        tmpCol.copy(cGranite).lerp(cLightRock, heightLight * 0.65);
      }
      rColors.push(tmpCol.r, tmpCol.g, tmpCol.b);
    }
    rockGeo.setAttribute('color', new THREE.Float32BufferAttribute(rColors, 3));
  }
  const rockMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.06,
    flatShading: true,
  });

  const postGeo = new THREE.BoxGeometry(0.14, 1.05, 0.14);
  const postMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });

  const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 5.0, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 });
  const bulbGeo = new THREE.SphereGeometry(0.22, 8, 8);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  const haloGeo = new THREE.SphereGeometry(0.62, 10, 10);
  const lampHaloMat = new THREE.MeshBasicMaterial({
    color: 0xfde047,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  routeGroup.userData.lampHaloMat = lampHaloMat;

  // Wyznacz odcinki przelotowych tuneli skalnych 3D (omijajace start, mete i szczyty KOM)
  const tunnelIntervals = [];
  if (!isAlpeDHuez && totalDistanceM >= 2200) {
    const candidateFractions = totalDistanceM > 9000 ? [0.18, 0.44, 0.74] : [0.22, 0.68];
    for (const frac of candidateFractions) {
      const startD = Math.round(totalDistanceM * frac);
      const lenD = 96;
      const endD = startD + lenD;
      const hitsKom = climbs.some(
        (c) => Math.abs(c.startDist - startD) < 130 || Math.abs(c.endDist - startD) < 130
      );
      if (!hitsKom && startD > 280 && endD < totalDistanceM - 280) {
        const placed = createRideThroughMountainTunnel(
          getChunkForDist,
          routeCurve,
          totalDistanceM,
          startD,
          lenD,
          roadWidth
        );
        if (placed) tunnelIntervals.push({ startDist: startD, endDist: endD });
      }
    }
  }

  const isInsideTunnel = (d) =>
    tunnelIntervals.some((t) => d >= t.startDist - 14 && d <= t.endDist + 14);
  const fanPlacement = { getChunkForDist, isInsideTunnel, quality };

  if (isAlpeDHuez) {
    for (const bend of points.bends) {
      createAlpeRouteSign(getChunkForDist(bend.dist), routeCurve, bend.dist - 22,
        totalDistanceM, roadWidth, `VIRAGE ${bend.number}`, `${Math.round(bend.ele)} m`, bend.number);
    }
    for (const landmark of points.landmarks) {
      createAlpeRouteSign(getChunkForDist(landmark.dist - 70), routeCurve, landmark.dist - 70,
        totalDistanceM, roadWidth, landmark.name, `${Math.round(landmark.ele)} m`);
      if (landmark.kind === 'church') {
        createAlpeChurch(getChunkForDist(landmark.dist + 25), routeCurve,
          (landmark.dist + 25) / totalDistanceM, roadWidth);
        createFanZone(getChunkForDist(landmark.dist - 100), routeCurve,
          (landmark.dist - 100) / totalDistanceM, totalDistanceM, roadWidth, animatedObjects, { ...fanPlacement, theme: 'orange' });
        createRoadPaintDecal(getChunkForDist(landmark.dist - 45), routeCurve,
          (landmark.dist - 45) / totalDistanceM, 'ALLEZ!', '#ef8b23');
      }
    }
  }

  // Reserve route landmarks before optional roadside scenery.
  // Bramy START, KM, KOM + Napisy na asfalcie + Kibice 3D (w odpowiednich sektorach!)
  createBannerArch(getChunkForDist(totalDistanceM * 0.002), routeCurve, 0.002, archKit,
    { type: 'start', title: 'START', subtitle: 'Route start' });

  // 1. Kamienie milowe / slupki kilometrowe (KM 1, KM 2...) co 1000m na poboczu szosy
  for (let d = 1000; d < totalDistanceM - 200; d += 1000) {
    if (!isInsideTunnel(d)) {
      const kmNum = Math.round(d / 1000);
      const climb = climbs.find(c => d >= c.startDist && d < c.endDist);
      const sample = roadSamples[Math.min(roadSamples.length - 1, Math.round(d / totalDistanceM * (roadSamples.length - 1)))];
      const next = roadSamples[Math.min(roadSamples.length - 1, Math.round(Math.min(d + 1000, climb?.endDist ?? totalDistanceM) / totalDistanceM * (roadSamples.length - 1)))];
      const elevationOffset = points[0].ele - points[0].y;
      createMilestonePost(getChunkForDist(d), routeCurve, d / totalDistanceM, kmNum, roadWidth,
        climb ? { remainingKm: (climb.endDist - d) / 1000, elevation: sample.y + elevationOffset,
          grade: (next.y - sample.y) / Math.max(1, next.distM - sample.distM) * 100 } : null);
    }
  }

  // 2. Punkty orientacyjne z pliku GPX (<wpt>)
  if (waypoints && waypoints.length > 0) {
    for (const wp of waypoints) {
      if (!isInsideTunnel(wp.dist) && wp.dist > 60 && wp.dist < totalDistanceM - 60) {
        createBannerArch(
          getChunkForDist(wp.dist),
          routeCurve,
          wp.dist / totalDistanceM,
          archKit,
          { type: 'waypoint', title: wp.name, subtitle: `${Math.round(wp.ele)} m above sea level` }
        );
      }
    }
  }

  for (const c of climbs) {
    createBannerArch(
      getChunkForDist(c.startDist),
      routeCurve,
      c.startDist / totalDistanceM,
      archKit,
      { type: 'climb', title: `Climb #${c.index}`,
        subtitle: `Climb start · average ${c.avgGradePct.toFixed(1)}%` }
    );
    createBannerArch(
      getChunkForDist(c.endDist),
      routeCurve,
      c.endDist / totalDistanceM,
      archKit,
      { type: 'kom', title: `KOM #${c.index}`,
        subtitle: `Category ${c.category.replace(/^Cat\.\s*/, '')} · ${Math.round(c.endEle)} m above sea level` }
    );

    const slogans = [
      { text: 'OSKIRIDE! 🚴', color: '#facc15' },
      { text: 'ALLEZ! ALLEZ!', color: 'rgba(255, 255, 255, 0.92)' },
      { text: `👑 KOM #${c.index} 👑`, color: '#ec4899' },
      { text: '1 KM TO SUMMIT', color: '#facc15' },
      { text: 'DAJESZ!', color: '#22c55e' },
    ];
    for (let s = 0; s < slogans.length; s++) {
      const paintDist = c.endDist - 35 - s * 45;
      if (paintDist > c.startDist) {
        createRoadPaintDecal(
          getChunkForDist(paintDist),
          routeCurve,
          paintDist / totalDistanceM,
          slogans[s].text,
          slogans[s].color
        );
      }
    }

    createFanZone(
      getChunkForDist(c.endDist),
      routeCurve,
      c.endDist / totalDistanceM,
      totalDistanceM,
      roadWidth,
      animatedObjects,
      fanPlacement
    );
  }

  createBannerArch(
    getChunkForDist(totalDistanceM * 0.995),
    routeCurve,
    0.995,
    archKit,
    { type: 'finish', title: 'FINISH', subtitle: 'Route end' }
  );
  createFanZone(
    getChunkForDist(totalDistanceM - 20),
    routeCurve,
    0.992,
    totalDistanceM,
    roadWidth,
    animatedObjects,
    fanPlacement
  );

  // Detailed houses share one kit; tall resort buildings stay on Alpe d'Huez.
  if (isAlpeDHuez) createAlpeResortBuildings(getChunkForDist, routeCurve, totalDistanceM, roadWidth, routeDetails);
  // Light plaster and stone keep shaded facades readable on every route.
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xded3bd, roughness: 0.9 });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xb6ac98, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: alpineScenery ? 0x687079 : 0x9d5945, roughness: 0.7 });
  wallMat.name = isAlpeDHuez ? 'AlpeFacadePlaster' : 'RouteFacadePlaster';
  baseMat.name = isAlpeDHuez ? 'AlpeFacadeStone' : 'RouteFacadeStone';
  roofMat.name = isAlpeDHuez ? 'AlpeRoofSlate' : alpineScenery ? 'RouteRoofSlate' : 'RouteRoofTile';

  const numHouses = Math.min(Math.floor(totalDistanceM / 420), 24);
  for (let i = 1; i <= numHouses; i++) {
    const sampleIdx = Math.min(
      roadSamples.length - 1,
      Math.floor(((i - 0.3) / (numHouses + 1)) * roadSamples.length)
    );
    const s = roadSamples[sampleIdx];
    if (isInsideTunnel(s.distM)) continue;
    if (isAlpeDHuez && !points.landmarks.some(w => w.kind !== 'church' && Math.abs(w.dist - s.distM) < (w.kind === 'resort' ? 1600 : 360))) continue;
    const side = i % 2 === 0 ? 1 : -1;
    const signedOff = side * (roadWidth * 0.5 + 4.8);
    const edgeRight = s.roadEdgeRight || s.rawRight;
    let housePos = s.pt.clone().addScaledVector(edgeRight, signedOff);
    housePos.y = getEmbankmentY(s.pt.y, signedOff, roadWidth);

    let houseClear = isPositionClearOfRoad(housePos, 4.2, roadSamples);
    if (!houseClear) {
      const altOff = -signedOff;
      const altPos = s.pt.clone().addScaledVector(edgeRight, altOff);
      altPos.y = getEmbankmentY(s.pt.y, altOff, roadWidth);
      if (isPositionClearOfRoad(altPos, 4.2, roadSamples)) {
        housePos = altPos;
        houseClear = true;
      }
    }
    if (!houseClear) continue;

    housePos.y = getEmbankmentY(s.pt.y, signedOff, roadWidth);

    const chalet = new THREE.Group();
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(5.8, 3.2, 5.0), baseMat);
    foundation.position.y = -1.4;
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.6, 3.6, 4.8), wallMat);
    body.position.y = 1.8;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.4, 4), roofMat);
    roof.position.y = 4.8;
    roof.rotation.y = Math.PI / 4;
    chalet.add(foundation, body, roof);
    routeDetails.decorateHouse(chalet, i);
    chalet.position.copy(housePos);
    chalet.lookAt(s.pt.x, housePos.y, s.pt.z);
    if (addRoadsideObject(getChunkForDist(s.distM), chalet, 'chalet')) {
      const lateral = housePos.clone().sub(s.pt).dot(edgeRight);
      villageAnchors.push({ distanceM: s.distM, side: Math.sign(lateral) || side });
    }
  }

  // Balony na ogrzane powietrze (wysoko nad dolina)
  if (!isAlpeDHuez) createHotAirBalloons(routeGroup, routeCurve, totalDistanceM, animatedObjects);

  // One guardrail system serves curves and cliffs; two systems overlapped here.

  // Kamienne mury oporowe wzdluz stromych podjazdow
  createStoneRetainingWalls(
    getChunkForDist,
    roadSamples,
    points,
    totalDistanceM,
    roadWidth,
    isInsideTunnel
  );

  // Turbiny wiatrowe 3D z obracajacymi sie smiglami na grzbietach
  if (!isAlpeDHuez) createWindTurbines(
    getChunkForDist,
    roadSamples,
    totalDistanceM,
    roadWidth,
    isInsideTunnel,
    animatedObjects
  );

  // Alpejskie jeziora z drewnianym pomostem i zaglowkami 3D
  if (!isAlpeDHuez) createAlpineLakes(
    getChunkForDist,
    roadSamples,
    points,
    totalDistanceM,
    roadWidth,
    isInsideTunnel,
    animatedObjects
  );

  // Strefy Bufetu (Feed Zones) z namiotami ekip, stolami i podajacymi bidony
  if (!isAlpeDHuez) createFeedZones(
    getChunkForDist,
    routeCurve,
    totalDistanceM,
    roadWidth,
    isInsideTunnel,
    animatedObjects,
    fanPlacement,
    archKit
  );

  // Drewniane plotki pasterskie, zlote bele siana i drewniane wiaty widokowe
  if (!isAlpeDHuez) createRusticFencesAndOverlooks(
    getChunkForDist,
    roadSamples,
    totalDistanceM,
    roadWidth,
    isInsideTunnel
  );

  // Znaki ostrzegawcze przed ostrymi zakretami (w odpowiednich sektorach!) — podwojne szewrony alpejskie
  let lastSignDist = -200;
  for (let i = 2; i < points.length - 2; i++) {
    const p = points[i];
    if (Math.abs(p.turnAngleDeg || 0) >= 34 && p.dist - lastSignDist > 100) {
      lastSignDist = p.dist;
      // Znak 1: ostrzezenie przed zakretem (28m przed szczytem luku)
      const signDist1 = Math.max(5, p.dist - 28);
      const u1 = THREE.MathUtils.clamp(signDist1 / totalDistanceM, 0, 1);
      createTurnWarningSign(getChunkForDist(signDist1), routeCurve, u1, p.turnAngleDeg > 0, roadWidth, isAlpeDHuez);
      // Znak 2: szewron wejsciowy bezposrednio przy luku (6m przed)
      const signDist2 = Math.max(8, p.dist - 6);
      const u2 = THREE.MathUtils.clamp(signDist2 / totalDistanceM, 0, 1);
      createTurnWarningSign(getChunkForDist(signDist2), routeCurve, u2, p.turnAngleDeg > 0, roadWidth, isAlpeDHuez);
    }
  }

  // Grand Tour: Malowane kreda napisy kibicow na stromych sciankach (grade >= 8.5%)
  let lastSteepDecalDist = -120;
  const steepDecals = [
    { text: 'ALLEZ! ⚡', color: '#facc15' }, // Tour yellow
    { text: 'HOP! HOP! HOP!', color: 'rgba(255, 255, 255, 0.92)' }, // chalk white
    { text: 'OUT OF THE SADDLE', color: '#f43f5e' }, // Giro pink
    { text: 'BRAWO! 🚴', color: '#38bdf8' }, // Sky blue
    { text: 'ATTAQUE! 💥', color: '#facc15' },
    { text: 'SPRINT', color: '#fb923c' },
  ];
  let steepDecalIdx = 0;
  for (let i = 2; i < points.length - 2; i++) {
    const p = points[i];
    if (p.grade >= 8.5 && p.dist - lastSteepDecalDist > 65 && !isInsideTunnel(p.dist)) {
      lastSteepDecalDist = p.dist;
      const dItem = steepDecals[steepDecalIdx % steepDecals.length];
      steepDecalIdx++;
      createRoadPaintDecal(
        getChunkForDist(p.dist),
        routeCurve,
        p.dist / totalDistanceM,
        dItem.text,
        dItem.color
      );
    }
  }

  // Alpejskie barierki ochronne wzdłuż urwisk i ostrych łuków
  let minRouteY = points[0].y;
  for (const p of points) {
    if (p.y < minRouteY) minRouteY = p.y;
  }
  createAlpineGuardrails(getChunkForDist, roadSamples, roadSamples.length - 1, minRouteY, roadWidth, isInsideTunnel, isAlpeDHuez);

  {
    const roadDetails = addRouteRoadDetails(getChunkForDist, roadSamples, totalDistanceM, quality,
      { isInsideTunnel, urbanDistances: isAlpeDHuez ? null : villageAnchors.map(a => a.distanceM) });
    routeGroup.userData.routeRoadDetails = roadDetails;
    if (isAlpeDHuez) routeGroup.userData.alpeRoadDetails = roadDetails;
    const detailsStats = { villages: 0, flags: 0, verges: 0 };
    const place = (object, distanceM, offset, kind) => {
      if (distanceM < 60 || distanceM > totalDistanceM - 60 || isInsideTunnel(distanceM)) return false;
      const u = THREE.MathUtils.clamp(distanceM / totalDistanceM, 0, 1);
      const pt = routeCurve.getPointAt(u), tangent = routeCurve.getTangentAt(u);
      const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      object.position.copy(pt).addScaledVector(right, offset);
      object.position.y = getEmbankmentY(pt.y, offset, roadWidth);
      object.lookAt(pt.x, object.position.y, pt.z);
      return addRoadsideObject(getChunkForDist(distanceM), object, kind);
    };
    for (const landmark of points.landmarks || []) {
      if (landmark.kind !== 'church') {
        for (const shift of [-160, 110]) for (const side of [1, -1]) {
          if (place(routeDetails.villagePocket(landmark.name), landmark.dist + shift, side * 7.1, 'village-detail')) detailsStats.villages++;
        }
      } else {
        for (const shift of [-140, -90, -40, 10]) for (const side of [-1, 1]) {
          if (isAlpeDHuez && place(routeDetails.flag(shift === -90 || shift === 10), landmark.dist + shift, side * 8.2, 'dutch-flag')) detailsStats.flags++;
        }
      }
    }
    if (!isAlpeDHuez) for (let i = 0; i < villageAnchors.length; i += 3) {
      const anchor = villageAnchors[i];
      const title = alpineScenery ? 'Miejsce odpoczynku' : 'Cyclist rest stop';
      for (const shift of [85, -85, 125, -125]) {
        if (place(routeDetails.villagePocket(title), anchor.distanceM + shift, anchor.side * 7.1, 'village-detail')) {
          detailsStats.villages++; break;
        }
      }
    }
    const spacing = quality === 'eco' ? 190 : quality === 'ultra' ? 85 : 125;
    let index = 0;
    for (let d = 120; d < totalDistanceM - 120; d += spacing) {
      if (place(routeDetails.shrub(index), d, (index % 2 ? -1 : 1) * 8.5, 'verge-detail')) detailsStats.verges++;
      index++;
    }
    routeGroup.userData.routeDetailStats = { ...detailsStats, houses: villageAnchors.length, alpineScenery };
    if (isAlpeDHuez) routeGroup.userData.alpeDetailStats = detailsStats;
  }

  routeGroup.userData.roadsideLife = populateRoadsideLife({
    samples: roadSamples, points, totalDistanceM, roadWidth, quality,
    anchors: villageAnchors, climbs, isInsideTunnel, getGroundY: getEmbankmentY,
    add: addRoadsideObject, getChunk: getChunkForDist, kit: roadsideKit,
  });

  // Fill free space after landmarks and road infrastructure reserve their footprints.
  for (let i = 0; i < numItems; i++) {
    const sampleIdx = Math.min(
      roadSamples.length - 1,
      Math.floor(((i + 0.5) / numItems) * roadSamples.length)
    );
    const s = roadSamples[sampleIdx];
    const { pt, smoothedRight: sRight, rawRight, distM } = s;
    if (isInsideTunnel(distM)) continue;
    const chunk = getChunkForDist(distM);

    const side = i % 2 === 0 ? 1 : -1;
    // Drzewa i skały w bezpiecznym pasie 6.3m - 7.7m od osi drogi (na nasypie, nigdy na asfalcie!)
    const offset = roadWidth * 0.5 + 2.7 + (i % 3) * 0.7;
    const signedOffset = side * offset;

    // Kluczowe: używamy wektora rawRight (prostopadłego do drogi w tym punkcie), a NIE opóźnionego smoothedRight!
    let itemPos = pt.clone().addScaledVector(rawRight, signedOffset);
    itemPos.y = getEmbankmentY(pt.y, signedOffset, roadWidth);

    const elevation = points[0].ele + pt.y;
    const isRock = i % 5 === 0 || (isAlpeDHuez && elevation > 1600 && i % 3 !== 0);
    const itemRadius = isRock ? 2.0 : 2.5;

    // Pełna weryfikacja kolizji z CAŁĄ siecią szosy (w tym serpentynami i pętlami)
    let clear = isPositionClearOfRoad(itemPos, itemRadius, roadSamples);
    if (!clear) {
      // Spróbuj umieścić po przeciwnej stronie szosy
      const altOffset = -signedOffset;
      const altPos = pt.clone().addScaledVector(rawRight, altOffset);
      altPos.y = getEmbankmentY(pt.y, altOffset, roadWidth);
      if (isPositionClearOfRoad(altPos, itemRadius, roadSamples)) {
        itemPos = altPos;
        clear = true;
      }
    }
    if (!clear) continue; // Jeśli po obu stronach szosa koliduje, bezpiecznie pomiń ten obiekt!

    if (isRock) {
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.copy(itemPos);
      rock.position.y += 0.25;
      rock.rotation.set(i * 0.3, i, 0);
      rock.scale.set(1.0 + (i % 3) * 0.45, 0.75 + (i % 2) * 0.35, 1.1);
      addRoadsideObject(chunk, rock, 'rock');
    } else {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      const t1 = new THREE.Mesh(tier1Geo, pineMatDark);
      const t2 = new THREE.Mesh(tier2Geo, pineMatMid);
      const t3 = new THREE.Mesh(tier3Geo, pineMatLight);
      if (quality !== 'eco') {
        t1.castShadow = true;
        t2.castShadow = true;
      }
      tree.add(trunk, t1, t2, t3);
      const scale = 0.72 + (i % 5) * 0.18;
      tree.scale.setScalar(scale);
      tree.position.copy(itemPos);
      tree.rotation.y = (i * 1.7) % (Math.PI * 2);
      addRoadsideObject(chunk, tree, 'tree');
    }

    // Slupki kilometrowe tuz przy krawedzi jezdni
    if (i % 3 === 0) {
      const postPos = pt.clone().addScaledVector(rawRight, side * (roadWidth * 0.5 + 0.42));
      postPos.y = pt.y + 0.35;
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.copy(postPos);
      addRoadsideObject(chunk, post, 'post');
    }

    // Latarnie drogowe co 6 elementow (z miekka poswiata atmosferyczna wieczorem i w nocy)
    if (i % 6 === 0 && (!isAlpeDHuez || elevation > 1720)) {
      const lampPos = pt.clone().addScaledVector(rawRight, -side * (roadWidth * 0.5 + 0.75));
      lampPos.y = pt.y;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(lampPos.x, lampPos.y + 2.2, lampPos.z);
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(lampPos.x, lampPos.y + 4.75, lampPos.z);
      const halo = new THREE.Mesh(haloGeo, lampHaloMat);
      halo.position.set(lampPos.x, lampPos.y + 4.75, lampPos.z);
      const lamp = new THREE.Group();
      lamp.add(pole, bulb, halo);
      addRoadsideObject(chunk, lamp, 'lamp');
    }
  }

  return { tunnelIntervals };
}

/**
 * Tworzy kolorowe balony na ogrzane powietrze unoszace sie nad trasa
 */
function createHotAirBalloons(routeGroup, routeCurve, totalDistanceM, animatedObjects) {
  const colors = [0xf97316, 0x06b6d4, 0xec4899, 0x22c55e, 0xeab308];
  const basketMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < 6; i++) {
    const u = (i + 0.6) / 6.5;
    const pt = routeCurve.getPointAt(u);
    const tangent = routeCurve.getTangentAt(u).normalize();
    const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const side = i % 2 === 0 ? 1 : -1;

    const balloonGroup = new THREE.Group();
    const envGeo = new THREE.SphereGeometry(7.5, 16, 14);
    envGeo.scale(1, 1.28, 1);
    const envMat = new THREE.MeshStandardMaterial({
      color: colors[i % colors.length],
      roughness: 0.5,
      emissive: colors[i % colors.length],
      emissiveIntensity: 0.12,
    });
    const envelope = new THREE.Mesh(envGeo, envMat);
    envelope.position.y = 11;

    const basket = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 2.2), basketMat);
    basket.position.y = 0;

    balloonGroup.add(envelope, basket);

    const pos = pt.clone().addScaledVector(right, side * (45 + (i % 3) * 25));
    pos.y += 45 + (i % 3) * 14;
    balloonGroup.position.copy(pos);

    routeGroup.add(balloonGroup);
    animatedObjects.balloons.push({ group: balloonGroup, baseY: pos.y, phase: i * 1.3 });
  }
}

/**
 * Malowane kreda napisy kibicow na asfalcie w stylu Grand Tour (Tour de France / Giro)
 */
function createRoadPaintDecal(targetGroup, routeCurve, u, text, color = 'rgba(255, 255, 255, 0.9)') {
  const clampedU = THREE.MathUtils.clamp(u, 0.005, 0.995);
  const pt = routeCurve.getPointAt(clampedU);
  const tangent = routeCurve.getTangentAt(clampedU).normalize();

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);

  // Styl kredy drogowej: delikatny cien dla kontrastu na asfalcie + intensywny kolor napisow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = color;
  ctx.font = 'italic 900 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64);

  const tex = new THREE.CanvasTexture(canvas);
  const planeGeo = new THREE.PlaneGeometry(5.6, 1.4);
  planeGeo.rotateX(-Math.PI / 2);
  const planeMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(planeGeo, planeMat);
  mesh.position.copy(pt);
  mesh.position.y += 0.08;
  const look = pt.clone().add(tangent);
  mesh.lookAt(look.x, mesh.position.y, look.z);
  targetGroup.add(mesh);
}

/**
 * Strefa kibica 3D (dopingujacy kibice przy szosie na szczytach KOM i na mecie)
 */
function createFanZone(
  targetGroup,
  routeCurve,
  u,
  totalDistanceM,
  roadWidth,
  animatedObjects,
  placement
) {
  const up = new THREE.Vector3(0, 1, 0);
  const pairCount = Math.ceil(SPECTATOR_DESIGNS.length / 2);
  for (let k = 1 - pairCount; k <= 0; k++) {
    const du = THREE.MathUtils.clamp(u + (k * 5) / totalDistanceM, 0.002, 0.998);
    const distanceM = du * totalDistanceM;
    if (placement.isInsideTunnel(distanceM)) continue;
    const pt = routeCurve.getPointAt(du);
    const tangent = routeCurve.getTangentAt(du).normalize();
    const right = new THREE.Vector3().crossVectors(tangent, up).normalize();

    for (const side of [-1, 1]) {
      const signedOff = side * (roadWidth * 0.5 + 1.35 + (Math.abs(k) % 2) * .2);
      const fanPos = pt.clone().addScaledVector(right, signedOff);
      fanPos.y = getEmbankmentY(pt.y, signedOff, roadWidth);

      const fan = new THREE.Group();
      const envelope = new THREE.Mesh(spectatorEnvelope, spectatorEnvelopeMaterial);
      envelope.visible = false;
      fan.add(envelope);
      fan.position.copy(fanPos);
      fan.lookAt(pt.x, fanPos.y, pt.z);
      if (!addRoadsideObject(placement.getChunkForDist(distanceM) || targetGroup, fan, 'spectator')) continue;
      fan.remove(envelope);
      animatedObjects.spectators.push(createSpectator(
        animatedObjects.spectators.length, distanceM, placement.quality, fan, placement.theme || ''
      ));
    }
  }
}

/**
 * Tworzy realistyczny znak ostrzegawczy (szewrony zakretu) przed ostrym zakretem.
 * Slupek znajduje sie Z TYLU metalowej tablicy (`z = +0.045`), a odblaskowe lico z przodu (`z = -0.018`),
 * dzieki czemu slupek nigdy nie przebija tarczy znaku ani nie ma czarnych naroznikow!
 */
function createTurnWarningSign(targetGroup, routeCurve, u, isRightTurn, roadWidth, frenchStyle = false) {
  const pt = routeCurve.getPointAt(u);
  const tangent = routeCurve.getTangentAt(u).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(tangent, up).normalize();

  const outerSide = isRightTurn ? -1 : 1;
  const signedOff = outerSide * (roadWidth * 0.5 + 0.85);
  const signPos = pt.clone().addScaledVector(right, signedOff);
  signPos.y = getEmbankmentY(pt.y, signedOff, roadWidth);

  const signGroup = new THREE.Group();
  signGroup.position.copy(signPos);
  const lookTarget = signPos.clone().add(tangent);
  signGroup.lookAt(lookTarget.x, signPos.y, lookTarget.z);
  // Lekkie skrecenie tablicy w strone osi jezdni, aby nadjezdzajacy kolarz widzial ja pod idealnym katem
  signGroup.rotateY(outerSide * 0.18);

  // Stalowy slupek umieszczony ZA tablica (z = +0.045) i osadzony 0.5m w glab pobocza
  const poleGeo = new THREE.CylinderGeometry(0.042, 0.042, 2.35, 10);
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.4,
    metalness: 0.65,
  });
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.set(0, 0.72, 0.045);

  // Metalowa obudowa / plecy tablicy znaku (z = 0.0) + obejmy montazowe
  const backMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.5,
    metalness: 0.5,
  });
  const backPlate = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.76, 0.024), backMat);
  backPlate.position.set(0, 1.84, 0.0);

  const clampGeo = new THREE.BoxGeometry(0.16, 0.06, 0.05);
  const clampTop = new THREE.Mesh(clampGeo, poleMat);
  clampTop.position.set(0, 2.02, 0.025);
  const clampBot = new THREE.Mesh(clampGeo, poleMat);
  clampBot.position.set(0, 1.66, 0.025);

  // Wysokiej rozdzielczosci odblaskowa tablica z geometrycznymi szewronami (256x176)
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 176;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 176);

  // Zolte tlo odblaskowe + czerwona ramka ostrzegawcza
  ctx.fillStyle = frenchStyle ? '#174b91' : '#facc15';
  ctx.fillRect(0, 0, 256, 176);
  ctx.lineWidth = 12;
  ctx.strokeStyle = frenchStyle ? '#f4f4ed' : '#dc2626';
  ctx.strokeRect(6, 6, 244, 164);

  // Rysowanie 3 ostrych, drogowych szewronow kierunkowych (w prawo >>> lub w lewo <<<)
  ctx.fillStyle = frenchStyle ? '#f4f4ed' : '#0f172a';
  const dir = isRightTurn ? 1 : -1;
  const centers = [58, 128, 198];
  const chevW = 28;
  const chevThick = 24;
  const topY = 26;
  const midY = 88;
  const botY = 150;

  for (const cx of centers) {
    const tipX = cx + dir * (chevW * 0.5);
    const tailX = cx - dir * (chevW * 0.5);
    ctx.beginPath();
    ctx.moveTo(tailX, topY);
    ctx.lineTo(tailX + dir * chevThick, topY);
    ctx.lineTo(tipX + dir * chevThick * 0.5, midY);
    ctx.lineTo(tailX + dir * chevThick, botY);
    ctx.lineTo(tailX, botY);
    ctx.lineTo(tipX - dir * chevThick * 0.5, midY);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const boardGeo = new THREE.PlaneGeometry(1.08, 0.72);
  const boardMat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const board = new THREE.Mesh(boardGeo, boardMat);
  // Lico znaku wysuniete do przodu (z = -0.016) w strone nadjezdzajacego kolarza
  board.position.set(0, 1.84, -0.016);
  board.rotation.y = Math.PI;

  signGroup.add(pole, backPlate, clampTop, clampBot, board);
  addRoadsideObject(targetGroup, signGroup, 'sign');
}

function createBannerArch(targetGroup, routeCurve, u, archKit, sign) {
  const clampedU = THREE.MathUtils.clamp(u, 0, 1);
  const pt = routeCurve.getPointAt(clampedU);
  const tangent = routeCurve.getTangentAt(clampedU).normalize();

  const archGroup = archKit.create({
    ...sign,
    baseY: getEmbankmentY(0, archKit.pillarOffset, archKit.roadWidth),
  });
  archGroup.position.copy(pt);

  const lookTarget = pt.clone().add(tangent);
  archGroup.lookAt(lookTarget.x, pt.y, lookTarget.z);

  addRoadsideObject(targetGroup, archGroup, 'arch');
}

/**
 * Tworzy klasyczny alpejski kamien milowy / slupek kilometrowy (KM 1, KM 2...) na poboczu szosy
 */
function createAlpeRouteSign(targetGroup, routeCurve, distanceM, totalDistanceM, roadWidth, title, subtitle, bendNumber) {
  const u = THREE.MathUtils.clamp(distanceM / totalDistanceM, 0, 1);
  const pt = routeCurve.getPointAt(u), tangent = routeCurve.getTangentAt(u);
  const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
  const canvas = document.createElement('canvas');
  canvas.width = 768; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f4f1e6'; ctx.fillRect(0, 0, 768, 512);
  ctx.strokeStyle = '#1d4380'; ctx.lineWidth = 24; ctx.strokeRect(12, 12, 744, 488);
  ctx.fillStyle = '#1d4380'; ctx.fillRect(24, 24, 720, 92);
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 44px sans-serif';
  ctx.fillText('ALPE D’HUEZ', 384, 88);
  ctx.fillStyle = '#162331';
  ctx.font = bendNumber ? 'bold 186px sans-serif' : 'bold 42px sans-serif';
  ctx.fillText(bendNumber ? String(bendNumber) : title, 384, bendNumber ? 325 : 270, 680);
  ctx.font = '36px sans-serif'; ctx.fillText(bendNumber ? 'VIRAGE' : 'D211', 384, 390);
  ctx.font = 'bold 42px sans-serif'; ctx.fillText(subtitle, 384, 465);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.05), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  label.position.set(0, 2, -0.06); label.rotation.y = Math.PI;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.3, 6),
    new THREE.MeshStandardMaterial({ color: 0x949b9d, roughness: 0.6 }));
  pole.position.y = 1;
  const sign = new THREE.Group(); sign.add(pole, label);
  sign.userData.labelText = title;
  sign.userData.bendNumber = bendNumber;
  sign.userData.distanceM = Math.max(0, distanceM);
  // Try the other shoulder before omitting a sign on a tight neighbouring turn.
  for (const side of [1, -1]) {
    const offset = side * (roadWidth * 0.5 + 1.6);
    sign.position.copy(pt).addScaledVector(right, offset);
    sign.position.y = getEmbankmentY(pt.y, offset, roadWidth);
    sign.lookAt(sign.position.x + tangent.x, sign.position.y, sign.position.z + tangent.z);
    if (addRoadsideObject(targetGroup, sign, 'route-sign')) return;
  }
}

function createAlpeResortBuildings(getChunkForDist, routeCurve, totalDistanceM, roadWidth, details) {
  const wallMaterials = [0xd8ccb5, 0xe5dfd0, 0xc9bda5].map((color, index) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 1 });
    material.name = `AlpeResortFacade${index + 1}`;
    return material;
  });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x58616a, roughness: 0.9 });
  const bodyGeo = new THREE.BoxGeometry(4.6, 1, 5.4), roofGeo = new THREE.BoxGeometry(4.9, 0.45, 5.5);
  let index = 0;
  for (let d = totalDistanceM - 2250; d < totalDistanceM - 140; d += 145) for (const side of [-1, 1]) {
    const pt = routeCurve.getPointAt(d / totalDistanceM), tangent = routeCurve.getTangentAt(d / totalDistanceM);
    const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const building = new THREE.Group(), height = 8 + (index % 3) * 3;
    const body = new THREE.Mesh(bodyGeo, wallMaterials[index % 3]); body.scale.y = height; body.position.y = height / 2;
    const roof = new THREE.Mesh(roofGeo, roofMaterial); roof.position.y = height + 0.2;
    building.add(body, roof);
    details.decorateResort(building, height, index);
    const offset = side * (roadWidth * 0.5 + 3.4);
    building.position.copy(pt).addScaledVector(right, offset);
    building.position.y = getEmbankmentY(pt.y, offset, roadWidth);
    building.lookAt(pt.x, building.position.y, pt.z);
    addRoadsideObject(getChunkForDist(d), building, 'chalet'); index++;
  }
}

function createAlpeChurch(targetGroup, routeCurve, u, roadWidth) {
  const pt = routeCurve.getPointAt(u), tangent = routeCurve.getTangentAt(u);
  const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
  const stone = new THREE.MeshStandardMaterial({ color: 0xcbbfa6, roughness: 1 });
  stone.name = 'AlpeChurchStone';
  const slate = new THREE.MeshStandardMaterial({ color: 0x535b60, roughness: 0.9 });
  const church = new THREE.Group(); church.name = 'SaintFerreol';
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.8, 4.2, 7), stone); body.position.y = 2;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2, 4), slate);
  roof.scale.z = 1.5; roof.rotation.y = Math.PI / 4; roof.position.y = 5;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.8, 7, 1.8), stone); tower.position.set(0, 3.4, 2.8);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.2, 4), slate); spire.position.set(0, 8.4, 2.8); spire.rotation.y = Math.PI / 4;
  church.add(body, roof, tower, spire);
  for (const side of [-1, 1]) {
    const offset = side * (roadWidth * 0.5 + 4);
    church.position.copy(pt).addScaledVector(right, offset);
    church.position.y = getEmbankmentY(pt.y, offset, roadWidth);
    church.lookAt(pt.x, church.position.y, pt.z);
    if (addRoadsideObject(targetGroup, church, 'church')) return;
  }
}

function createMilestonePost(targetGroup, routeCurve, u, kmNumber, roadWidth, climbInfo = null) {
  const clampedU = THREE.MathUtils.clamp(u, 0, 1);
  const pt = routeCurve.getPointAt(clampedU);
  const tangent = routeCurve.getTangentAt(clampedU).normalize();
  const upVec = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(tangent, upVec).normalize();

  const postPos = pt.clone().addScaledVector(right, roadWidth * 0.5 + 0.35);
  postPos.y = getEmbankmentY(pt.y, roadWidth * 0.5 + 0.35, roadWidth);

  const postGroup = new THREE.Group();
  postGroup.position.copy(postPos);
  postGroup.lookAt(postPos.clone().add(tangent));

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.85 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 });
  const baseGeo = new THREE.BoxGeometry(0.38, 0.85, 0.32);
  baseGeo.translate(0, 0.42, 0);
  const baseMesh = new THREE.Mesh(baseGeo, stoneMat);

  const capGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.2, 8);
  capGeo.translate(0, 0.95, 0);
  const capMesh = new THREE.Mesh(capGeo, capMat);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${kmNumber}`, 128, climbInfo ? 66 : 90);
  ctx.font = 'bold 36px sans-serif';
  ctx.fillStyle = '#d97706';
  ctx.fillText('KM', 128, climbInfo ? 112 : 180);
  if (climbInfo) {
    ctx.fillStyle = '#234c3b'; ctx.font = 'bold 25px sans-serif';
    ctx.fillText(`${climbInfo.remainingKm.toFixed(1)} km to summit`, 128, 163);
    ctx.font = '24px sans-serif';
    ctx.fillText(`${Math.round(climbInfo.elevation)} m above sea level`, 128, 199);
    ctx.fillText(`Ahead ${climbInfo.grade.toFixed(1)}%`, 128, 233);
  }

  const tex = new THREE.CanvasTexture(canvas);
  const labelGeo = new THREE.PlaneGeometry(0.32, climbInfo ? 0.58 : 0.32);
  const labelMat = new THREE.MeshBasicMaterial({ map: tex });
  const labelMesh = new THREE.Mesh(labelGeo, labelMat);
  labelMesh.position.set(-0.17, 0.52, 0);
  labelMesh.rotation.y = -Math.PI / 2;

  postGroup.add(baseMesh, capMesh, labelMesh);
  if (climbInfo) postGroup.userData.climbInfo = climbInfo;
  addRoadsideObject(targetGroup, postGroup, 'milestone');
}

/**
 * Generuje barierki ochronne (Alpine Guardrails) wzdloz urwisk, wysokich nasypow i ostrych lukow szosy.
 * Zapewnia ciaglosc barierek (brak wiszacych w powietrzu belek), prawidlowy kat nachylenia wzdluz spadku terenu
 * oraz dopasowanie do wygładzonej krawedzi szosy.
 */
function createAlpineGuardrails(getChunkForDist, roadSamples, sampleCount, minRouteY, roadWidth, isInsideTunnel, frenchStyle = false) {
  const postGeo = new THREE.CylinderGeometry(0.08, 0.09, 1.15, 6);
  postGeo.translate(0, 0.5, 0);
  const postMat = new THREE.MeshStandardMaterial({ color: frenchStyle ? 0x9ba5a6 : 0x4a3b32, roughness: 0.9 });
  const railMat = new THREE.MeshStandardMaterial({ color: frenchStyle ? 0xb2babb : 0x8a7b6a, roughness: 0.7, metalness: 0.25 });

  const halfRoad = roadWidth * 0.5;
  const guardrailOffset = halfRoad + 0.35;

  // 1. Okresl dla kazdej probki i kazdej strony (lewa -1, prawa +1), czy barierka jest wymagana
  const leftNeeded = new Uint8Array(sampleCount + 1);
  const rightNeeded = new Uint8Array(sampleCount + 1);

  for (let i = 0; i <= sampleCount; i++) {
    const s = roadSamples[i];
    if (isInsideTunnel(s.distM)) continue;

    const heightAbove = s.pt.y - minRouteY;
    const banking = s.banking || 0;
    const isSharpLeft = banking < -0.015; // skret w lewo -> zewnetrzna strona to prawa (+1)
    const isSharpRight = banking > 0.015; // skret w prawo -> zewnetrzna strona to lewa (-1)
    const isHighClimb = heightAbove > 22;

    if (isSharpLeft) rightNeeded[i] = 1;
    if (isSharpRight) leftNeeded[i] = 1;

    if (isHighClimb) {
      if (banking < -0.005) {
        rightNeeded[i] = 1;
      } else if (banking > 0.005) {
        leftNeeded[i] = 1;
      } else {
        // Prosty grzbiet gorski o stromym nachyleniu zbocza
        rightNeeded[i] = 1;
      }
    }
  }

  // 2. Wygładzenie flag: mostkowanie mikroskopijnych przerw (do 3 probek) i eliminacja pojedynczych slupkow
  function smoothRailFlags(flags) {
    for (let i = 1; i <= sampleCount - 3; i++) {
      if (flags[i - 1] === 1 && flags[i] === 0) {
        let gapLen = 0;
        while (i + gapLen <= sampleCount && flags[i + gapLen] === 0) {
          gapLen++;
        }
        if (gapLen <= 3 && i + gapLen <= sampleCount && flags[i + gapLen] === 1) {
          for (let g = 0; g < gapLen; g++) flags[i + g] = 1;
        }
      }
    }

    let runStart = -1;
    for (let i = 0; i <= sampleCount; i++) {
      if (flags[i] === 1) {
        if (runStart < 0) runStart = i;
      } else {
        if (runStart >= 0) {
          const runLen = i - runStart;
          if (runLen < 3) {
            for (let k = runStart; k < i; k++) flags[k] = 0;
          }
          runStart = -1;
        }
      }
    }
  }

  smoothRailFlags(leftNeeded);
  smoothRailFlags(rightNeeded);

  // 3. Buduj ciagle pasma slupkow i belek barierki (brak wiszacych koncow)
  const sides = [
    { side: -1, flags: leftNeeded },
    { side: 1, flags: rightNeeded },
  ];

  for (const { side, flags } of sides) {
    let run = [];
    for (let i = 0; i <= sampleCount; i += 2) {
      if (flags[i] === 1) {
        run.push(i);
      } else {
        if (run.length >= 2) {
          buildRailChain(run, side);
        }
        run = [];
      }
    }
    if (run.length >= 2) {
      buildRailChain(run, side);
    }
  }

  function buildRailChain(sampleIndices, side) {
    const postPositions = [];
    for (const idx of sampleIndices) {
      const s = roadSamples[idx];
      const edgeRight = s.roadEdgeRight || s.rawRight;
      const bankOffset = side < 0 ? (s.bankHeight || 0) : -(s.bankHeight || 0);
      const postPos = s.pt.clone().addScaledVector(edgeRight, side * guardrailOffset);
      postPos.y = getEmbankmentY(s.pt.y, side * guardrailOffset, roadWidth, minRouteY, bankOffset);

      const postMesh = new THREE.Mesh(postGeo, postMat);
      postMesh.userData.routeSpan = [s.distM, s.distM];
      postMesh.position.copy(postPos);
      addRoadsideObject(getChunkForDist(s.distM), postMesh, 'guardrail');

      postPositions.push({ idx, pos: postPos, distM: s.distM });
    }

    // Polacz kazdy slupek z nastepnym belka dopasowana w pelnym 3D (pitch & yaw)
    for (let k = 0; k < postPositions.length - 1; k++) {
      const pA = postPositions[k];
      const pB = postPositions[k + 1];

      // Szyna laczy szczyty slupkow (0.72m nad gruntem)
      const r1 = pA.pos.clone();
      r1.y += 0.72;
      const r2 = pB.pos.clone();
      r2.y += 0.72;

      const spanVec = r2.clone().sub(r1);
      const spanLen = spanVec.length();
      if (spanLen > 0.5 && spanLen < 16.0) {
        const railGeo = new THREE.BoxGeometry(0.12, 0.16, spanLen);
        const railMesh = new THREE.Mesh(railGeo, railMat);
        railMesh.userData.routeSpan = [pA.distM, pB.distM];
        // Srodek belki dokladnie w polowie odcinka 3D
        railMesh.position.copy(r1).lerp(r2, 0.5);
        // lookAt w pelnych wspolrzednych r2 uwzglednia rzeczywisty kat nachylenia szosy (np. zjazdy -18%)
        railMesh.lookAt(r2.x, r2.y, r2.z);
        addRoadsideObject(getChunkForDist(pA.distM), railMesh, 'guardrail');
      }
    }
  }
}

/**
 * Tworzy przelotowy tunel gorski 3D na trasie (skalne sklepienie, kamienne portale wjazdowe/wyjazdowe,
 * masyw gorski nad tunelem oraz cieple lampy stropowe wewnatrz tunelu).
 */
function createRideThroughMountainTunnel(
  getChunkForDist,
  routeCurve,
  totalDistanceM,
  startDistM,
  lengthM,
  roadWidth
) {
  const stonePortalMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.88,
    flatShading: true,
  });
  const innerVaultMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const mountainRockMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.92,
    flatShading: true,
  });
  const mountainGrassMat = new THREE.MeshStandardMaterial({
    color: 0x1f4d28,
    roughness: 0.9,
    flatShading: true,
  });
  const tunnelLightMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
  const reflectorMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

  const stepLen = 8;
  const steps = Math.max(4, Math.floor(lengthM / stepLen));
  const halfRoad = roadWidth * 0.5;

  // 1. Segmenty sklepienia tunelu wzdluz krzywej drogi + oswietlenie wewnetrzne
  const pending = [];
  for (let i = 0; i <= steps; i++) {
    const d = startDistM + (i / steps) * lengthM;
    const u = THREE.MathUtils.clamp(d / totalDistanceM, 0.001, 0.999);
    const pt = routeCurve.getPointAt(u);
    const tangent = routeCurve.getTangentAt(u).normalize();
    const chunk = getChunkForDist(d);

    const segGroup = new THREE.Group();
    segGroup.userData.routeSpan = [d - stepLen / 2 - 0.7, d + stepLen / 2 + 0.7];
    segGroup.position.copy(pt);
    const lookPt = pt.clone().add(tangent);
    segGroup.lookAt(lookPt.x, pt.y, lookPt.z);

    // Boczne sciany oporowe tunelu (osadzone 2.5m w glab podloza)
    const wallGeo = new THREE.BoxGeometry(1.3, 7.6, stepLen + 1.4);
    const leftWall = new THREE.Mesh(wallGeo, innerVaultMat);
    leftWall.position.set(-(halfRoad + 0.95), 2.1, 0);
    const rightWall = new THREE.Mesh(wallGeo, innerVaultMat);
    rightWall.position.set(halfRoad + 0.95, 2.1, 0);

    // Sklepienie stropowe nad szosa + skalny grzbiet scisle dopasowany do szerokosci tunelu (bez wiszacych w powietrzu stozkow!)
    const roofGeo = new THREE.BoxGeometry(roadWidth + 2.8, 1.8, stepLen + 1.4);
    const roof = new THREE.Mesh(roofGeo, innerVaultMat);
    roof.position.set(0, 6.2, 0);

    const ridgeCap = new THREE.Mesh(
      new THREE.BoxGeometry(roadWidth + 2.2, 2.4, stepLen + 1.4),
      i % 3 === 0 ? mountainGrassMat : mountainRockMat
    );
    ridgeCap.position.set(0, 8.1, 0);

    // Cieple lampy tunelowe pod stropem + odblaski boczne co 2 segmenty
    if (i % 2 === 0) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.45), tunnelLightMat);
      lamp.position.set(0, 5.22, 0);
      const refL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.4), reflectorMat);
      refL.position.set(-(halfRoad + 0.3), 0.95, 0);
      const refR = refL.clone();
      refR.position.x = halfRoad + 0.3;
      segGroup.add(lamp, refL, refR);
    }

    segGroup.add(leftWall, rightWall, roof, ridgeCap);
    pending.push({ chunk, object: segGroup });
  }

  // 2. Kamienne portale wjazdowy i wyjazdowy z kolumnowym obramowaniem
  for (const portalDist of [startDistM, startDistM + lengthM]) {
    const u = THREE.MathUtils.clamp(portalDist / totalDistanceM, 0.001, 0.999);
    const pt = routeCurve.getPointAt(u);
    const tangent = routeCurve.getTangentAt(u).normalize();
    const portalGroup = new THREE.Group();
    portalGroup.userData.routeSpan = [portalDist - 1.2, portalDist + 1.2];
    portalGroup.position.copy(pt);
    const lookPt = pt.clone().add(tangent);
    portalGroup.lookAt(lookPt.x, pt.y, lookPt.z);

    const pLeft = new THREE.Mesh(new THREE.BoxGeometry(2.2, 8.8, 2.2), stonePortalMat);
    pLeft.position.set(-(halfRoad + 1.35), 2.6, 0);
    const pRight = new THREE.Mesh(new THREE.BoxGeometry(2.2, 8.8, 2.2), stonePortalMat);
    pRight.position.set(halfRoad + 1.35, 2.6, 0);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(roadWidth + 4.4, 2.6, 2.4), stonePortalMat);
    lintel.position.set(0, 7.1, 0);

    portalGroup.add(pLeft, pRight, lintel);
    pending.push({ chunk: getChunkForDist(portalDist), object: portalGroup });
  }
  // Reject the entire tunnel if a wall would obstruct any part of a switchback.
  if (pending.some(({ chunk, object }) => !addRoadsideObject(chunk, object, 'tunnel', false))) return false;
  for (const { chunk, object } of pending) addRoadsideObject(chunk, object, 'tunnel');
  return true;
}

/**
 * Tworzy mobilny portal tunelu umieszczany na koncu widocznego okna szosy (`endStep`),
 * scisle dopasowany do szerokosci jezdni (bez wiszacych w powietrzu stozkow gorskich!).
 */
function createHorizonTunnelMountain(roadWidth) {
  const group = new THREE.Group();
  const halfRoad = roadWidth * 0.5;

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.88,
    flatShading: true,
  });
  const darkTunnelMat = new THREE.MeshBasicMaterial({ color: 0x090f1a });

  const pillarGeo = new THREE.BoxGeometry(2.2, 8.6, 3.2);
  const leftPillar = new THREE.Mesh(pillarGeo, stoneMat);
  leftPillar.position.set(-(halfRoad + 0.95), 2.6, 1.0);
  const rightPillar = new THREE.Mesh(pillarGeo, stoneMat);
  rightPillar.position.set(halfRoad + 0.95, 2.6, 1.0);

  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(roadWidth + 4.4, 2.6, 3.4), stoneMat);
  topBeam.position.set(0, 7.0, 1.0);

  const darkCore = new THREE.Mesh(new THREE.BoxGeometry(roadWidth + 0.4, 6.0, 1.8), darkTunnelMat);
  darkCore.position.set(0, 2.9, 1.8);

  group.add(leftPillar, rightPillar, topBeam, darkCore);
  return group;
}

/**
 * Kamienne mury oporowe i skalne skarpy wzdluz wewnetrznej strony podjazdow
 */
function createStoneRetainingWalls(
  getChunkForDist,
  roadSamples,
  points,
  totalDistanceM,
  roadWidth,
  isInsideTunnel
) {
  const wallMat = createRouteMasonryMaterial();
  const capMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.85,
  });
  const halfRoad = roadWidth * 0.5;

  for (let i = 4; i < roadSamples.length - 4; i += 3) {
    const s = roadSamples[i];
    const nextS = roadSamples[Math.min(roadSamples.length - 1, i + 3)];
    if (isInsideTunnel(s.distM)) continue;

    const segDist = Math.max(0.5, s.pt.distanceTo(nextS.pt));
    const gradePct = ((nextS.pt.y - s.pt.y) / segDist) * 100;
    if (gradePct < 4.5 || i % 9 === 0) continue;

    const innerSide = -1;
    const offset = innerSide * (halfRoad + 1.15);
    const edgeRight = s.roadEdgeRight || s.rawRight;
    const nextEdgeRight = nextS.roadEdgeRight || nextS.rawRight;
    const p1 = s.pt.clone().addScaledVector(edgeRight, offset);
    const p2 = nextS.pt.clone().addScaledVector(nextEdgeRight, offset);
    const len = p1.distanceTo(p2);
    if (len < 0.5 || len > 18) continue;

    const mid = p1.clone().add(p2).multiplyScalar(0.5);
    const wallGroup = new THREE.Group();
    wallGroup.userData.routeSpan = [s.distM, nextS.distM];
    wallGroup.position.copy(mid);
    wallGroup.lookAt(p2.x, p2.y, p2.z);

    const wallH = 2.6 + (i % 3) * 0.65;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.95, wallH, len + 0.25), wallMat);
    wall.position.y = wallH * 0.5 - 0.5;

    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.24, len + 0.3), capMat);
    cap.position.y = wallH - 0.38;

    wallGroup.add(wall, cap);
    addRoadsideObject(getChunkForDist(s.distM), wallGroup, 'wall');
  }
}

/**
 * Wysokie biale turbiny wiatrowe 3D z obracajacymi sie wirnikami na tarasach wzdluz trasy
 */
function createWindTurbines(
  getChunkForDist,
  roadSamples,
  totalDistanceM,
  roadWidth,
  isInsideTunnel,
  animatedObjects
) {
  const towerMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.35,
    metalness: 0.2,
  });
  const redStripeMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const numTurbines = Math.min(10, Math.max(3, Math.floor(totalDistanceM / 850)));

  for (let i = 1; i <= numTurbines; i++) {
    const sampleIdx = Math.min(
      roadSamples.length - 1,
      Math.floor(((i - 0.25) / (numTurbines + 0.5)) * roadSamples.length)
    );
    const s = roadSamples[sampleIdx];
    if (isInsideTunnel(s.distM)) continue;

    const side = i % 2 === 0 ? 1 : -1;
    const signedOff = side * (roadWidth * 0.5 + 5.6);
    const pos = s.pt.clone().addScaledVector(s.smoothedRight, signedOff);

    // Sprawdz brak kolizji z sasiednim odcinkiem trasy
    let hitsRoad = false;
    for (
      let k = Math.max(0, sampleIdx - 110);
      k <= Math.min(roadSamples.length - 1, sampleIdx + 110);
      k++
    ) {
      if (Math.abs(k - sampleIdx) <= 5) continue;
      const other = roadSamples[k];
      if ((pos.x - other.x) ** 2 + (pos.z - other.z) ** 2 < (roadWidth * 0.5 + 5.5) ** 2) {
        hitsRoad = true;
        break;
      }
    }
    if (hitsRoad) continue;

    pos.y = getEmbankmentY(s.pt.y, signedOff, roadWidth);

    const turbineGroup = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.68, 18.0, 10), towerMat);
    tower.position.y = 8.2;

    const nacelle = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 2.6), towerMat);
    nacelle.position.set(0, 17.2, 0.3);

    const rotor = new THREE.Group();
    rotor.position.set(0, 17.2, 1.65);
    rotor.userData.sweptRadius = 6.9;

    const hub = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.1, 8), towerMat);
    hub.rotation.x = Math.PI / 2;
    rotor.add(hub);

    for (let b = 0; b < 3; b++) {
      const bladePivot = new THREE.Group();
      bladePivot.rotation.z = (b * Math.PI * 2) / 3;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 6.4, 0.1), towerMat);
      blade.position.y = 3.2;
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.9, 0.12), redStripeMat);
      tip.position.y = 5.6;
      bladePivot.add(blade, tip);
      rotor.add(bladePivot);
    }

    turbineGroup.add(tower, nacelle, rotor);
    turbineGroup.position.copy(pos);
    turbineGroup.lookAt(s.pt.x, pos.y, s.pt.z);
    if (!addRoadsideObject(getChunkForDist(s.distM), turbineGroup, 'turbine')) continue;

    if (animatedObjects && animatedObjects.windTurbines) {
      animatedObjects.windTurbines.push({
        rotor,
        speed: 1.35 + (i % 3) * 0.35,
      });
    }
  }
}

/**
 * Malownicze oczka wodne / przystanie z drewnianym pomostem i zaglowkami na lagodnych odcinkach trasy
 */
function createAlpineLakes(
  getChunkForDist,
  roadSamples,
  points,
  totalDistanceM,
  roadWidth,
  isInsideTunnel,
  animatedObjects
) {
  const rippleTex = getWaterRippleTexture();
  const waterMat = new THREE.MeshStandardMaterial({
    name: 'AlpineLakeWater',
    color: 0x0284c7,
    bumpMap: rippleTex,
    bumpScale: 0.042,
    roughnessMap: rippleTex,
    roughness: 0.14,
    metalness: 0.58,
    envMapIntensity: 1.9,
  });
  const foamMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.88 });
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
  const sailMat = new THREE.MeshStandardMaterial({
    color: 0xf2c94c,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });

  const candidateFracs = [0.14, 0.52, 0.82];
  for (let idx = 0; idx < candidateFracs.length; idx++) {
    const sampleIdx = Math.min(
      roadSamples.length - 4,
      Math.max(4, Math.floor(candidateFracs[idx] * roadSamples.length))
    );
    const s = roadSamples[sampleIdx];
    if (isInsideTunnel(s.distM)) continue;

    const side = idx % 2 === 0 ? -1 : 1;
    const signedOff = side * (roadWidth * 0.5 + 5.2);
    const lakePos = s.pt.clone().addScaledVector(s.smoothedRight, signedOff);
    lakePos.y = getEmbankmentY(s.pt.y, signedOff, roadWidth) + 0.08;

    const lakeGroup = new THREE.Group();
    lakeGroup.position.copy(lakePos);
    lakeGroup.lookAt(s.pt.x, lakePos.y, s.pt.z);

    // Tafla jeziora osadzona równolegle do szosy (oś X wzdłuż drogi, oś Z w stronę pobocza)
    const waterDisk = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.24, 24), waterMat);
    waterDisk.scale.set(1.65, 1.0, 0.92);
    waterDisk.position.y = -0.04;

    const foamRing = new THREE.Mesh(new THREE.RingGeometry(3.85, 4.18, 24), foamMat);
    foamRing.rotation.x = -Math.PI / 2;
    foamRing.scale.set(1.65, 0.92, 1.0);
    foamRing.position.y = 0.085;

    // Drewniany pomost widokowy od strony szosy
    const pier = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 2.8), woodMat);
    pier.position.set(0, 0.18, 2.4);

    // Zaglowka 3D na wodzie
    const boatGroup = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.36, 2.2), hullMat);
    hull.position.y = 0.18;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.8, 6), woodMat);
    mast.position.y = 1.5;
    const sail = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.2, 3), sailMat);
    sail.position.set(0, 1.55, -0.15);
    boatGroup.add(hull, mast, sail);
    boatGroup.position.set(0.3, 0.08, -0.5);

    lakeGroup.add(waterDisk, foamRing, pier, boatGroup);
    let placedLake = addRoadsideObject(getChunkForDist(s.distM), lakeGroup, 'lake');
    if (!placedLake) {
      const altPos = s.pt.clone().addScaledVector(s.smoothedRight, -signedOff);
      altPos.y = getEmbankmentY(s.pt.y, -signedOff, roadWidth) + 0.08;
      lakeGroup.position.copy(altPos);
      lakeGroup.lookAt(s.pt.x, altPos.y, s.pt.z);
      placedLake = addRoadsideObject(getChunkForDist(s.distM), lakeGroup, 'lake');
    }
    if (!placedLake) continue;

    if (animatedObjects && animatedObjects.boats) {
      animatedObjects.boats.push({
        group: boatGroup,
        baseY: 0.08,
        phase: idx * 1.7,
      });
    }
  }
}

/**
 * Strefy Bufetu (Feed Zones) w barwach Slonce i las z namiotami ekip, stolami z bidonami i asystentami
 */
function createFeedZones(
  getChunkForDist,
  routeCurve,
  totalDistanceM,
  roadWidth,
  isInsideTunnel,
  animatedObjects,
  fanPlacement,
  archKit
) {
  if (totalDistanceM < 1500) return;
  const canopyGreenMat = new THREE.MeshStandardMaterial({ color: 0x234c3b, roughness: 0.7 });
  const canopyGoldMat = new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.55 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.6 });
  const tableMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
  const bidonMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.3 });
  const up = new THREE.Vector3(0, 1, 0);

  const feedFractions = totalDistanceM > 6000 ? [0.33, 0.66] : [0.48];
  for (let idx = 0; idx < feedFractions.length; idx++) {
    const distM = totalDistanceM * feedFractions[idx];
    if (isInsideTunnel(distM)) continue;

    const u = THREE.MathUtils.clamp(distM / totalDistanceM, 0.02, 0.98);
    const pt = routeCurve.getPointAt(u);
    const tangent = routeCurve.getTangentAt(u).normalize();
    const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const chunk = getChunkForDist(distM);

    // Brama informacyjna Strefy Bufetu
    createBannerArch(chunk, routeCurve, u, archKit,
      { type: 'feed', title: 'Feed zone', subtitle: 'Feed zone' });

    for (const side of [-1, 1]) {
      const signedOff = side * (roadWidth * 0.5 + 3.7);
      const tentPos = pt.clone().addScaledVector(right, signedOff);
      tentPos.y = getEmbankmentY(pt.y, signedOff, roadWidth);

      const tentGroup = new THREE.Group();
      tentGroup.position.copy(tentPos);
      tentGroup.lookAt(pt.x, tentPos.y, pt.z);

      // Namiot serwisowy (Gazebo 3D)
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(2.4, 1.25, 4),
        side > 0 ? canopyGreenMat : canopyGoldMat
      );
      roof.position.y = 3.1;
      roof.rotation.y = Math.PI / 4;

      for (const lx of [-1.4, 1.4]) {
        for (const lz of [-1.4, 1.4]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), legMat);
          leg.position.set(lx, 1.3, lz);
          tentGroup.add(leg);
        }
      }

      // Stol z bidonami przed namiotem
      const table = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.85, 0.8), tableMat);
      table.position.set(0, 0.42, 1.1);
      tentGroup.add(roof, table);

      for (let b = -2; b <= 2; b++) {
        const bidon = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.26, 8), bidonMat);
        bidon.position.set(b * 0.36, 0.98, 1.1);
        tentGroup.add(bidon);
      }

      addRoadsideObject(chunk, tentGroup, 'tent');
    }

    // Asystenci i kibice przy strefie bufetu
    createFanZone(chunk, routeCurve, u, totalDistanceM, roadWidth, animatedObjects, fanPlacement);
  }
}

/**
 * Drewniane plotki pasterskie, zlote bele siana i drewniane wiaty odpoczynkowe wzdluz trasy
 */
function createRusticFencesAndOverlooks(
  getChunkForDist,
  roadSamples,
  totalDistanceM,
  roadWidth,
  isInsideTunnel
) {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
  const hayMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.85 });
  const halfRoad = roadWidth * 0.5;

  for (let i = 10; i < roadSamples.length - 10; i += 14) {
    const s = roadSamples[i];
    if (isInsideTunnel(s.distM)) continue;

    const side = Math.floor(i / 14) % 2 === 0 ? 1 : -1;
    const signedOff = side * (halfRoad + 3.2);
    const edgeRight = s.roadEdgeRight || s.rawRight;
    const pos = s.pt.clone().addScaledVector(edgeRight, signedOff);
    pos.y = getEmbankmentY(s.pt.y, signedOff, roadWidth, 0, side < 0 ? (s.bankHeight || 0) : -(s.bankHeight || 0));
    if (!isPositionClearOfRoad(pos, 1.4, roadSamples)) continue;

    const propGroup = new THREE.Group();
    propGroup.position.copy(pos);
    const lookPt = pos.clone().add(s.tangent);
    propGroup.lookAt(lookPt.x, lookPt.y, lookPt.z);

    // Drewniany plotek pasterski (3 przęsła)
    const rail1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 4.8), woodMat);
    rail1.position.y = 0.82;
    const rail2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 4.8), woodMat);
    rail2.position.y = 0.46;
    propGroup.add(rail1, rail2);

    for (const pz of [-2.2, 0, 2.2]) {
      const fPost = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.15, 0.14), woodMat);
      fPost.position.set(0, 0.5, pz);
      propGroup.add(fPost);
    }

    // Co drugi odcinek: zlota bela siana lub drewniana lawka widokowa
    if (i % 28 === 0) {
      const hayBale = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.35, 12), hayMat);
      hayBale.rotation.z = Math.PI / 2;
      hayBale.position.set(side * 1.5, 0.72, 0);
      propGroup.add(hayBale);
    }

    addRoadsideObject(getChunkForDist(s.distM), propGroup, 'fence');
  }
}
