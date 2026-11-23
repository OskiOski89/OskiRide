import * as THREE from 'three';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';
import { clone } from './vendor/addons/utils/SkeletonUtils.js';
import { createCyclistMesh as createBase, animateCyclistMesh as animateBase } from './kinematyka.js?v=20261030-sprint';

export const CYCLIST_DESIGNS = [
  { id: 'velocity', file: 'kolarz-01-velocity.glb', title: 'Velocity' },
  { id: 'alpine', file: 'kolarz-02-alpine.glb', title: 'Alpine' },
  { id: 'nocturne', file: 'kolarz-03-nocturne.glb', title: 'Nocturne' },
  { id: 'heritage', file: 'kolarz-04-heritage.glb', title: 'Heritage' },
];
const loader = new GLTFLoader();
const templates = new Map();
let releasePromise;
const offset = new THREE.Vector3(0, -.022, -.035);
const proxies = {
  Pelvis: a => a.hips, Torso: a => a.torso, Head: a => a.headGroup,
  UpperArmL: a => a.leftArm.upperArm, UpperArmR: a => a.rightArm.upperArm,
  ForearmL: a => a.leftArm.forearm, ForearmR: a => a.rightArm.forearm,
  HandL: a => a.leftArm.glove, HandR: a => a.rightArm.glove,
  ThighL: a => a.leftLeg.thigh, ThighR: a => a.rightLeg.thigh,
  ShinL: a => a.leftLeg.calf, ShinR: a => a.rightLeg.calf,
  ShoeL: a => a.leftLeg.shoe, ShoeR: a => a.rightLeg.shoe,
};
const PBR_SURFACE_TUNING = {
  Frame_Paint: { roughness: 0.18, metalness: 0.44, envMapIntensity: 1.55 },
  Carbon: { roughness: 0.26, metalness: 0.45, envMapIntensity: 1.4 },
  Alloy: { roughness: 0.2, metalness: 0.88, envMapIntensity: 1.65 },
  Shield_Lens: { roughness: 0.08, metalness: 0.82, envMapIntensity: 1.9 },
  Helmet_Shell: { roughness: 0.22, metalness: 0.16, envMapIntensity: 1.3 },
  Shoes_Socks: { envMapIntensity: 0.9 },
  Jersey_Primary: { envMapIntensity: 0.65 },
  Bib_Shorts: { envMapIntensity: 0.6 },
};

export function selectedCyclistDesign() {
  try {
    const stored = localStorage.getItem('oskiride-cyclist-design');
    return CYCLIST_DESIGNS.some(d => d.id === stored) ? stored : 'velocity';
  } catch { return 'velocity'; }
}

function loadTemplate(id) {
  const design = CYCLIST_DESIGNS.find(d => d.id === id) || CYCLIST_DESIGNS[0];
  if (!templates.has(design.id)) {
    // Read a fresh release manifest once per page. Each binary URL contains its
    // content hash, so an older model cannot share its browser cache key.
    releasePromise ??= fetch(new URL('./modele.json', import.meta.url), { cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error('Model manifest unavailable'); return response.json(); })
      .catch(() => []); // Keep a versioned asset URL if the manifest cannot be read.
    templates.set(design.id, releasePromise.then(release => {
      const revision = release.find(item => item.id === design.id)?.revision || 'continuous-shorts-v2';
      const url = new URL(design.file, import.meta.url);
      url.searchParams.set('v', revision);
      return loader.loadAsync(url.href).then(gltf => Object.assign(gltf, { assetRevision: revision, assetURL: url.href }));
    }));
  }
  return templates.get(design.id);
}

function syncVisual(avatar) {
  if (!avatar.visual) return;
  for (const [name, source] of Object.entries(proxies)) {
    const bone = avatar.visual.nodes[name];
    const ref = source(avatar);
    bone.position.copy(ref.position);
    bone.quaternion.copy(ref.quaternion);
  }
  avatar.visual.nodes.Rear_Wheel.rotation.x = avatar.wheelAngle;
  avatar.visual.nodes.Front_Wheel.rotation.x = avatar.wheelAngle;
  // The model's crank starts along +Z. The shared solver decreases pedal phase
  // for forward pedalling, so the visual crank rotates around positive X.
  avatar.visual.nodes.Crankset.rotation.x = -avatar.crankAngle;
  avatar.visual.nodes.PedalL.position.copy(avatar.leftLeg.shoe.position).add(offset);
  avatar.visual.nodes.PedalR.position.copy(avatar.rightLeg.shoe.position).add(offset);
}

export function createCyclistMesh(options = {}) {
  const avatar = createBase(options);
  const initialKitColor = avatar.kitMat.color.clone();
  const initialFrameColor = avatar.frameMat.color.clone();
  avatar.design = options.design || selectedCyclistDesign();
  avatar.visualState = 'loading';
  // Populate the proxies immediately; the legacy model remains a loading fallback.
  animateBase(avatar, 0, 0, 0);
  avatar.ready = loadTemplate(avatar.design).then(gltf => {
    const visual = clone(gltf.scene);
    visual.name = `Cyclist_Visual_${avatar.design}`;
    const nodes = {};
    const materials = new Map();
    const useRiderColors = !options.useDesignPalette && (options.isGhost || options.label);
    visual.traverse(item => {
      if (item.userData.surface) avatar.modelSurface = item.userData.surface;
      if (item.isBone || ['Rear_Wheel','Front_Wheel','Crankset','PedalL','PedalR'].includes(item.name)) nodes[item.name] = item;
      if (!item.isMesh) return;
      item.castShadow = !options.isGhost;
      item.receiveShadow = !options.isGhost;
      if (item.isSkinnedMesh) item.frustumCulled = false;
      const duplicate = material => {
        if (!materials.has(material.uuid)) {
          const copy = material.clone();
          if (options.isGhost) {
            copy.transparent = true; copy.opacity = .42; copy.depthWrite = false;
            copy.emissive.set(options.jerseyColor ?? 0xc084fc); copy.emissiveIntensity = .15;
          } else if (PBR_SURFACE_TUNING[copy.name]) {
            Object.assign(copy, PBR_SURFACE_TUNING[copy.name]);
          }
          if ((useRiderColors || !avatar.kitMat.color.equals(initialKitColor)) && copy.name === 'Jersey_Primary') copy.color.copy(avatar.kitMat.color);
          if ((useRiderColors || !avatar.frameMat.color.equals(initialFrameColor)) && copy.name === 'Frame_Paint') copy.color.copy(avatar.frameMat.color);
          materials.set(material.uuid, copy);
        }
        return materials.get(material.uuid);
      };
      item.material = Array.isArray(item.material) ? item.material.map(duplicate) : duplicate(item.material);
    });
    for (const name of [...Object.keys(proxies),'Rear_Wheel','Front_Wheel','Crankset','PedalL','PedalR']) {
      if (!nodes[name]) throw new Error(`Missing cyclist rig node: ${name}`);
    }
    // Keep the existing headlight and its externally controlled material visible.
    if (avatar.headlightMesh) {
      avatar.group.updateMatrixWorld(true);
      avatar.bikeGroup.attach(avatar.headlightMesh);
    }
    for (const item of avatar.bikeGroup.children) if (item !== avatar.headlightMesh) item.visible = false;
    avatar.bikeGroup.add(visual);
    avatar.visual = { root: visual, nodes };
    avatar.modelRevision = gltf.assetRevision;
    avatar.modelURL = gltf.assetURL;
    for (const material of materials.values()) {
      if (material.name === 'Jersey_Primary') avatar.kitMat = material;
      if (material.name === 'Frame_Paint') avatar.frameMat = material;
    }
    avatar.visualState = 'ready';
    syncVisual(avatar);
    return avatar;
  }).catch(error => {
    avatar.visualState = 'fallback';
    avatar.visualError = error.message;
    console.error('Nie udało się wczytać modelu kolarza:', error);
    return avatar;
  });
  return avatar;
}

// This is the sole motion implementation, shared by all four looks.
export function animateCyclistMesh(avatar, speedMps, cadenceRpm, dt, telemetry) {
  animateBase(avatar, speedMps, cadenceRpm, dt, telemetry);
  syncVisual(avatar);
}
