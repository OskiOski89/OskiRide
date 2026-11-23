import * as THREE from 'three';
import { mergeGeometries } from '../../grafika/vendor/addons/utils/BufferGeometryUtils.js';

// Dynamiczne modele zachowują własne hierarchie i miksery animacji.
const DYNAMIC_KINDS = new Set(['spectator','turbine','lake','boat','balloon']);

export function batchStaticScenery(chunks) {
  const stats = {sourceMeshes:0,batches:0,instancedMeshes:0,mergedMeshes:0};
  const inverse = new THREE.Matrix4();
  const transform = new THREE.Matrix4();
  for (const chunk of chunks) {
    chunk.updateWorldMatrix(true,true);
    inverse.copy(chunk.matrixWorld).invert();
    const groups = new Map();
    function visit(object, kind = '') {
      kind = object.userData.sceneryKind || kind;
      if (!object.visible || DYNAMIC_KINDS.has(kind)) return;
      if (object.isMesh && !object.isSkinnedMesh && !object.isInstancedMesh && kind &&
          !Array.isArray(object.material) && !object.material.transparent && !object.morphTargetInfluences?.length) {
        const attrs = Object.entries(object.geometry.attributes).map(([key,a])=>`${key}:${a.itemSize}:${a.normalized}`).sort().join(',');
        const key = `${kind}|${object.material.uuid}|${object.castShadow}|${object.receiveShadow}|${object.renderOrder}|${object.layers.mask}|${Boolean(object.geometry.index)}|${attrs}`;
        if (!groups.has(key)) groups.set(key,{kind,meshes:[]});
        groups.get(key).meshes.push(object);
      }
      for (const child of object.children) visit(child,kind);
    }
    for (const child of chunk.children) visit(child);
    for (const {kind,meshes} of groups.values()) {
      if (meshes.length < 2) continue;
      const first = meshes[0];
      let batch;
      if (meshes.every(mesh=>mesh.geometry===first.geometry)) {
        batch = new THREE.InstancedMesh(first.geometry,first.material,meshes.length);
        for (let i=0;i<meshes.length;i++) {
          transform.multiplyMatrices(inverse,meshes[i].matrixWorld);
          batch.setMatrixAt(i,transform);
        }
        batch.instanceMatrix.needsUpdate=true;
        batch.computeBoundingBox();batch.computeBoundingSphere();
        stats.instancedMeshes+=meshes.length;
      } else {
        const parts=meshes.map(mesh=>{
          transform.multiplyMatrices(inverse,mesh.matrixWorld);
          return mesh.geometry.clone().applyMatrix4(transform);
        });
        const geometry=mergeGeometries(parts,false);
        for (const part of parts) part.dispose();
        if (!geometry) continue;
        geometry.computeBoundingBox();geometry.computeBoundingSphere();
        batch=new THREE.Mesh(geometry,first.material);
        stats.mergedMeshes+=meshes.length;
      }
      batch.name=`Static_${kind}_${stats.batches}`;
      batch.userData.sceneryKind=kind;
      batch.userData.batchedCount=meshes.length;
      batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;
      batch.renderOrder=first.renderOrder;batch.layers.mask=first.layers.mask;
      batch.matrixAutoUpdate=false;
      for (const mesh of meshes) mesh.removeFromParent();
      chunk.add(batch);
      stats.sourceMeshes+=meshes.length;stats.batches++;
    }
  }
  return stats;
}

export function disposeRouteResources(group, retainedTextures = new Set()) {
  // Najpierw odłącz współdzielone modele kibiców: ich cache żyje między trasami.
  group.userData.disposeSpectators?.();
  const geometries=new Set(),materials=new Set(),textures=new Set();
  group.traverse(object=>{
    if (object.isInstancedMesh) object.dispose();
    if (object.geometry) geometries.add(object.geometry);
    for (const material of object.material ? (Array.isArray(object.material)?object.material:[object.material]) : []) {
      materials.add(material);
      for (const value of Object.values(material)) if(value?.isTexture && !retainedTextures.has(value)) textures.add(value);
    }
  });
  // Include templates removed by static batching and unsuccessful placement attempts.
  const roadsideKit = group.userData.roadsideKit;
  if (roadsideKit) {
    for (const geometry of roadsideKit.resources.geometries.values()) geometries.add(geometry);
    for (const material of roadsideKit.resources.materials.values()) materials.add(material);
    for (const texture of roadsideKit.resources.textures) textures.add(texture);
  }
  const landscapeResources = group.userData.landscapeResources;
  if (landscapeResources) {
    for (const geometry of landscapeResources.geometries) geometries.add(geometry);
    for (const material of landscapeResources.materials) materials.add(material);
  }
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
  roadsideKit?.clear();
  landscapeResources?.geometries.clear();
  landscapeResources?.materials.clear();
  group.clear();
  return {geometries:geometries.size,materials:materials.size,textures:textures.size};
}
