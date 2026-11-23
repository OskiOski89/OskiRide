import * as THREE from 'three';

const before = new THREE.Vector3();
const middle = new THREE.Vector3();
const after = new THREE.Vector3();
export const MAX_ROAD_LEAN_RAD = 35 * Math.PI / 180;

/** Signed horizontal curvature of the displayed spline, in 1/metres. Right is positive. */
export function sampleRoadCurvature(curve, u) {
  const length = curve?.getLength();
  if (!Number.isFinite(length) || length < 0.01 || !Number.isFinite(u)) return 0;
  // Fixed physical support avoids dependence on the number of GPX points.
  const halfSpan = Math.min(0.25, 3.5 / length);
  const center = THREE.MathUtils.clamp(u, halfSpan, 1 - halfSpan);
  curve.getPointAt(center - halfSpan, before);
  curve.getPointAt(center, middle);
  curve.getPointAt(center + halfSpan, after);
  const abX = middle.x - before.x, abZ = middle.z - before.z;
  const bcX = after.x - middle.x, bcZ = after.z - middle.z;
  const acX = after.x - before.x, acZ = after.z - before.z;
  const denominator = Math.hypot(abX, abZ) * Math.hypot(bcX, bcZ) * Math.hypot(acX, acZ);
  if (denominator < 1e-9) return 0;
  const curvature = 2 * (abX * bcZ - abZ * bcX) / denominator;
  return Number.isFinite(curvature) ? curvature : 0;
}

export function roadLeanAngle(speedMps, curvature) {
  if (!Number.isFinite(speedMps) || speedMps <= 0 || !Number.isFinite(curvature)) return 0;
  return THREE.MathUtils.clamp(Math.atan(speedMps * speedMps * curvature / 9.81),
    -MAX_ROAD_LEAN_RAD, MAX_ROAD_LEAN_RAD);
}

/** Call after group.lookAt(): Three.js model forward is +Z, so a right lean is +rotation.z. */
export function applyRoadLean(group, rider, curve, u, speedMps, dt) {
  const target = roadLeanAngle(speedMps, sampleRoadCurvature(curve, u));
  const previous = Number.isFinite(rider.currentLeanRad) ? rider.currentLeanRad : 0;
  const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  rider.currentLeanRad = THREE.MathUtils.lerp(previous, target, 1 - Math.exp(-5.5 * step));
  group.rotateZ(rider.currentLeanRad);
  return rider.currentLeanRad;
}
