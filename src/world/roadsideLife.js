import * as THREE from 'three';

// Dimensions include every accessory. All objects fit on the existing 6.4 m verge.
export const ROADSIDE_OBJECTS = {
  fountain: { width: 1.5, depth: 1.8, context: 'village' },
  camper: { width: 2.4, depth: 5.8, context: 'stop' },
  pasture: { width: 3.4, depth: 6.4, context: 'meadow' },
  'bus-stop': { width: 2.0, depth: 4.0, context: 'village' },
  cafe: { width: 3.4, depth: 5.4, context: 'village' },
  picnic: { width: 3.0, depth: 3.8, context: 'stop' },
  repair: { width: 2.0, depth: 2.4, context: 'village' },
  shrine: { width: 2.1, depth: 2.1, context: 'stop' },
  shed: { width: 3.2, depth: 4.0, context: 'village' },
  'stream-bridge': { width: 5.0, depth: 4.0, context: 'meadow' },
  'rockfall-net': { width: 1.7, depth: 5.4, context: 'mountain' },
  'ski-lift': { width: 2.8, depth: 14.0, context: 'mountain' },
  'parked-car': { width: 2.0, depth: 4.4, context: 'stop' },
  'trail-sign': { width: 1.0, depth: 1.8, context: 'stop' },
  'pass-sign': { width: 1.0, depth: 2.0, context: 'summit' },
};

export function createRoadsideKit() {
  const geometries = new Map(), materials = new Map(), textures = new Set();
  const geometry = (name, factory) => {
    if (!geometries.has(name)) geometries.set(name, factory());
    return geometries.get(name);
  };
  const material = (name, color, options = {}) => {
    if (!materials.has(name)) {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...options });
      mat.name = `Roadside_${name}`; materials.set(name, mat);
    }
    return materials.get(name);
  };
  const stone = () => material('stone', 0xb2a58e);
  const wood = () => material('wood', 0x896345);
  const darkWood = () => material('darkWood', 0x563f2d);
  const metal = () => material('metal', 0x50645e, { metalness: 0.4 });
  const cream = () => material('cream', 0xeee7d7);
  const green = () => material('green', 0x234c3b);
  const yellow = () => material('yellow', 0xefc84b);
  const rubber = () => material('rubber', 0x303832);
  const glass = () => material('glass', 0x527986, { roughness: 0.25, metalness: 0.3 });
  const water = () => material('water', 0x539eae, { roughness: 0.23, metalness: 0.35 });
  const mesh = (parent, geo, mat, size, position) => {
    const part = new THREE.Mesh(geo, mat);
    part.scale.set(...size); part.position.set(...position); parent.add(part); return part;
  };
  const box = (p, mat, size, pos) => mesh(p, geometry('box', () => new THREE.BoxGeometry(1, 1, 1)), mat, size, pos);
  const cylinder = (p, mat, radius, height, pos) => mesh(p,
    geometry('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 12)), mat, [radius, height, radius], pos);
  const ball = (p, mat, size, pos) => mesh(p,
    geometry('ball', () => new THREE.SphereGeometry(1, 12, 8)), mat, size, pos);
  const beam = (p, mat, a, b, radius = 0.035) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const part = cylinder(p, mat, radius, start.distanceTo(end), start.clone().add(end).multiplyScalar(0.5).toArray());
    part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize()); return part;
  };
  const slab = (p, width, depth) => {
    // Deep skirts conceal the small transverse slope without floating corners.
    box(p, stone(), [width, 0.7, depth], [0, -0.31, 0]);
  };
  const label = (p, title, pos, width = 0.9, height = 0.35, color = '#234c3b') => {
    const key = `label:${title}:${color}`;
    if (!materials.has(key)) {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 192;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = color; ctx.fillRect(0, 0, 512, 192);
      ctx.strokeStyle = '#f4e9cf'; ctx.lineWidth = 6; ctx.strokeRect(9, 9, 494, 174);
      ctx.fillStyle = '#fff9e9'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.min(64, 435 / Math.max(title.length * 0.6, 1))}px sans-serif`;
      ctx.fillText(title, 256, 96);
      const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
      textures.add(map);
      materials.set(key, new THREE.MeshStandardMaterial({ map, roughness: 0.9 }));
    }
    // Signs face the road: local -X is toward the carriageway on either shoulder.
    const board = mesh(p, geometry('plane', () => new THREE.PlaneGeometry(1, 1)), materials.get(key), [width, height, 1], pos);
    board.rotation.y = -Math.PI / 2; return board;
  };
  const bench = (p, x, z, length = 1.7) => {
    box(p, wood(), [0.42, 0.12, length], [x, 0.48, z]);
    for (const dz of [-length * 0.35, length * 0.35]) box(p, metal(), [0.32, 0.55, 0.09], [x, 0.2, z + dz]);
  };
  const bicycle = (p, x, z) => {
    const wheelGeo = geometry('wheel', () => new THREE.TorusGeometry(0.32, 0.025, 5, 16));
    for (const dz of [-0.55, 0.55]) {
      const wheel = mesh(p, wheelGeo, rubber(), [1, 1, 1], [x, 0.36, z + dz]); wheel.rotation.y = Math.PI / 2;
      beam(p, metal(), [x, 0.36, z + dz - 0.28], [x, 0.36, z + dz + 0.28], 0.009);
    }
    const a = [x, 0.36, z - 0.55], b = [x, 0.38, z + 0.05], c = [x, 0.88, z - 0.15], d = [x, 0.93, z + 0.4], e = [x, 0.36, z + 0.55];
    for (const [u, v] of [[a, b], [b, c], [c, a], [c, d], [d, b], [d, e]]) beam(p, green(), u, v, 0.022);
    box(p, rubber(), [0.17, 0.05, 0.25], [x, 0.97, z - 0.15]);
    beam(p, metal(), [x - 0.22, 1.05, z + 0.4], [x + 0.22, 1.05, z + 0.4], 0.025);
  };
  const streamRibbon = (p, mat, halfWidth, height) => {
    const positions = [], indices = [];
    for (let i = 0; i <= 16; i++) {
      const x = -2.45 + i * 4.9 / 16, center = Math.sin(x * 1.6) * 0.14;
      positions.push(x, height, center - halfWidth, x, height, center + halfWidth);
      if (i < 16) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices); geo.computeVertexNormals();
    // Per-placement deformation needs its own small geometry; it is explicitly disposed with the kit.
    geometries.set(geo.uuid, geo);
    const part = new THREE.Mesh(geo, mat); part.userData.drape = new Float32Array(positions); p.add(part);
  };
  const factories = {
    fountain(p) {
      slab(p, 1.35, 1.6);
      box(p, stone(), [0.48, 1.5, 0.6], [0.35, 0.75, 0]);
      box(p, stone(), [0.66, 0.12, 0.8], [0.35, 1.53, 0]);
      box(p, stone(), [0.82, 0.2, 1.1], [-0.25, 0.28, 0]);
      for (const z of [-0.52, 0.52]) box(p, stone(), [0.86, 0.3, 0.1], [-0.25, 0.45, z]);
      box(p, stone(), [0.1, 0.3, 1.1], [-0.64, 0.45, 0]);
      box(p, water(), [0.66, 0.025, 0.88], [-0.25, 0.43, 0]);
      beam(p, metal(), [0.1, 1.05, 0], [-0.28, 1.05, 0], 0.04);
      beam(p, water(), [-0.28, 1.04, 0], [-0.28, 0.45, 0], 0.012);
    },
    camper(p, variant = 0) {
      slab(p, 2.4, 5.8);
      box(p, cream(), [2.12, 2.15, 3.9], [0, 1.55, -0.65]);
      box(p, cream(), [2.04, 1.48, 1.5], [0, 1.18, 1.95]);
      box(p, cream(), [2.2, 0.4, 1.9], [0, 2.25, 1.25]);
      box(p, green(), [2.14, 0.18, 4.9], [0, 1.0, -0.2]);
      box(p, glass(), [1.72, 0.62, 0.05], [0, 1.64, 2.71]);
      for (const x of [-1.07, 1.07]) {
        box(p, glass(), [0.04, 0.65, 1.05], [x, 1.94, -0.65]);
        box(p, metal(), [0.04, 1.55, 0.7], [x, 1.31, 0.56]);
      }
      for (const x of [-1.0, 1.0]) for (const z of [-1.8, 1.8]) {
        const wheel = cylinder(p, rubber(), 0.38, 0.22, [x, 0.44, z]); wheel.rotation.z = Math.PI / 2;
        const hub = cylinder(p, metal(), 0.18, 0.24, [x, 0.44, z]); hub.rotation.z = Math.PI / 2;
      }
      box(p, rubber(), [2.05, 0.14, 0.15], [0, 0.65, 2.73]);
      for (const x of [-0.75, 0.75]) box(p, yellow(), [0.3, 0.16, 0.06], [x, 0.98, 2.74]);
      box(p, material('roof', 0xc8c6b9), [1.05, 0.17, 1.35], [0, 2.73, -0.8]);
      if (variant % 2) label(p, 'OskiRide', [-1.075, 1.45, -1.4], 0.95, 0.28);
    },
    pasture(p, variant = 0) {
      // Each animal is grounded separately when the pasture is placed.
      for (let i = 0; i < 3; i++) {
        const animal = new THREE.Group(); p.add(animal);
        animal.position.set(i === 1 ? 0.65 : -0.1, 0, -1.6 + i * 1.5);
        animal.rotation.y = i % 2 ? 0.45 : -0.35; animal.userData.groundContact = true;
        const sheep = (variant + i) % 3 !== 0;
        const coat = sheep ? cream() : material('cowBrown', 0x8a5435);
        const bodyY = sheep ? 0.64 : 0.94;
        ball(animal, coat, sheep ? [0.36, 0.32, 0.63] : [0.4, 0.42, 0.85], [0, bodyY, 0]);
        for (const x of [-0.21, 0.21]) for (const z of [-0.36, 0.36]) cylinder(animal, darkWood(), 0.055, bodyY - 0.12, [x, (bodyY - 0.12) / 2, z]);
        ball(animal, sheep ? darkWood() : cream(), [0.22, 0.24, 0.3], [0, bodyY + 0.05, 0.67]);
        for (const x of [-0.22, 0.22]) ball(animal, coat, [0.14, 0.055, 0.09], [x, bodyY + 0.16, 0.66]);
        for (const x of [-0.13, 0.13]) ball(animal, rubber(), [0.027, 0.027, 0.027], [x, bodyY + 0.12, 0.91]);
        if (!sheep) for (const z of [-0.3, 0.3]) ball(animal, cream(), [0.405, 0.3, 0.22], [0, bodyY + 0.03, z]);
      }
      for (const z of [-2.8, 0, 2.8]) box(p, wood(), [0.12, 1.5, 0.13], [-1.35, 0.45, z]);
      for (const y of [0.5, 0.95]) box(p, wood(), [0.09, 0.1, 5.8], [-1.35, y, 0]);
    },
    'bus-stop'(p) {
      slab(p, 1.9, 3.8);
      for (const z of [-1.25, 1.25]) box(p, wood(), [0.13, 2.4, 0.13], [0.65, 1.2, z]);
      box(p, darkWood(), [0.12, 1.8, 2.65], [0.72, 1.2, 0]);
      box(p, green(), [1.9, 0.18, 3.05], [0, 2.48, 0]);
      bench(p, 0.32, 0, 2.0);
      box(p, cream(), [0.02, 0.65, 0.43], [0.645, 1.65, -0.7]);
      for (let i = 0; i < 6; i++) box(p, metal(), [0.023, 0.018, 0.32], [0.63, 1.87 - i * 0.08, -0.7]);
      cylinder(p, metal(), 0.045, 2.8, [-0.6, 1.4, 1.62]);
      box(p, yellow(), [0.06, 0.55, 0.55], [-0.6, 2.35, 1.62]);
      label(p, 'BUS', [-0.64, 2.35, 1.62], 0.48, 0.45);
    },
    cafe(p) {
      slab(p, 3.3, 4.9);
      for (const z of [-1.3, 1.25]) {
        cylinder(p, wood(), 0.55, 0.08, [0, 0.83, z]);
        cylinder(p, metal(), 0.06, 0.78, [0, 0.43, z]);
        for (const x of [-0.88, 0.88]) {
          box(p, wood(), [0.38, 0.07, 0.42], [x, 0.46, z]);
          box(p, wood(), [0.07, 0.48, 0.42], [x + Math.sign(x) * 0.18, 0.72, z]);
          for (const dz of [-0.15, 0.15]) for (const dx of [-0.12, 0.12]) cylinder(p, metal(), 0.02, 0.46, [x + dx, 0.23, z + dz]);
        }
        cylinder(p, metal(), 0.035, 2.25, [0, 1.15, z]);
        const parasol = mesh(p, geometry('parasol', () => new THREE.ConeGeometry(1, 1, 8)), yellow(), [1.0, 0.38, 1.0], [0, 2.3, z]);
        parasol.rotation.y = Math.PI / 8;
        for (const dx of [-0.2, 0.2]) cylinder(p, cream(), 0.06, 0.12, [dx, 0.93, z]);
      }
      bicycle(p, 1.35, 0);
      box(p, darkWood(), [0.12, 1.0, 0.6], [-1.25, 0.55, 0]);
      label(p, 'Kawa i ciasto', [-1.32, 0.62, 0], 0.53, 0.6);
    },
    picnic(p) {
      slab(p, 2.9, 3.7);
      box(p, wood(), [0.72, 0.12, 1.9], [0, 0.82, -0.5]);
      for (const z of [-1.15, 0.15]) box(p, darkWood(), [0.62, 0.85, 0.12], [0, 0.38, z]);
      for (const x of [-0.8, 0.8]) bench(p, x, -0.5);
      for (const z of [0.95, 1.65]) box(p, wood(), [0.1, 1.8, 0.1], [0.75, 0.85, z]);
      box(p, wood(), [0.12, 0.65, 1.18], [0.75, 1.5, 1.28]);
      label(p, 'Panorama', [0.68, 1.56, 1.28], 1.0, 0.45);
    },
    repair(p) {
      slab(p, 1.9, 2.3);
      box(p, green(), [0.24, 1.5, 0.3], [0.35, 0.78, -0.65]);
      beam(p, metal(), [-0.2, 1.5, -0.65], [0.65, 1.5, -0.65], 0.055);
      for (let i = 0; i < 3; i++) {
        beam(p, rubber(), [0.3, 1.2, -0.85 + i * 0.18], [0.05, 0.6, -0.85 + i * 0.18], 0.01);
        beam(p, metal(), [0.05, 0.6, -0.85 + i * 0.18], [-0.06, 0.48, -0.85 + i * 0.18], 0.03);
      }
      cylinder(p, yellow(), 0.07, 0.7, [-0.55, 0.38, -0.7]);
      beam(p, metal(), [-0.75, 0.77, -0.7], [-0.35, 0.77, -0.7], 0.03);
      box(p, rubber(), [0.32, 0.06, 0.22], [-0.55, 0.07, -0.7]);
      bicycle(p, 0.25, 0.35);
    },
    shrine(p) {
      slab(p, 1.7, 1.7);
      box(p, stone(), [0.8, 0.9, 0.85], [0.2, 0.5, 0]);
      box(p, cream(), [0.7, 0.85, 0.75], [0.2, 1.35, 0]);
      box(p, darkWood(), [0.03, 0.55, 0.42], [-0.16, 1.38, 0]);
      box(p, yellow(), [0.04, 0.4, 0.06], [-0.18, 1.4, 0]);
      box(p, yellow(), [0.04, 0.06, 0.24], [-0.18, 1.48, 0]);
      mesh(p, geometry('roof', () => new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4)), darkWood(), [0.72, 0.48, 0.72], [0.2, 1.99, 0]);
    },
    shed(p) {
      slab(p, 3.1, 3.9);
      box(p, wood(), [2.6, 2.0, 2.6], [0, 1.03, -0.45]);
      for (let i = 0; i < 10; i++) box(p, darkWood(), [0.035, 1.95, 0.035], [-1.315, 1.0, -1.65 + i * 0.26]);
      box(p, darkWood(), [0.03, 1.65, 1.0], [-1.32, 0.86, -0.45]);
      mesh(p, geometry('roof', () => new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4)), material('slate', 0x69736c), [2.1, 0.8, 2.1], [0, 2.4, -0.45]);
      for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) {
        const log = cylinder(p, darkWood(), 0.13, 0.9, [-0.55 + i * 0.29 + row * 0.14, 0.17 + row * 0.24, 1.37]); log.rotation.x = Math.PI / 2;
        const end = cylinder(p, wood(), 0.105, 0.025, [-0.55 + i * 0.29 + row * 0.14, 0.17 + row * 0.24, 1.83]); end.rotation.x = Math.PI / 2;
      }
    },
    // Miniatures retained for the archived prop gallery; route scenery uses landscapeFeatures.
    'stream-bridge'(p) {
      // A roadside footbridge over a shallow channel; the riding surface is untouched.
      streamRibbon(p, material('riverbed', 0x777c67), 0.47, 0.025);
      streamRibbon(p, water(), 0.31, 0.042);
      for (const z of [-0.62, 0.62]) for (const x of [-2.1, -1.3, 1.3, 2.1]) {
        const pebble = new THREE.Group(); pebble.position.set(x, 0, z); pebble.userData.groundContact = true; p.add(pebble);
        ball(pebble, stone(), [0.26, 0.16, 0.19], [0, 0.08, 0]);
      }
      for (const z of [-1.05, 1.05]) box(p, stone(), [1.2, 1.1, 0.75], [0, -0.15, z]);
      box(p, stone(), [1.25, 0.14, 2.6], [0, 0.48, 0]);
      for (const x of [-0.66, 0.66]) {
        box(p, stone(), [0.18, 0.42, 2.8], [x, 0.73, 0]);
        box(p, stone(), [0.26, 0.1, 2.9], [x, 0.99, 0]);
      }
    },
    'rockfall-net'(p) {
      const rock = mesh(p, geometry('rock', () => new THREE.DodecahedronGeometry(1, 1)), material('rock', 0x858b7d), [0.62, 2.3, 2.45], [0.25, 1.45, 0]);
      rock.rotation.z = -0.07;
      // Steel lattice sits in front of the rock, not across the roadway.
      for (let z = -2.3; z < 2.4; z += 0.35) beam(p, metal(), [-0.43, 0.2, z], [-0.43, 3.25, Math.min(z + 1, 2.45)], 0.008);
      for (let z = -2.3; z < 2.4; z += 0.35) beam(p, metal(), [-0.44, 3.25, z], [-0.44, 0.2, Math.min(z + 1, 2.45)], 0.008);
      for (const z of [-2.3, 0, 2.3]) for (const y of [0.3, 3.1]) ball(p, metal(), [0.07, 0.07, 0.07], [-0.48, y, z]);
    },
    'ski-lift'(p) {
      for (const z of [-5.7, 5.7]) {
        box(p, stone(), [0.8, 1.1, 0.8], [0, -0.2, z]);
        cylinder(p, metal(), 0.16, 6.0, [0, 3.0, z]);
        box(p, metal(), [2.6, 0.2, 0.35], [0, 6, z]);
      }
      for (const x of [-1, 1]) {
        beam(p, rubber(), [x, 6.12, -6.6], [x, 6.12, 6.6], 0.025);
        for (const z of [-3.4, 3.4]) {
          beam(p, metal(), [x, 6.12, z], [x, 4.7, z], 0.025);
          box(p, green(), [0.65, 0.1, 0.52], [x, 4.6, z]);
          box(p, green(), [0.65, 0.48, 0.08], [x, 4.88, z + 0.23]);
        }
      }
    },
    'parked-car'(p, variant = 0) {
      slab(p, 2.0, 4.4);
      const paint = material(`car${variant % 2}`, variant % 2 ? 0xd2b65e : 0x497365);
      box(p, paint, [1.75, 0.65, 3.85], [0, 0.7, 0]);
      box(p, paint, [1.5, 0.63, 2.1], [0, 1.31, -0.2]);
      box(p, glass(), [1.35, 0.48, 0.035], [0, 1.3, 0.87]);
      for (const x of [-0.76, 0.76]) box(p, glass(), [0.035, 0.45, 1.75], [x, 1.35, -0.2]);
      for (const x of [-0.85, 0.85]) for (const z of [-1.25, 1.25]) {
        const wheel = cylinder(p, rubber(), 0.3, 0.18, [x, 0.35, z]); wheel.rotation.z = Math.PI / 2;
      }
      for (const x of [-0.6, 0.6]) box(p, yellow(), [0.32, 0.17, 0.04], [x, 0.82, 1.95]);
    },
    'trail-sign'(p) {
      cylinder(p, wood(), 0.07, 2.6, [0.2, 1.0, 0]);
      box(p, yellow(), [0.09, 0.28, 1.5], [0.2, 2.05, 0]);
      label(p, 'Szlak widokowy →', [0.145, 2.05, 0], 1.35, 0.24);
      box(p, green(), [0.09, 0.28, 1.25], [0.2, 1.67, 0.12]);
      label(p, '← Cycle route', [0.145, 1.67, 0.12], 1.15, 0.24);
    },
    'pass-sign'(p, variant, title = 'Mountain pass') {
      for (const z of [-0.72, 0.72]) cylinder(p, metal(), 0.045, 2.1, [0.25, 0.9, z]);
      box(p, cream(), [0.08, 0.65, 1.9], [0.25, 1.75, 0]);
      label(p, title, [0.2, 1.75, 0], 1.8, 0.55);
    },
  };
  return {
    resources: { geometries, materials, textures },
    clear() { geometries.clear(); materials.clear(); textures.clear(); },
    create(kind, variant = 0, title) {
      if (!factories[kind]) throw new Error(`Unknown roadside object: ${kind}`);
      const object = new THREE.Group(); object.name = `Roadside_${kind}`;
      object.userData.roadsideType = kind; factories[kind](object, variant, title); return object;
    },
    drape(object, groundAt) {
      object.traverse(part => {
        const source = part.userData.drape;
        if (!source) return;
        const positions = part.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const vertex = new THREE.Vector3(source[i * 3], 0, source[i * 3 + 2]).applyMatrix4(part.matrixWorld);
          positions.setY(i, source[i * 3 + 1] + groundAt(vertex.x, vertex.z).y - object.position.y);
        }
        positions.needsUpdate = true;
        part.geometry.computeVertexNormals(); part.geometry.computeBoundingBox(); part.geometry.computeBoundingSphere();
      });
    },
    dispose() {
      for (const geo of geometries.values()) geo.dispose();
      for (const mat of materials.values()) mat.dispose();
      for (const texture of textures) texture.dispose();
      geometries.clear(); materials.clear(); textures.clear();
    },
  };
}

export function populateRoadsideLife({ samples, points, totalDistanceM, roadWidth, quality,
  anchors, climbs, isInsideTunnel, getGroundY, add, getChunk, kit }) {
  const stats = { counts: {}, placements: [], skipped: 0 };
  if (totalDistanceM < 300) return stats;
  const isAlpe = points.routeId === 'alpedhuez';
  const maxObjects = quality === 'eco' ? 22 : quality === 'ultra' ? 65 : 42;
  const sampleAt = d => samples[Math.min(samples.length - 1, Math.max(0, Math.round(d / totalDistanceM * (samples.length - 1))))];
  const tryPlace = (kind, target, index, title, preferredSide) => {
    if (stats.placements.length >= maxObjects) return false;
    const object = kit.create(kind, index, title);
    const localBounds = new THREE.Box3().setFromObject(object);
    // No part, including parasols, roofs and fences, may extend off the terrace.
    const radiusX = Math.max(Math.abs(localBounds.min.x), Math.abs(localBounds.max.x));
    const radiusZ = Math.max(Math.abs(localBounds.min.z), Math.abs(localBounds.max.z));
    for (const shift of [0, 12, -12, 25, -25, 42, -42]) {
      const d = target + shift;
      if (d < 65 || d > totalDistanceM - 65) continue;
      if ([d - radiusZ, d, d + radiusZ].some(isInsideTunnel)) continue;
      const s = sampleAt(d);
      if (Math.abs(s.tangent.y) > 0.145) continue;
      // Long objects need straight ground, not a chord cutting a hairpin.
      const before = sampleAt(d - radiusZ - 2), after = sampleAt(d + radiusZ + 2);
      if (before.rawRight.dot(after.rawRight) < 0.985) continue;
      const firstSide = preferredSide || (index % 2 ? -1 : 1);
      for (const side of [firstSide, -firstSide]) {
        const offset = side * (roadWidth / 2 + 3.15);
        const bank = side < 0 ? s.bankHeight || 0 : -(s.bankHeight || 0);
        object.position.copy(s.pt).addScaledVector(s.roadEdgeRight || s.rawRight, offset);
        object.position.y = getGroundY(s.pt.y, offset, roadWidth, 0, bank);
        // Local +X points away from the road, +Z along it (or against it on the other shoulder).
        object.rotation.y = Math.atan2((s.roadEdgeRight || s.rawRight).z * -side, (s.roadEdgeRight || s.rawRight).x * side);
        // Reject terrace overhangs by measuring every corner against nearby route samples.
        const groundAt = (x, z) => {
          let closest = s, best = Infinity;
          const center = s.idx;
          for (let j = Math.max(0, center - 7); j <= Math.min(samples.length - 1, center + 7); j++) {
            const q = samples[j], dx = x - q.x, dz = z - q.z;
            const along = dx * q.tangent.x + dz * q.tangent.z;
            if (Math.abs(along) < best) { best = Math.abs(along); closest = q; }
          }
          const right = closest.roadEdgeRight || closest.rawRight;
          const lateral = (x - closest.x) * right.x + (z - closest.z) * right.z;
          const along = (x - closest.x) * closest.tangent.x + (z - closest.z) * closest.tangent.z;
          const roadY = closest.y + along * closest.tangent.y;
          return { lateral, y: getGroundY(roadY, lateral, roadWidth, 0, lateral < 0 ? closest.bankHeight || 0 : -(closest.bankHeight || 0)) };
        };
        object.updateMatrixWorld(true);
        const cornerHeights = [];
        let fits = true;
        for (const x of [-radiusX, radiusX]) for (const z of [-radiusZ, radiusZ]) {
          const v = new THREE.Vector3(x, 0, z).applyMatrix4(object.matrixWorld);
          const ground = groundAt(v.x, v.z); cornerHeights.push(ground.y);
          if (Math.abs(ground.lateral) > roadWidth / 2 + 6.2 || Math.abs(ground.lateral) < roadWidth / 2 + 0.4) fits = false;
        }
        // Plinths are 0.7 m deep. Avoid hiding them in, or suspending them over, steep terrain.
        if (!fits || Math.max(...cornerHeights) - Math.min(...cornerHeights) > 0.58) continue;
        object.position.y = Math.max(...cornerHeights) + 0.015;
        object.updateMatrixWorld(true);
        for (const child of object.children) if (child.userData.groundContact) {
          child.position.y = 0;
          const v = child.getWorldPosition(new THREE.Vector3());
          child.position.y = groundAt(v.x, v.z).y - object.position.y;
        }
        kit.drape(object, groundAt);
        object.userData.distanceM = d;
        if (!add(getChunk(d), object, 'roadside-life')) continue;
        stats.counts[kind] = (stats.counts[kind] || 0) + 1;
        stats.placements.push({ kind, distanceM: d, offset, position: object.position.toArray(), rotationY: object.rotation.y });
        return true;
      }
    }
    stats.skipped++; return false;
  };

  // Village details follow accepted houses, rather than placing shops in empty fields.
  const villageKinds = ['fountain', 'bus-stop', 'cafe', 'repair', 'shed'];
  for (let i = 0; i < anchors.length; i++) {
    tryPlace(villageKinds[i % villageKinds.length], anchors[i].distanceM + (i % 2 ? -14 : 14), i, undefined, anchors[i].side);
  }
  // Generic GPX and synthetic routes have illustrative scenery. Alpe keeps its known landmarks.
  if (!isAlpe) {
    // Streams and ski lifts need hillside-scale placement, not roadside prop slots.
    const kinds = ['camper', 'pasture', 'picnic', 'shrine', 'parked-car', 'trail-sign'];
    const stations = Math.min(Math.floor(totalDistanceM / (quality === 'eco' ? 400 : 270)), 35);
    for (let i = 0; i < stations; i++) {
      const kind = kinds[i % kinds.length];
      const target = 160 + (totalDistanceM - 320) * (i + 0.5) / stations;
      if (kind === 'pasture' && anchors.some(a => Math.abs(a.distanceM - target) < 30)) continue;
      tryPlace(kind, target, i);
    }
    let minElevation = Infinity, maxElevation = -Infinity;
    for (const point of points) { minElevation = Math.min(minElevation, point.ele); maxElevation = Math.max(maxElevation, point.ele); }
    const elevationRange = maxElevation - minElevation;
    if (elevationRange > 100) {
      for (let i = 0; i < Math.min(3, climbs.length); i++) tryPlace('rockfall-net', climbs[i].startDist + 100, i);
    }
    for (const [index, climb] of climbs.entries()) {
      tryPlace('pass-sign', climb.endDist + 32, index, `Summit · ${Math.round(climb.endEle)} m`);
    }
  }
  return stats;
}
