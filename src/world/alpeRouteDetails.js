import * as THREE from 'three';

// Shared geometry/materials keep the added detail eligible for sector batching.
// These are illustrative Alpine details, not surveyed copies of named premises.
export function createAlpeDetailKit(quality = 'medium', { locale = 'fr', alpine = true } = {}) {
  const eco = quality === 'eco';
  const french = locale === 'fr';
  const material = (name, color) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9 }); m.name = name; return m;
  };
  const wood = material('AlpeDetailTimber', 0x856244);
  const cream = material('AlpeWindowFrames', 0xe8dfcd);
  const green = material('AlpeShutters', alpine ? 0x3f6657 : 0x696e46);
  const glass = material('AlpeWindowGlass', 0x4b6b78);
  glass.roughness = 0.2;
  glass.metalness = 0.6;
  glass.envMapIntensity = 1.5;
  glass.emissive.setHex(0xfef08a);
  glass.emissiveIntensity = 0.06;
  const smokeMat = new THREE.MeshLambertMaterial({
    name: 'AlpeChimneySmoke',
    color: 0xe2e8f0,
    emissive: 0x94a3b8,
    emissiveIntensity: 0.22,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
  });
  const smokeGeo = new THREE.SphereGeometry(0.26, 8, 8);
  const chimneySmokes = [];
  const stone = material('AlpeDetailStone', 0xb0a18a);
  const clay = material('AlpePlanterClay', 0xa26846);
  const leaves = material('AlpeShrub', 0x526b37);
  const flower = material('AlpeFlowers', 0xb85569);
  const orange = material('DutchCornerOrange', 0xf17d21);
  const metal = material('AlpeDetailMetal', 0x7b8586);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const pane = new THREE.PlaneGeometry(1, 1);
  const foliage = new THREE.IcosahedronGeometry(1, 0);
  const potGeo = new THREE.CylinderGeometry(0.3, 0.22, 0.45, 8);
  const addBox = (group, mat, size, pos) => {
    const mesh = new THREE.Mesh(box, mat); mesh.scale.set(...size); mesh.position.set(...pos); group.add(mesh); return mesh;
  };
  const window = (parent, x, y, z, width, height, shutters = true, angle = 0) => {
    const group = new THREE.Group(); group.position.set(x, y, z); group.rotation.y = angle;
    const sheet = new THREE.Mesh(pane, glass); sheet.scale.set(width, height, 1); group.add(sheet);
    for (const dx of [-width / 2, width / 2]) addBox(group, cream, [0.065, height + 0.12, 0.07], [dx, 0, 0.02]);
    for (const dy of [-height / 2, height / 2]) addBox(group, cream, [width + 0.12, 0.065, 0.07], [0, dy, 0.02]);
    if (!eco) {
      addBox(group, cream, [0.04, height, 0.045], [0, 0, 0.035]);
      addBox(group, cream, [width, 0.04, 0.045], [0, 0, 0.035]);
    }
    if (shutters) for (const side of [-1, 1]) {
      addBox(group, green, [width * 0.32, height + 0.08, 0.07], [side * width * 0.73, 0, 0.025]);
      if (!eco) for (const dy of [-0.25, 0.25]) addBox(group, wood,
        [width * 0.32, 0.035, 0.03], [side * width * 0.73, dy * height, 0.075]);
    }
    parent.add(group);
  };
  const balcony = (parent, y, front, width = 2.8, depth = 0.45, entry = false) => {
    addBox(parent, wood, [width, 0.12, depth], [0, y, front + depth / 2]);
    if (entry) for (const side of [-1, 1]) addBox(parent, wood,
      [(width - 0.95) / 2, 0.09, 0.08], [side * (width + 0.95) / 4, y + 0.85, front + depth]);
    else addBox(parent, wood, [width, 0.09, 0.08], [0, y + 0.85, front + depth]);
    const posts = eco ? 4 : 8;
    for (let i = 0; i <= posts; i++) {
      const x = -width / 2 + width * i / posts;
      if (!entry || Math.abs(x) >= 0.48) addBox(parent, wood, [0.055, 0.8, 0.055], [x, y + 0.43, front + depth]);
    }
    for (const side of [-1, 1]) addBox(parent, wood, [0.07, 0.09, depth],
      [side * width / 2, y + 0.85, front + depth / 2]);
  };
  const planter = (parent, x, z) => {
    const pot = new THREE.Mesh(potGeo, clay); pot.position.set(x, 0.225, z); parent.add(pot);
    const crown = new THREE.Mesh(foliage, leaves); crown.scale.set(0.4, 0.28, 0.4); crown.position.set(x, 0.55, z); parent.add(crown);
    if (!eco) for (let i = 0; i < 3; i++) {
      const bloom = new THREE.Mesh(foliage, flower); bloom.scale.setScalar(0.1);
      bloom.position.set(x + Math.cos(i * 2.1) * 0.23, 0.68, z + Math.sin(i * 2.1) * 0.23); parent.add(bloom);
    }
  };
  const signMaterials = new Map();
  const sign = (parent, title, y, z, width = 2) => {
    if (!signMaterials.has(title)) {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f1e4c8'; ctx.fillRect(0, 0, 512, 128);
      ctx.strokeStyle = '#795b3b'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 502, 118);
      ctx.fillStyle = '#234c3b'; ctx.font = 'bold 42px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(title, 256, 64, 470);
      const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
      signMaterials.set(title, new THREE.MeshStandardMaterial({ map, roughness: 1 }));
    }
    const mesh = new THREE.Mesh(pane, signMaterials.get(title)); mesh.scale.set(width, width / 4, 1); mesh.position.set(0, y, z); parent.add(mesh);
  };
  const decorateHouse = (house, index) => {
    for (const x of [-1.2, 1.2]) window(house, x, 2, 2.415, 0.8, 1.05);
    if (!eco) {
      for (const x of [-1.2, 1.2]) window(house, x, 2, -2.415, 0.8, 1.05, true, Math.PI);
      for (const side of [-1, 1]) window(house, side * 2.815, 2, 0, 0.8, 1.05, true, side * Math.PI / 2);
    }
    addBox(house, wood, [5.65, 0.23, 0.17], [0, 3.4, 2.42]);
    addBox(house, wood, [0.8, 1.85, 0.08], [0, 1.99, 2.43]);
    for (const x of [-2.65, 2.65]) addBox(house, wood, [0.14, 3.5, 0.14], [x, 1.75, 2.42]);
    balcony(house, 1, 2.42, 2.9, 0.6, true);
    for (let i = 0; i < 4; i++) {
      const height = 0.8 - i * 0.2;
      addBox(house, stone, [0.88, height, 0.27], [0, height / 2, 3.14 + i * 0.23]);
    }
    addBox(house, stone, [0.55, 1.5, 0.6], [1.25, 5.75, -0.5]);
    addBox(house, metal, [0.72, 0.13, 0.77], [1.25, 6.52, -0.5]);
    if (!eco) {
      const smokeGroup = new THREE.Group();
      smokeGroup.name = 'ChimneySmokePlume';
      smokeGroup.position.set(1.25, 6.78, -0.5);
      const puffs = [];
      for (let p = 0; p < 3; p++) {
        const puff = new THREE.Mesh(smokeGeo, smokeMat);
        const baseX = p * 0.12;
        const baseY = p * 0.44;
        const baseZ = -p * 0.08;
        const baseScale = 0.85 + p * 0.32;
        puff.position.set(baseX, baseY, baseZ);
        puff.scale.setScalar(baseScale);
        smokeGroup.add(puff);
        puffs.push({ mesh: puff, baseX, baseY, baseZ, baseScale, phase: index * 1.3 + p * 1.1 });
      }
      house.add(smokeGroup);
      chimneySmokes.push(...puffs);
    }
    planter(house, 2.1, 2.9);
    if (index % 3 === 0) sign(house, french ? 'GÎTE DES VIRAGES' : 'FOREST INN', 3, 2.53, 2.1);
    house.userData.alpeDetail = 'house';
  };
  const decorateResort = (building, height, index) => {
    for (let floor = 0; floor < Math.floor(height / 2.7); floor++) {
      for (const x of [-1.15, 1.15]) window(building, x, 1.6 + floor * 2.7, 2.715, 0.65, 1.1, false);
      if (floor > 0 && (!eco || floor === 1)) balcony(building, 0.85 + floor * 2.7, 2.72, 2.8, 0.32);
    }
    addBox(building, wood, [4.65, 0.25, 0.1], [0, height - 0.3, 2.73]);
    if (index % 2 === 0) sign(building, index % 4 ? 'PENSION DES CIMES' : 'CAFÉ DES VIRAGES', 0.85, 2.78, 2.2);
    building.userData.alpeDetail = 'resort';
  };
  const villagePocket = name => {
    const group = new THREE.Group(); group.userData.alpeDetail = 'village';
    // A small stone verge with a bench and planters, kept within the terrace.
    addBox(group, stone, [2.7, 0.12, 4.5], [0, -0.06, 0]);
    addBox(group, wood, [1.6, 0.13, 0.45], [0, 0.5, 0.65]);
    addBox(group, wood, [1.6, 0.55, 0.1], [0, 0.9, 0.85]);
    for (const x of [-0.6, 0.6]) addBox(group, metal, [0.09, 0.5, 0.3], [x, 0.25, 0.65]);
    planter(group, -0.85, -1.4); planter(group, 0.85, -1.4);
    addBox(group, wood, [0.12, 2.4, 0.12], [0.9, 1.1, 1.6]);
    const board = new THREE.Group(); board.position.set(0.9, 1.6, 1.52); sign(board, name, 0, 0, 1.5); group.add(board);
    return group;
  };
  const flag = (dutch = false) => {
    const group = new THREE.Group(); group.userData.alpeDetail = 'dutch-flag';
    addBox(group, metal, [0.06, 4.2, 0.06], [0, 2, 0]);
    const colors = dutch ? [0xae2431, 0xf2ede2, 0x254d86] : [0xf17d21, 0xf17d21, 0xf17d21];
    colors.forEach((color, i) => {
      const geometry = new THREE.PlaneGeometry(1.15, 0.23, 5, 1);
      const p = geometry.attributes.position;
      for (let j = 0; j < p.count; j++) p.setZ(j, Math.sin((p.getX(j) + 0.6) * 7) * 0.08);
      geometry.computeVertexNormals();
      const mat = dutch ? material('DutchFlagStripe', color) : orange; mat.side = THREE.DoubleSide;
      const cloth = new THREE.Mesh(geometry, mat); cloth.position.set(0.58, 3.65 - i * 0.23, 0); group.add(cloth);
    });
    return group;
  };
  const shrub = index => {
    const group = new THREE.Group(); group.userData.alpeDetail = 'verge';
    const crown = new THREE.Mesh(foliage, leaves); crown.scale.set(0.6, 0.45, 0.5); crown.position.y = 0.35; group.add(crown);
    if (index % 2 === 0) {
      const rock = new THREE.Mesh(foliage, stone); rock.scale.set(0.5, 0.24, 0.4); rock.position.set(0.6, 0.12, 0.1); group.add(rock);
    }
    const grass = materialCacheGrass;
    if (!eco) for (let i = 0; i < 3; i++) {
      const stem = new THREE.Mesh(pane, grass); stem.scale.set(0.11, 0.55 + i * 0.08, 1);
      stem.position.set(-0.45 + i * 0.22, 0.27, 0.3); stem.rotation.y = i * 1.2; group.add(stem);
    }
    return group;
  };
  const materialCacheGrass = material('AlpeDryGrass', 0xa49b65); materialCacheGrass.side = THREE.DoubleSide;
  return { decorateHouse, decorateResort, villagePocket, flag, shrub, windowGlassMat: glass, smokeMat, chimneySmokes };
}

export function createAlpeMasonryMaterial() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#817c6e'; ctx.fillRect(0, 0, 512, 256);
  for (let row = 0; row < 5; row++) for (let col = -1; col < 7; col++) {
    const x = col * 86 + (row % 2) * 43, y = row * 53;
    const tone = 149 + ((row * 13 + col * 17 + 47) % 37);
    ctx.fillStyle = `rgb(${tone},${tone - 5},${tone - 18})`;
    ctx.beginPath(); ctx.moveTo(x + 4, y + 6); ctx.lineTo(x + 78, y + 3); ctx.lineTo(x + 82, y + 44);
    ctx.lineTo(x + 8, y + 49); ctx.closePath(); ctx.fill();
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(1, 2);
  const material = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 0.045, roughness: 1, color: 0xd1c8b4 });
  material.name = 'AlpeIrregularMasonry'; return material;
}

export function createAlpeWornRoadMap(baseMap) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'); ctx.drawImage(baseMap.image, 0, 0);
  // Small chips in the existing painted edge lines; the underlying road layout
  // and the continuous rideable surface are unchanged.
  ctx.fillStyle = '#363b40';
  for (let i = 0; i < 65; i++) {
    const x = i % 2 ? 18 : 484, y = (i * 137) % 512;
    ctx.fillRect(x + i % 7, y, 2 + i % 3, 2 + i % 6);
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8; return map;
}

export function addAlpeRoadDetails(getChunk, samples, totalDistanceM, quality, {
  isInsideTunnel = () => false, urbanDistances = null,
} = {}) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, 256, 512);
  ctx.fillStyle = '#343a3d'; ctx.beginPath();
  ctx.moveTo(35, 25); ctx.lineTo(215, 18); ctx.lineTo(234, 190); ctx.lineTo(219, 480);
  ctx.lineTo(22, 489); ctx.lineTo(32, 270); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 380; i++) {
    const x = (i * 73) % 256, y = (i * 137) % 512;
    if (x > 36 && x < 210 && y > 28 && y < 480) { ctx.fillStyle = i % 2 ? '#45494a' : '#2d3336'; ctx.fillRect(x, y, 2, 2); }
  }
  ctx.strokeStyle = '#161c20'; ctx.lineWidth = 2.5; ctx.beginPath();
  ctx.moveTo(105, 45); ctx.lineTo(127, 132); ctx.lineTo(112, 225); ctx.lineTo(151, 322); ctx.lineTo(129, 455);
  ctx.moveTo(112, 225); ctx.lineTo(72, 262); ctx.stroke();
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.1, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  mat.name = 'AlpeRoadRepairs';
  const step = quality === 'eco' ? 410 : quality === 'ultra' ? 180 : 270;
  let count = 0;
  const placements = [];
  for (let d = 180; d < totalDistanceM - 100; d += step) {
    if (isInsideTunnel(d) || isInsideTunnel(d + 15)) continue;
    const start = Math.round(d / totalDistanceM * (samples.length - 1));
    const positions = [], uv = [], indices = [];
    const side = count % 2 ? -1 : 1, middle = side * 1.5;
    for (let k = 0; k <= 4; k++) {
      const s = samples[Math.min(samples.length - 1, start + k)];
      const right = s.roadEdgeRight || s.rawRight;
      for (const edge of [-1, 1]) {
        const offset = middle + edge * 0.65;
        const p = s.pt.clone().addScaledVector(right, offset);
        positions.push(p.x, p.y + 0.066 - s.banking * offset, p.z); uv.push((edge + 1) / 2, k / 4);
      }
      if (k < 4) { const a = k * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mat); mesh.userData.sceneryKind = 'road-detail'; getChunk(d).add(mesh); count++;
    placements.push({ type: 'patch', distanceM: d });
  }
  const lidGeo = new THREE.CircleGeometry(0.3, 16);
  const lidCanvas = document.createElement('canvas'); lidCanvas.width = lidCanvas.height = 128;
  const lidCtx = lidCanvas.getContext('2d'); lidCtx.fillStyle = '#697171'; lidCtx.fillRect(0, 0, 128, 128);
  lidCtx.strokeStyle = '#30393c'; lidCtx.lineWidth = 5;
  for (const radius of [39, 55]) { lidCtx.beginPath(); lidCtx.arc(64, 64, radius, 0, Math.PI * 2); lidCtx.stroke(); }
  for (let x = 35; x < 100; x += 14) { lidCtx.beginPath(); lidCtx.moveTo(x, 37); lidCtx.lineTo(x, 91); lidCtx.stroke(); }
  const lidMap = new THREE.CanvasTexture(lidCanvas); lidMap.colorSpace = THREE.SRGBColorSpace;
  const lidMat = new THREE.MeshStandardMaterial({ map: lidMap, roughness: 0.8 }); lidMat.name = 'AlpeManhole';
  let lids = 0;
  const lidDistances = urbanDistances
    ? urbanDistances.filter((d, i) => i % 2 === 0).map(d => d + 20)
    : Array.from({ length: Math.max(0, Math.ceil((totalDistanceM - 2450) / 1150)) }, (_, i) => 2350 + i * 1150);
  for (const d of lidDistances) {
    if (d < 60 || d >= totalDistanceM - 100 || isInsideTunnel(d)) continue;
    const s = samples[Math.round(d / totalDistanceM * (samples.length - 1))];
    const right = s.roadEdgeRight || s.rawRight, offset = 2.6;
    const lid = new THREE.Mesh(lidGeo, lidMat); lid.position.copy(s.pt).addScaledVector(right, offset);
    lid.position.y += 0.068 - s.banking * offset;
    const normal = new THREE.Vector3().crossVectors(right, s.tangent).normalize();
    lid.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    lid.userData.sceneryKind = 'road-detail'; getChunk(d).add(lid); lids++;
    placements.push({ type: 'manhole', distanceM: d });
  }
  return { patches: count, manholes: lids, placements };
}
