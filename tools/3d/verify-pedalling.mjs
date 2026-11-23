import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const threeUrl=pathToFileURL(path.join(root,'tools/3d/node_modules/three/build/three.module.js')).href;
const source=(await fs.readFile(path.join(root,'grafika/kinematyka.js'),'utf8')).replace("from 'three'",`from '${threeUrl}'`);
const {createCyclistMesh,animateCyclistMesh}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function riderAt(phase){
  const rider=createCyclistMesh();rider.crankAngle=phase;animateCyclistMesh(rider,0,0,0);return rider;
}
for(const side of ['leftLeg','rightLeg']){
  const front=riderAt(side==='leftLeg'?0:Math.PI);
  const height=front[side].shoe.position.y;
  animateCyclistMesh(front,8,60,.01);
  assert(front[side].shoe.position.y<height,`${side}: pedal in front must descend`);
  const top=riderAt(side==='leftLeg'?Math.PI/2:3*Math.PI/2);
  const forward=top[side].shoe.position.z;
  animateCyclistMesh(top,8,60,.01);
  assert(top[side].shoe.position.z>forward,`${side}: upper pedal must move towards +Z`);
}
const revolution=riderAt(0);
for(let i=0;i<100;i++)animateCyclistMesh(revolution,8,60,.01);
assert(Math.abs(revolution.crankAngle+2*Math.PI)<1e-10,'60 rpm must make one forward revolution per second');
const stopped=revolution.crankAngle;
animateCyclistMesh(revolution,8,0,.1);
assert(Math.abs(revolution.crankAngle-stopped)<1e-12,'Coasting must stop the crank independently of the wheels (within floating-point tolerance)');
assert(revolution.wheelAngle>0,'Wheels must roll forward');

const specs=JSON.parse(await fs.readFile(path.join(root,'grafika/modele.json'),'utf8'));
const io=new NodeIO();
for(const spec of specs){
  const doc=await io.read(path.join(root,'grafika',spec.file));
  const clip=doc.getRoot().listAnimations()[0];
  const shoe=clip.listChannels().find(c=>c.getTargetNode().getName()==='ShoeL'&&c.getTargetPath()==='translation');
  const crank=clip.listChannels().find(c=>c.getTargetNode().getName()==='Crankset'&&c.getTargetPath()==='rotation');
  assert(shoe&&crank,`${spec.id}: missing pedal animation`);
  const shoeValues=shoe.getSampler().getOutput().getArray();
  const crankValues=crank.getSampler().getOutput().getArray();
  assert(shoeValues[4]<shoeValues[1],`${spec.id}: exported front shoe must descend`);
  assert(crankValues[4]>crankValues[0],`${spec.id}: exported crank must rotate around positive X`);
}
console.log(JSON.stringify({forwardPedalling:true,legsTested:2,exportedClipsTested:specs.length,rpm60PeriodSeconds:1,coasting:true}));
