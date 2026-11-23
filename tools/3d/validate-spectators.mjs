import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import validator from 'gltf-validator';
import { AnimationMixer, Box3, LoopOnce } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../grafika/kibice');
const models=JSON.parse(await fs.readFile(path.join(dir,'modele.json'),'utf8'));
const results=[];
for(const {file} of models){
  const bytes=await fs.readFile(path.join(dir,file));
  const report=await validator.validateBytes(new Uint8Array(bytes),{uri:file,maxIssues:30});
  assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues.messages));
  assert.equal(report.issues.numWarnings,0,JSON.stringify(report.issues.messages));
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  // Node checks the embedded image structure with gltf-validator above. Actual
  // image decoding and UV/material preservation are verified in the browser.
  const loader=new GLTFLoader().register(()=>({name:'GeometryOnlyValidation',loadTexture:()=>Promise.resolve(null)}));
  const gltf=await loader.parseAsync(buffer,'');
  const fans=gltf.scene.children.filter(c=>c.name.startsWith('Kibic_'));
  assert.equal(fans.length,1,'Supporter root');
  assert.equal(gltf.animations.length,1,'One portable scene clip');
  const clip=gltf.animations[0];
  assert.ok(Math.abs(clip.duration-3)<1e-5,'Three second loop');
  let moving=0;
  for(const track of clip.tracks){
    const n=track.getValueSize();
    for(let i=0;i<n;i++){
      assert.ok(Math.abs(track.values[i]-track.values.at(-n+i))<1e-5,`Loop seam: ${track.name}`);
    }
    if(track.values.some((v,i)=>Math.abs(v-track.values[i%n])>1e-4))moving++;
  }
  assert.ok(moving>0,'Exported motion');
  const mixer=new AnimationMixer(gltf.scene);
  mixer.clipAction(clip).setLoop(LoopOnce,1).play();
  const bounds=[];
  for(const t of [0,.25,.5,.75,1,1.5,2,2.5,2.99]){
    mixer.setTime(t); gltf.scene.updateMatrixWorld(true);
    for(const fan of fans){
      const b=new Box3().setFromObject(fan);
      assert.ok(b.min.y>=-1e-4,`Below ground at ${t}: ${fan.name}`);
      assert.ok(b.max.y<3.1,'Metre scale');
      if(t===0)assert.ok(Math.abs(b.min.y)<1e-4,'Soles grounded at rest');
      if(t===0)bounds.push({name:fan.name,min:b.min.toArray(),max:b.max.toArray()});
    }
  }
  const b=new Box3().setFromObject(fans[0]);
  assert.ok(b.min.x<0&&b.max.x>0,'Single model centred around local origin');
  const row={file,bytes:bytes.length,errors:0,warnings:0,duration:clip.duration,movingTracks:moving,bounds};
  results.push(row);
  console.log(JSON.stringify({...row,bounds:undefined}));
}
await fs.writeFile(path.join(dir,'walidacja.json'),JSON.stringify(results,null,2)+'\n');
