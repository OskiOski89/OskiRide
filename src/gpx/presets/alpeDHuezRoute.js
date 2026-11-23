import * as THREE from 'three';
import { ALPE_TRACK, ALPE_BENDS, ALPE_LANDMARKS, ALPE_SOURCE } from './alpeDHuezData.js';

// Keep this separate from the generic GPX pipeline: its wide horizontal smoothing
// would cut across the small, irregularly spaced D211 hairpins.
export function createAlpeDHuezRoute() {
  const [refLat, refLon, baseEle] = ALPE_TRACK[0];
  const toLocal = ([lat, lon]) => new THREE.Vector3(
    (lon - refLon) * Math.PI / 180 * 6371000 * Math.cos(refLat * Math.PI / 180),
    0, -(lat - refLat) * Math.PI / 180 * 6371000
  );
  const anchors = ALPE_TRACK.map(toLocal);
  const curve = new THREE.CatmullRomCurve3(anchors, false, 'centripetal');
  curve.arcLengthDivisions = anchors.length * 12;
  curve.updateArcLengths();
  const length = curve.getLength();
  const count = Math.ceil(length / 4);
  const points = [];
  // Curve parameter follows source indices; distance is measured after sampling.
  // Source elevations are interpolated linearly to avoid cubic overshoot.
  for (let i = 0; i <= count; i++) {
    const t = curve.getUtoTmapping(i / count);
    const p = curve.getPoint(t);
    const index = Math.min(anchors.length - 2, Math.floor(t * (anchors.length - 1)));
    const f = t * (anchors.length - 1) - index;
    const ele = THREE.MathUtils.lerp(ALPE_TRACK[index][2], ALPE_TRACK[index + 1][2], f);
    const prev = points.at(-1);
    points.push({ x: p.x, y: ele - baseEle, z: p.z,
      dist: prev ? prev.dist + Math.hypot(p.x - prev.x, p.z - prev.z) : 0,
      ele, rawEle: ele, grade: 0,
      lat: refLat - p.z / 6371000 * 180 / Math.PI,
      lon: refLon + p.x / (6371000 * Math.cos(refLat * Math.PI / 180)) * 180 / Math.PI,
      ghostElapsedSec: NaN, hasRealGpxTime: false });
  }
  // The tourism GPX uses terrain elevations: at hairpins these contain false
  // ramps above 60%. Smooth over 180 m each way before deriving road grades.
  // Extend endpoint trends to avoid a flattened start or finish at the boundary.
  const elevations = points.map((p, i) => {
    let sum = 0, weight = 0;
    for (let j = i - 45; j <= i + 45; j++) {
      const w = Math.exp(-0.5 * ((j - i) * 4 / 60) ** 2);
      const ele = j < 0 ? points[0].rawEle + j * (points[25].rawEle - points[0].rawEle) / 25
        : j > count ? points[count].rawEle + (j - count) * (points[count].rawEle - points[count - 25].rawEle) / 25
        : points[j].rawEle;
      sum += ele * w; weight += w;
    }
    return sum / weight;
  });
  const startOffset = baseEle - elevations[0];
  const endOffset = points[count].rawEle - elevations[count];
  points.forEach((p, i) => {
    p.ele = elevations[i] + THREE.MathUtils.lerp(startOffset, endOffset, p.dist / points[count].dist);
    p.y = p.ele - baseEle;
  });
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 4)], b = points[Math.min(count, i + 4)];
    p.grade = (b.ele - a.ele) / Math.max(1, b.dist - a.dist) * 100;
  });
  const locate = index => {
    const anchor = anchors[index];
    return points.reduce((best, p) =>
      Math.hypot(p.x - anchor.x, p.z - anchor.z) < Math.hypot(best.x - anchor.x, best.z - anchor.z) ? p : best);
  };
  points.routeId = 'alpedhuez';
  points.source = { ...ALPE_SOURCE };
  points.bends = ALPE_BENDS.map(b => ({ ...b, ...locate(b.index) }));
  points.landmarks = ALPE_LANDMARKS.map(w => ({ ...w, ...locate(w.index) }));
  return points;
}
