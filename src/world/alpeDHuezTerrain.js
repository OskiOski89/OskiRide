import * as THREE from 'three';

// A continuous, route-constrained approximation of the mountainside. This is
// deliberately not described as an IGN/DEM reconstruction: only the road is GPX.
export function createAlpeDHuezTerrain(group, points) {
  const cell = 24, margin = 650;
  const minX = Math.floor((Math.min(...points.map(p => p.x)) - margin) / cell) * cell;
  const minZ = Math.floor((Math.min(...points.map(p => p.z)) - margin) / cell) * cell;
  const nx = Math.ceil((Math.max(...points.map(p => p.x)) + margin - minX) / cell);
  const nz = Math.ceil((Math.max(...points.map(p => p.z)) + margin - minZ) / cell);
  const heights = new Float32Array((nx + 1) * (nz + 1));
  const samples = points.filter((p, i) => i % 8 === 0 || i === points.length - 1);
  for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
    const x = minX + ix * cell, z = minZ + iz * cell;
    // Keep the nearest point from each 200 m section, so one straight does not
    // overwhelm the height interpolation between adjacent tiers of switchbacks.
    const sectors = new Map();
    for (const p of samples) {
      const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
      const key = Math.floor(p.dist / 200);
      if (!sectors.has(key) || d2 < sectors.get(key).d2) sectors.set(key, { p, d2 });
    }
    const nearest = [...sectors.values()].sort((a, b) => a.d2 - b.d2).slice(0, 5);
    let sum = 0, weights = 0;
    for (const { p, d2 } of nearest) {
      const w = 1 / (d2 + 900);
      sum += p.y * w; weights += w;
    }
    const closest = nearest[0];
    const d = Math.sqrt(closest.d2);
    const nearBlend = Math.max(0, 1 - d / 60);
    let y = THREE.MathUtils.lerp(sum / weights, closest.p.y, nearBlend);
    // The southern foot opens onto the valley; the northern shoulder continues
    // uphill above the resort instead of ending as a narrow road embankment.
    const shoulder = Math.max(0, closest.p.z - z) * 0.25;
    const valley = Math.max(0, z - closest.p.z) * 0.30;
    y += (shoulder - valley) * Math.min(1, d / 200);
    y += Math.sin(x * 0.008) * Math.sin(z * 0.006) * Math.min(12, d * 0.06);
    const edgeDistance = Math.min(ix, iz, nx - ix, nz - iz) * cell;
    const edge = THREE.MathUtils.smoothstep(edgeDistance, 0, margin * 0.8);
    heights[iz * (nx + 1) + ix] = -14 + (Math.max(-14, y - 1.2) + 14) * edge;
  }
  for (let pass = 0; pass < 3; pass++) {
    const previous = heights.slice();
    for (let iz = 1; iz < nz; iz++) for (let ix = 1; ix < nx; ix++) {
      const i = iz * (nx + 1) + ix;
      heights[i] = previous[i] * 0.5 + (previous[i - 1] + previous[i + 1] + previous[i - nx - 1] + previous[i + nx + 1]) * 0.125;
    }
  }
  const cornersAt = (x, z) => {
    const fx = THREE.MathUtils.clamp((x - minX) / cell, 0, nx - 0.00001);
    const fz = THREE.MathUtils.clamp((z - minZ) / cell, 0, nz - 0.00001);
    const ix = Math.floor(fx), iz = Math.floor(fz), a = iz * (nx + 1) + ix;
    return { a, b: a + 1, c: a + nx + 1, d: a + nx + 2, u: fx - ix, v: fz - iz };
  };
  // Carve every cell traversed by the road, including its full terrace width.
  // Linear interpolation inside each triangle then stays below the asphalt.
  for (const p of points) for (const dx of [-12, 0, 12]) for (const dz of [-12, 0, 12]) {
    const { a, b, c, d } = cornersAt(p.x + dx, p.z + dz);
    for (const index of [a, b, c, d]) heights[index] = Math.min(heights[index], p.y - 1.2);
  }
  const heightAt = (x, z) => {
    const { a, b, c, d, u, v } = cornersAt(x, z);
    return u + v <= 1 ? heights[a] + (heights[b] - heights[a]) * u + (heights[c] - heights[a]) * v
      : heights[d] + (heights[c] - heights[d]) * (1 - u) + (heights[b] - heights[d]) * (1 - v);
  };
  const vertices = [], colors = [], indices = [];
  for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
    const x = minX + ix * cell, z = minZ + iz * cell;
    const y = heights[iz * (nx + 1) + ix];
    vertices.push(x, y, z);
    const high = THREE.MathUtils.clamp((y - 800) / 500, 0, 1);
    const variation = 0.96 + 0.04 * Math.sin(x * 0.014 + z * 0.011);
    const color = new THREE.Color(0x537144).lerp(new THREE.Color(0x96917b), high).multiplyScalar(variation);
    colors.push(color.r, color.g, color.b);
    if (iz < nz && ix < nx) {
      const a = iz * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.name = 'AlpeDHuezContinuousMassif'; mesh.receiveShadow = true;
  group.add(mesh);
  const populateForest = (getChunkForDist, quality) => {
    const spacing = quality === 'eco' ? 58 : quality === 'ultra' ? 34 : 44;
    const groups = new Map();
    for (let z = minZ + margin; z < minZ + nz * cell - margin; z += spacing) {
      for (let x = minX + margin; x < minX + nx * cell - margin; x += spacing) {
        const px = x + Math.sin(z * 0.07 + x) * spacing * 0.3;
        const pz = z + Math.cos(x * 0.09 + z) * spacing * 0.3;
        let nearest = samples[0], d2 = Infinity;
        for (const p of samples) {
          const d = (p.x - px) ** 2 + (p.z - pz) ** 2;
          if (d < d2) { d2 = d; nearest = p; }
        }
        const y = heightAt(px, pz), altitude = points[0].ele + y;
        if (d2 < 38 ** 2 || d2 > 280 ** 2 || altitude > 1700 || y < 3) continue;
        if (altitude > 1450 && Math.sin(px * 0.4 + pz) > -0.2) continue;
        const chunk = getChunkForDist(nearest.dist);
        if (!groups.has(chunk)) groups.set(chunk, []);
        const cluster = altitude < 1300 ? 4 : 3;
        for (let k = 0; k < cluster; k++) {
          const a = k * 2.4 + px * 0.2;
          const tx = px + Math.cos(a) * (4 + k * 3), tz = pz + Math.sin(a) * (4 + k * 3);
          groups.get(chunk).push({ x: tx, y: heightAt(tx, tz), z: tz, deciduous: altitude < 1300 });
        }
      }
    }
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 4, 5); trunkGeo.translate(0, 2, 0);
    const pineGeo = new THREE.ConeGeometry(2.6, 8, 7); pineGeo.translate(0, 6, 0);
    const leafGeo = new THREE.IcosahedronGeometry(3.2, 1); leafGeo.translate(0, 6.4, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x66503c, roughness: 1 });
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x254d32, roughness: 1, flatShading: true });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x416737, roughness: 1, flatShading: true });
    const dummy = new THREE.Object3D();
    let count = 0;
    for (const [chunk, trees] of groups) {
      for (const [geometry, material, selected] of [
        [trunkGeo, trunkMat, trees], [pineGeo, pineMat, trees.filter(p => !p.deciduous)],
        [leafGeo, leafMat, trees.filter(p => p.deciduous)]
      ]) {
        if (!selected.length) continue;
        const mesh = new THREE.InstancedMesh(geometry, material, selected.length);
        mesh.name = 'AlpeMassifForest'; mesh.userData.sceneryKind = 'tree';
        selected.forEach((p, i) => {
          dummy.position.set(p.x, p.y - 0.2, p.z);
          dummy.rotation.y = p.x + p.z;
          dummy.scale.setScalar(0.85 + 0.2 * Math.sin(p.x * p.z));
          dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.computeBoundingSphere(); chunk.add(mesh);
      }
      count += trees.length;
    }
    group.userData.alpeForestTrees = count;
  };
  return { heightAt, populateForest };
}

export function createAlpeHorizonRidges(group, cx, cz, radius) {
  const vertices = [], colors = [], indices = [];
  const segments = 96;
  for (let ring = 0; ring < 3; ring++) for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2;
    const ridge = 1600 + 360 * Math.sin(a * 7 + 1) + 260 * Math.sin(a * 13) + 160 * Math.cos(a * 23);
    const r = radius + [450, 1500, 2700][ring] + Math.sin(a * 11) * 100;
    const y = ring === 0 ? -16 : ring === 1 ? ridge * 0.36 : ridge;
    vertices.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
    const color = new THREE.Color(y > 1700 ? 0xe2e6e0 : y > 1100 ? 0x8a918e : 0x5b6f5e);
    colors.push(color.r, color.g, color.b);
    if (ring < 2 && i < segments) {
      const b = ring * (segments + 1) + i, c = b + segments + 1;
      indices.push(b, b + 1, c, b + 1, c + 1, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  mesh.name = 'AlpeHorizonRidges'; group.add(mesh);
}
