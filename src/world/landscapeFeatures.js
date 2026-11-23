import * as THREE from 'three';

// Landscape infrastructure is planned on the actual mountain mesh, outside the verge.
// The small prop templates in roadsideLife are deliberately not used here.
export function populateLandscapeFeatures({ terrain, samples, points, roadWidth, totalDistanceM,
  isInsideTunnel, add, getChunk, resources, waterRippleTex = null }) {
  const stats = { placements: [], skipped: [], surfaceQueries: 0 };
  let minY = Infinity, maxY = -Infinity;
  for (const point of points) { minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y); }
  if (points.routeId === 'alpedhuez' || maxY - minY < 100 || totalDistanceM < 1800) return stats;

  terrain.updateWorldMatrix(true, false);
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, maxY - minY + 500);
  const cache = new Map();
  const surface = (x, z) => {
    const key = `${x.toFixed(3)}:${z.toFixed(3)}`;
    if (cache.has(key)) return cache.get(key);
    stats.surfaceQueries++;
    ray.ray.origin.set(x, maxY + 150, z);
    const hit = ray.intersectObject(terrain, false)[0];
    const result = hit ? hit.point.clone() : null;
    cache.set(key, result); return result;
  };
  const roadDistance = p => {
    let best = Infinity;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i], dx = b.x - a.x, dz = b.z - a.z;
      const t = THREE.MathUtils.clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      best = Math.min(best, (p.x - a.x - dx * t) ** 2 + (p.z - a.z - dz * t) ** 2);
    }
    return Math.sqrt(best) - roadWidth / 2;
  };
  const candidates = samples.filter((s, i) => i % 75 === 0 && s.distM > 350 && s.distM < totalDistanceM - 350 &&
    !isInsideTunnel(s.distM) && s.y > minY + (maxY - minY) * 0.55).sort((a, b) => b.y - a.y).slice(0, 9);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  const rock = new THREE.DodecahedronGeometry(1, 0);
  for (const geometry of [unitBox, cylinder, rock]) resources.geometries.add(geometry);
  const mat = (color, options = {}) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...options });
    resources.materials.add(material); return material;
  };
  const stone = mat(0x929385), metal = mat(0x68766e, { metalness: 0.45 }), green = mat(0x234c3b);
  const cable = mat(0x323c36), water = mat(0x2b7a98, {
    roughness: 0.14,
    metalness: 0.48,
    envMapIntensity: 1.85,
    bumpMap: waterRippleTex,
    bumpScale: 0.035,
  });
  const bed = mat(0x777d69), foam = mat(0xd4e5de);
  const mesh = (parent, geometry, material, size, position) => {
    const part = new THREE.Mesh(geometry, material); part.scale.set(...size); part.position.copy(position); parent.add(part); return part;
  };
  const box = (parent, material, size, pos) => mesh(parent, unitBox, material, size, pos);
  const beam = (parent, material, a, b, radius) => {
    const part = mesh(parent, cylinder, material, [radius, a.distanceTo(b), radius], a.clone().add(b).multiplyScalar(0.5));
    part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); return part;
  };
  const record = (kind, plan, object) => {
    object.name = `Landscape_${kind}`; object.userData.landscapeType = kind;
    object.userData.distanceM = plan.sample.distM;
    if (!add(getChunk(plan.sample.distM), object, 'landscape-feature')) return false;
    stats.placements.push({ kind, distanceM: plan.sample.distM, position: plan.path[Math.floor(plan.path.length / 2)].toArray(),
      path: plan.path.map(p => p.toArray()), roadEdgeClearanceM: Math.min(...plan.path.map(roadDistance)),
      elevationDropM: plan.path[0].y - plan.path.at(-1).y });
    return true;
  };

  let liftPlaced = false;
  for (const sample of candidates) {
    if (liftPlaced) break;
    for (const side of [1, -1]) {
      if (liftPlaced) break;
      for (const along of [60, -60, 95]) {
        const right = sample.roadEdgeRight || sample.rawRight;
        const start = sample.pt.clone().addScaledVector(right, side * 27);
        const end = sample.pt.clone().addScaledVector(right, side * 103).addScaledVector(sample.tangent, along);
        const path = [];
        for (let i = 0; i <= 24; i++) {
          const p = start.clone().lerp(end, i / 24), ground = surface(p.x, p.z);
          if (!ground || roadDistance(ground) < 18) break;
          path.push(ground);
        }
        if (path.length !== 25) continue;
        const horizontal = Math.hypot(end.x - start.x, end.z - start.z), drop = path[0].y - path.at(-1).y;
        if (drop < 12 || drop / horizontal > 1.1) continue;
        // A continuous slope, not a route terrace or a flat line parallel to the road.
        if (path.some((p, i) => i > 0 && p.y > path[i - 1].y + 0.4)) continue;
        const normal = new THREE.Vector3(-(end.z - start.z), 0, end.x - start.x).normalize();
        const forward = end.clone().sub(start).setY(0).normalize();
        const supportIndices = [0, 8, 16, 24];
        const stationPlatforms = [];
        let fits = true;
        for (const index of supportIndices) {
          const p = path[index];
          for (const shift of [-1.7, 1.7]) {
            const corner = surface(p.x + normal.x * shift, p.z + normal.z * shift);
            if (!corner || Math.abs(corner.y - p.y) > 2) fits = false;
          }
        }
        for (const index of [0, 24]) {
          const base = path[index], heights = [];
          for (const x of [-2.5, 2.5]) for (const z of [-2.2, 2.2]) {
            const corner = base.clone().addScaledVector(normal, x).addScaledVector(forward, z);
            const ground = surface(corner.x, corner.z);
            if (!ground || roadDistance(ground) < 16) { fits = false; break; }
            heights.push(ground.y);
          }
          stationPlatforms.push({ top: Math.max(...heights) + 0.2, bottom: Math.min(...heights) - 0.5 });
        }
        if (!fits) continue;
        const object = new THREE.Group();
        const cablePaths = [];
        const supportTops = supportIndices.map((index, i) => path[index].clone().setY(
          i === 0 ? stationPlatforms[0].top + 4 : i === 3 ? stationPlatforms[1].top + 4 : path[index].y + 10));
        for (const sideTrack of [-1, 1]) {
          const line = [];
          for (let span = 0; span < 3; span++) for (let step = 0; step < 9; step++) {
            if (span > 0 && step === 0) continue;
            const t = step / 8, a = supportTops[span], b = supportTops[span + 1];
            const p = a.clone().lerp(b, t).addScaledVector(normal, sideTrack * 1.3);
            p.y -= Math.sin(t * Math.PI) * 0.45;
            const ground = surface(p.x, p.z);
            if (!ground || p.y - ground.y < 3.6) fits = false;
            line.push(p);
          }
          cablePaths.push(line);
        }
        if (!fits) continue;
        const yaw = Math.atan2(end.x - start.x, end.z - start.z);
        for (const [number, index] of supportIndices.entries()) {
          const base = path[index], top = supportTops[number];
          box(object, stone, [1.5, 3.4, 1.5], base.clone().add(new THREE.Vector3(0, -1.4, 0)));
          beam(object, metal, base, top, 0.18);
          const crossbar = box(object, metal, [3.8, 0.24, 0.5], top); crossbar.rotation.y = yaw;
          if (number === 0 || number === 3) {
            const platform = stationPlatforms[number === 0 ? 0 : 1];
            const foundation = box(object, stone, [5, platform.top - platform.bottom, 4.4], base.clone().setY((platform.top + platform.bottom) / 2)); foundation.rotation.y = yaw;
            const hut = box(object, green, [1.1, 2.1, 1.6], base.clone().addScaledVector(normal, 1.85).setY(platform.top + 1.05)); hut.rotation.y = yaw;
            const terminal = box(object, green, [4.1, 0.9, 3.2], top.clone().add(new THREE.Vector3(0, 0.5, 0))); terminal.rotation.y = yaw;
            mesh(object, cylinder, metal, [1.3, 0.2, 1.3], top);
          }
        }
        for (const line of cablePaths) {
          for (let i = 1; i < line.length; i++) beam(object, cable, line[i - 1], line[i], 0.025);
          for (const index of [4, 12, 20]) {
            const hanger = line[index], seat = hanger.clone().add(new THREE.Vector3(0, -2.5, 0));
            beam(object, metal, hanger, seat, 0.028);
            const chair = box(object, green, [1.1, 0.12, 0.65], seat); chair.rotation.y = yaw;
            const back = box(object, green, [1.1, 0.55, 0.08], seat.clone().add(new THREE.Vector3(Math.sin(yaw) * 0.25, 0.28, Math.cos(yaw) * 0.25))); back.rotation.y = yaw;
          }
        }
        liftPlaced = record('ski-lift', { sample, path }, object);
        if (liftPlaced) {
          stats.placements.at(-1).supportBases = supportIndices.map(i => path[i].toArray());
          stats.placements.at(-1).cablePaths = cablePaths.map(line => line.map(p => p.toArray()));
        }
        if (liftPlaced) break;
      }
    }
  }
  if (!liftPlaced) stats.skipped.push('ski-lift: no clear continuous hillside');

  let streamPlaced = false;
  for (const sample of candidates.slice().reverse()) {
    if (streamPlaced) break;
    for (const side of [-1, 1]) {
      if (streamPlaced) break;
      const right = sample.roadEdgeRight || sample.rawRight;
      const width = 36 + Math.max(0, sample.y - minY) * 0.65;
      const path = [];
      const steps = Math.ceil((width - 20) / 2.2);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const offset = 20 + (width - 23) * i / steps;
        const meander = Math.sin(t * Math.PI * 2) * 9 + Math.sin(t * Math.PI * 5) * 2;
        const p = sample.pt.clone().addScaledVector(right, side * offset).addScaledVector(sample.tangent, meander);
        const ground = surface(p.x, p.z);
        if (!ground || roadDistance(ground) < 13 || (path.length && ground.y > path.at(-1).y + 0.015)) break;
        path.push(ground);
      }
      if (path.length < 10 || path[0].y - path.at(-1).y < 12) continue;
      // Do not finish halfway down a slope: the flow must reach the mountain foot.
      if (path.at(-1).y > minY - 7) continue;
      const object = new THREE.Group();
      let fits = true;
      const edges = [];
      for (let i = 0; i < path.length; i++) {
        const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
        const normal = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize();
        const halfWidth = 0.65 + i / path.length * 0.55 + Math.sin(i * 0.8) * 0.12;
        const row = [];
        for (const sign of [-1, 1]) {
          const x = path[i].x + normal.x * halfWidth * sign, z = path[i].z + normal.z * halfWidth * sign;
          const edge = surface(x, z);
          if (!edge || Math.abs(edge.y - path[i].y) > 1.8) { fits = false; break; }
          row.push(edge);
        }
        if (!fits) break;
        edges.push(row);
        for (const sign of [-1, 1]) {
          const p = path[i].clone().addScaledVector(normal, sign * (halfWidth + 0.45));
          const ground = surface(p.x, p.z);
          if (ground) mesh(object, rock, stone, [0.55 + (i % 3) * 0.15, 0.6, 0.8], ground.clone().add(new THREE.Vector3(0, 0.03, 0)));
        }
      }
      if (!fits) continue;
      for (let i = 1; i < path.length; i++) {
        const corners = [edges[i - 1][0], edges[i - 1][1], edges[i][0], edges[i][1]];
        for (const [material, scale, lift] of [[bed, 1.4, 0.05], [water, 1, 0.11]]) {
          const vertices = [];
          for (const [index, corner] of corners.entries()) {
            const center = path[index < 2 ? i - 1 : i];
            const x = center.x + (corner.x - center.x) * scale, z = center.z + (corner.z - center.z) * scale;
            const ground = surface(x, z);
            if (!ground) { fits = false; break; }
            vertices.push(x, ground.y + lift, z);
          }
          if (!fits) break;
          const geo = new THREE.BufferGeometry(); resources.geometries.add(geo);
          geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setIndex([0, 1, 2, 1, 3, 2]); geo.computeVertexNormals();
          const strip = new THREE.Mesh(geo, material); material.side = THREE.DoubleSide; object.add(strip);
        }
        if (!fits) break;
        if (i % 3 === 0) beam(object, foam, edges[i][0].clone().add(new THREE.Vector3(0, 0.09, 0)), edges[i][1].clone().add(new THREE.Vector3(0, 0.09, 0)), 0.035);
      }
      if (!fits) continue;
      const source = path[0];
      mesh(object, rock, stone, [1.0, 0.9, 0.85], source.clone().add(new THREE.Vector3(0, 0.35, 0)));
      streamPlaced = record('stream', { sample, path }, object);
    }
  }
  if (!streamPlaced) stats.skipped.push('stream: no uninterrupted downhill course to the mountain foot');
  return stats;
}
