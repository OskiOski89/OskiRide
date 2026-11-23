import * as THREE from 'three';
import { GLTFLoader } from '../../grafika/vendor/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from '../../grafika/vendor/addons/utils/BufferGeometryUtils.js';

const templates = new Map();
const loader = new GLTFLoader();
let releasePromise;
const crowdMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: .85, side: THREE.DoubleSide,
});
export const SPECTATOR_DESIGNS = Object.freeze([
  '01-machanie', '02-oklaski', '03-szalik', '04-flaga', '05-doping', '06-kibicka',
  '07-fotograf', '08-dzwonek', '09-bidon', '10-tablica', '11-mlody-kibic', '12-megafon',
]);

// Rigid animation + solid colors: batch surfaces by their animated parent.
// Each person retains the original GLB motion and colors in four to five draw calls.
function batchRigidSurfaces(gltf) {
  const parents = new Map();
  const animatedNames = new Set(gltf.animations.flatMap(clip => clip.tracks.map(
    track => THREE.PropertyBinding.parseTrackName(track.name).nodeName
  )));
  const sourceGeometries = new Set(), sourceMaterials = new Set();
  gltf.scene.traverse(node => {
    if (!node.isMesh) return;
    // Textured surfaces need their original UVs and material.
    if (node.material.map) {
      node.receiveShadow = true;
      return;
    }
    // Exporters can also animate a prop mesh directly. Keep that node and its
    // local transform so its animation binding survives batching.
    const parent = animatedNames.has(node.name) ? node : node.parent;
    if (!parents.has(parent)) parents.set(parent, []);
    parents.get(parent).push(node);
  });
  for (const [parent, meshes] of parents) {
    const parts = meshes.map(item => {
      sourceGeometries.add(item.geometry);
      sourceMaterials.add(item.material);
      const geometry = item.geometry.index ? item.geometry.toNonIndexed() : item.geometry.clone();
      item.updateMatrix();
      if (item !== parent) geometry.applyMatrix4(item.matrix);
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      for (const key of Object.keys(geometry.attributes)) {
        if (!['position', 'normal'].includes(key)) geometry.deleteAttribute(key);
      }
      const color = item.material.color;
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return geometry;
    });
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (meshes.length === 1 && meshes[0] === parent) {
      parent.geometry = geometry;
      parent.material = crowdMaterial;
      parent.receiveShadow = true;
    } else {
      for (const item of meshes) parent.remove(item);
      const mesh = new THREE.Mesh(geometry, crowdMaterial);
      mesh.name = `${parent.name}_Surface`;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
  }
  for (const geometry of sourceGeometries) geometry.dispose();
  for (const material of sourceMaterials) material.dispose();
  return gltf;
}

function loadTemplate(design, theme = '') {
  const key = `${design}:${theme}`;
  if (!templates.has(key)) {
    releasePromise ??= fetch(new URL('../../grafika/kibice/modele.json', import.meta.url), {cache: 'no-store'})
      .then(response => {
        if (!response.ok) throw new Error('Spectator manifest unavailable');
        return response.json();
      });
    templates.set(key, releasePromise.then(release => {
      const entry = release.find(item => item.id === design);
      if (!entry?.revision) throw new Error(`Missing spectator model: ${design}`);
      const url = new URL(`../../grafika/kibice/${design}.glb`, import.meta.url);
      url.searchParams.set('v', entry.revision);
      return loader.loadAsync(url.href);
    }).then(gltf => {
      // Apply team colors to clothes on a separate template.
      if (theme === 'orange') gltf.scene.traverse(node => {
        if (!node.isMesh || node.material.map) return;
        if (/Jacket|Jersey|Hoodie|Cotton|Las|Słońce|Vest/.test(node.material.name)) node.material.color.setHex(0xf17d21);
      });
      return batchRigidSurfaces(gltf);
    }));
  }
  return templates.get(key);
}

const fallbackGeometry = new THREE.CapsuleGeometry(.15, .65, 3, 6);
const fallbackHead = new THREE.SphereGeometry(.13, 8, 6);
const fallbackMaterial = new THREE.MeshStandardMaterial({color: 0xf2c94c});
const fallbackSkin = new THREE.MeshStandardMaterial({color: 0xbb825b});
function showFallback(group) {
  const body = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
  body.position.y = .75;
  const head = new THREE.Mesh(fallbackHead, fallbackSkin);
  head.position.y = 1.4;
  group.add(body, head);
}

export function createSpectator(index, distanceM, quality = 'medium', group = new THREE.Group(), theme = '') {
  const design = SPECTATOR_DESIGNS[index % SPECTATOR_DESIGNS.length];
  group.name = `Spectator_${design}`;
  group.userData.spectatorDesign = design;
  group.userData.crowdTheme = theme;
  const fan = {
    group, design, distanceM, state: 'loading', disposed: false, mixer: null,
    phase: (index * .731) % 3, speed: .93 + (index % 5) * .035,
    dispose() {
      this.disposed = true;
      if (this.mixer) {
        this.mixer.stopAllAction();
        this.mixer.uncacheRoot(this.visual);
        this.mixer = null;
      }
      this.group.clear();
    },
  };
  fan.ready = loadTemplate(design, theme).then(gltf => {
    if (fan.disposed) return fan;
    fan.visual = gltf.scene.clone(true);
    fan.visual.traverse(node => { if (node.isMesh) node.castShadow = quality === 'ultra'; });
    group.add(fan.visual);
    fan.mixer = new THREE.AnimationMixer(fan.visual);
    fan.mixer.clipAction(gltf.animations[0]).play();
    fan.mixer.setTime(fan.phase);
    fan.state = 'ready';
    return fan;
  }).catch(error => {
    if (!fan.disposed) {
      fan.state = 'error';
      showFallback(group);
      console.warn(`Could not load spectator ${design}`, error);
    }
    return fan;
  });
  return fan;
}

export function updateSpectatorVisibility(spectators, currentDistM, quality) {
  const aheadM = quality === 'eco' ? 140 : quality === 'ultra' ? 500 : 300;
  for (const fan of spectators) {
    const delta = fan.distanceM - currentDistM;
    fan.group.visible = !fan.disposed && delta >= -90 && delta <= aheadM;
  }
}

export function animateSpectators(spectators, timeSeconds) {
  for (const fan of spectators) {
    if (!fan.mixer || fan.disposed || !fan.group.visible) continue;
    let visible = true;
    for (let parent = fan.group.parent; parent; parent = parent.parent) {
      if (!parent.visible) { visible = false; break; }
    }
    if (visible) fan.mixer.setTime(timeSeconds * fan.speed + fan.phase);
  }
}
