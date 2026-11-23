// Reproducible, original OskiRide assets. One existing kinematics implementation,
// one flat deformation rig, four visual directions. No external model assets.
import * as T from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NodeIO } from '@gltf-transform/core';
import { dedup, weld, prune, resample } from '@gltf-transform/functions';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'grafika');
const threeUrl = pathToFileURL(path.join(root, 'tools/3d/node_modules/three/build/three.module.js')).href;
const kinSource = (await fs.readFile(path.join(out, 'kinematyka.js'), 'utf8')).replace("from 'three'", `from '${threeUrl}'`);
const kin = await import(`data:text/javascript;base64,${Buffer.from(kinSource).toString('base64')}`);
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(result => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.(); }); }
};
const vec = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const UP = vec(0, 1, 0), TAU = Math.PI * 2;
const specs = [
  { id: 'velocity', number: '01', title: 'Velocity', subtitle: 'Sportowa szosa',
    primary: '#ae4e35', dark: '#20333c', accent: '#e7d8b6', frame: '#e2d8c2',
    helmet: '#f0ebdf', lens: '#2d737e', skin: '#cf9470', rim: .266, helmetStyle: 'race', pattern: 'block' },
  { id: 'alpine', number: '02', title: 'Alpine', subtitle: 'Lekkość na podjazdach',
    primary: '#416c57', dark: '#192f2c', accent: '#dce9af', frame: '#cce0bc',
    helmet: '#dfe9d0', lens: '#ac7236', skin: '#b7805d', rim: .287, helmetStyle: 'vented', pattern: 'sash' },
  { id: 'nocturne', number: '03', title: 'Nocturne', subtitle: 'Aero i głęboki karbon',
    primary: '#263d54', dark: '#101c2a', accent: '#c5a167', frame: '#253646',
    helmet: '#172836', lens: '#a87848', skin: '#d8a383', rim: .239, helmetStyle: 'aero', pattern: 'pinstripe' },
  { id: 'heritage', number: '04', title: 'Heritage', subtitle: 'Klubowy klasyk',
    primary: '#e9e4d8', dark: '#25394c', accent: '#b84b40', frame: '#b84b40',
    helmet: '#e9e4d8', lens: '#417e89', skin: '#986447', rim: .287, helmetStyle: 'classic', pattern: 'bands' },
];
const boneMap = {
  Pelvis: a => a.hips, Torso: a => a.torso, Head: a => a.headGroup,
  UpperArmL: a => a.leftArm.upperArm, UpperArmR: a => a.rightArm.upperArm,
  ForearmL: a => a.leftArm.forearm, ForearmR: a => a.rightArm.forearm,
  HandL: a => a.leftArm.glove, HandR: a => a.rightArm.glove,
  ThighL: a => a.leftLeg.thigh, ThighR: a => a.rightLeg.thigh,
  ShinL: a => a.leftLeg.calf, ShinR: a => a.rightLeg.calf,
  ShoeL: a => a.leftLeg.shoe, ShoeR: a => a.rightLeg.shoe,
};
const boneNames = Object.keys(boneMap);

function pose(a, phase = .55, standing = 0, tuck = 0) {
  a.crankAngle = phase; a.standBlend = standing; a.tuckBlend = tuck;
  kin.animateCyclistMesh(a, 8, 80, 0, { gradePct: 0, watts: 180 });
}

function create(spec) {
  const avatar = kin.createCyclistMesh();
  pose(avatar);
  const model = new T.Group(); model.name = `OskiRide_${spec.title}`;
  model.userData = { design: spec.id, originalAsset: true, coordinateSystem: 'Y-up +Z-forward, metres',
    kinematics: 'grafika/kinematyka.js', sharedRig: 'OskiRide_Rig_v1', surface: 'continuous-shorts-v2', wheelRadius: .34 };
  const mat = (name, color, roughness = .6, metalness = 0) => new T.MeshStandardMaterial({ name, color, roughness, metalness });
  const mats = {
    jersey: mat('Jersey_Primary', spec.primary, .83), bib: mat('Bib_Shorts', spec.dark, .85),
    accent: mat('Kit_Accent', spec.accent, .7), skin: mat('Skin', spec.skin, .78),
    white: mat('Shoes_Socks', '#eeeae1', .66), helmet: mat('Helmet_Shell', spec.helmet, .3),
    black: mat('Rubber_Gloves', '#172126', .85), lens: mat('Shield_Lens', spec.lens, .18, .52),
    frame: mat('Frame_Paint', spec.frame, .26, .25), carbon: mat('Carbon', '#1b2428', .38, .35),
    alloy: mat('Alloy', '#9da6a9', .3, .7), tan: mat('Tyre_Sidewall', '#b79a70', .8),
  };
  const batches = new Map(), skinBatches = [];
  const rig = new T.Bone(); rig.name = 'RiderRoot'; model.add(rig);
  const bones = boneNames.map(name => {
    const bone = new T.Bone(); bone.name = name;
    const ref = boneMap[name](avatar); bone.position.copy(ref.position); bone.quaternion.copy(ref.quaternion);
    rig.add(bone); return bone;
  });
  const boneIndex = Object.fromEntries(boneNames.map((name, i) => [name, i + 1]));
  const skeleton = new T.Skeleton([rig, ...bones]);
  model.updateMatrixWorld(true);

  function normalized(g) {
    const geometry = g.index ? g.toNonIndexed() : g.clone();
    for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal'].includes(name)) geometry.deleteAttribute(name);
    return geometry;
  }
  function add(g, material, parent = model, transform = new T.Matrix4()) {
    const geometry = normalized(g); geometry.applyMatrix4(transform);
    const key = `${parent.uuid}:${material.uuid}`;
    if (!batches.has(key)) batches.set(key, { parent, material, geometries: [] });
    batches.get(key).geometries.push(geometry);
  }
  function skin(g, material, name, transform = new T.Matrix4()) {
    const geometry = normalized(g); geometry.applyMatrix4(transform);
    const indices = [], weights = [];
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      indices.push(boneIndex[name], 0, 0, 0); weights.push(1, 0, 0, 0);
    }
    geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4));
    skinBatches.push({ geometry, material });
  }
  function matrix(position, scale = vec(1, 1, 1), rotation = new T.Quaternion()) {
    return new T.Matrix4().compose(position, rotation, scale);
  }
  function boneMatrix(name, position = vec(), scale = vec(1, 1, 1), rotation = new T.Quaternion()) {
    return bones[boneIndex[name] - 1].matrixWorld.clone().multiply(matrix(position, scale, rotation));
  }
  function oval(name, material, position, scale, segments = 18) {
    skin(new T.SphereGeometry(1, segments, 12), material, name, boneMatrix(name, position, scale));
  }
  function line(a, b, radius, material, parent = model, flatten = 1) {
    const direction = b.clone().sub(a), length = direction.length();
    const q = new T.Quaternion().setFromUnitVectors(UP, direction.normalize());
    add(new T.CylinderGeometry(radius, radius, length, 10), material, parent,
      matrix(a.clone().add(b).multiplyScalar(.5), vec(flatten, 1, 1), q));
  }
  function tube(points, radius, material, parent = model, name) {
    const geometry = new T.TubeGeometry(new T.CatmullRomCurve3(points), 20, radius, 6, false);
    if (name) skin(geometry, material, name, boneMatrix(name)); else add(geometry, material, parent);
  }
  function ring(radius, inner, material, parent, x = 0) {
    const g = new T.RingGeometry(inner, radius, 48); g.rotateY(Math.PI / 2);
    const double = material; double.side = T.DoubleSide;
    add(g, double, parent, matrix(vec(x, 0, 0)));
  }
  function torus(radius, tubeRadius, material, parent, x = 0) {
    const g = new T.TorusGeometry(radius, tubeRadius, 8, 48); g.rotateY(Math.PI / 2);
    add(g, material, parent, matrix(vec(x, 0, 0)));
  }

  // Fitted torso: shared continuous surface, different panel layouts.
  const torsoRings = [[-.225,.118,.088],[-.17,.129,.09],[-.08,.142,.092], [.025,.168,.100],[.14,.183,.094],[.225,.158,.067]];
  function torsoPanel(thetaStart = 0, thetaSweep = TAU, yMin = -1, yMax = 1, outer = 1) {
    const p = [], idx = [], segments = Math.max(3, Math.ceil(32 * thetaSweep / TAU));
    const heights = [...new Set([Math.max(yMin, -.225), ...torsoRings.map(r=>r[0]).filter(y=>y>yMin&&y<yMax), Math.min(yMax,.225)])].sort((a,b)=>a-b);
    for (const y of heights) {
      let a=torsoRings[0], b=torsoRings.at(-1);
      for(let i=1;i<torsoRings.length;i++) if(y<=torsoRings[i][0]) {a=torsoRings[i-1];b=torsoRings[i];break;}
      const t=T.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1);
      const w=T.MathUtils.lerp(a[1],b[1],t)*outer, d=T.MathUtils.lerp(a[2],b[2],t)*outer;
      for(let j=0;j<=segments;j++){const th=thetaStart+thetaSweep*j/segments;p.push(Math.sin(th)*w,y,Math.cos(th)*d);}
    }
    for(let i=0;i<heights.length-1;i++)for(let j=0;j<segments;j++){
      const a=i*(segments+1)+j,b=a+segments+1;idx.push(a,a+1,b,b,a+1,b+1);
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(p,3));geometry.setIndex(idx);geometry.computeVertexNormals();
    return geometry;
  }
  skin(torsoPanel(),mats.jersey,'Torso',boneMatrix('Torso'));
  // Close the shoulders/waist and add a shaped collar; no view-dependent holes.
  for(const [y,width,depth,flip] of [[.225,.158,.067,false],[-.225,.118,.088,true]]){
    const p=[0,y,0],indices=[];
    for(let j=0;j<=32;j++){const a=j/32*TAU;p.push(Math.sin(a)*width,y,Math.cos(a)*depth);}
    for(let j=0;j<32;j++)indices.push(...(flip?[0,j+2,j+1]:[0,j+1,j+2]));
    const cap=new T.BufferGeometry();cap.setAttribute('position',new T.Float32BufferAttribute(p,3));cap.setIndex(indices);cap.computeVertexNormals();
    skin(cap,mats.jersey,'Torso',boneMatrix('Torso'));
  }
  // Side panels create an athletic shoulder-to-waist taper.
  for(const s of [-1,1]) skin(torsoPanel(s*Math.PI/2-.28,.56,-.225,.19,1.006),mats.bib,'Torso',boneMatrix('Torso'));
  if(spec.pattern==='block') {
    skin(torsoPanel(0,TAU,.005,.095,1.007),mats.accent,'Torso',boneMatrix('Torso'));
    skin(torsoPanel(0,TAU,-.225,-.12,1.007),mats.bib,'Torso',boneMatrix('Torso'));
  } else if(spec.pattern==='bands') {
    for(const [lo,hi,material] of [[-.03,.025,mats.bib],[.025,.06,mats.accent],[.06,.078,mats.bib]])
      skin(torsoPanel(0,TAU,lo,hi,1.007),material,'Torso',boneMatrix('Torso'));
  } else if(spec.pattern==='pinstripe') {
    for(const x of [-.067,-.034,.034,.067]) tube([vec(x,-.18,.091),vec(x,.02,.100),vec(x,.19,.077)],.0017,mats.accent,model,'Torso');
    skin(torsoPanel(0,TAU,.10,.12,1.009),mats.accent,'Torso',boneMatrix('Torso'));
  } else {
    const geometry=torsoPanel(-.55,1.10,-.19,.20,1.009);
    // Diagonal front panel follows the fitted cross section.
    const pos=geometry.attributes.position;
    for(let i=0;i<pos.count;i++)pos.setY(i,pos.getY(i)+pos.getX(i)*.58);
    geometry.computeVertexNormals(); skin(geometry,mats.accent,'Torso',boneMatrix('Torso'));
  }
  tube([vec(0,-.20,.090),vec(0,0,.102),vec(0,.16,.090),vec(0,.23,.063)],.0022,mats.bib,model,'Torso');
  for(const x of [-.073,0,.073]) {
    oval('Torso',mats.jersey,vec(x,-.10,-.094),vec(.031,.048,.004));
    tube([vec(x-.026,-.05,-.098),vec(x+.026,-.05,-.098)],.0022,mats.accent,model,'Torso');
  }
  // Original circular chest and back marks, constructed as geometry.
  for(const z of [.097,-.102]){
    const badge=new T.TorusGeometry(.018,.003,6,20);
    skin(badge,mats.accent,'Torso',boneMatrix('Torso',vec(-.075,.12,z)));
  }
  // Shorts have a waist and two leg openings, not an oval sitting over the legs.
  const waistCap=new T.CircleGeometry(1,32);waistCap.rotateX(-Math.PI/2);
  skin(waistCap,mats.bib,'Pelvis',boneMatrix('Pelvis',vec(0,.065,.02),vec(.15,1,.09)));

  // Continuous rings across anatomical joints, weighted to the same old IK poses.
  function limb(rings, materials, segments = 14, openStart = false) {
    const positions=[],indices=[],skinIndices=[],skinWeights=[];
    for(let i=0;i<rings.length;i++) {
      const r=rings[i], previous=rings[Math.max(0,i-1)].point, next=rings[Math.min(rings.length-1,i+1)].point;
      const tangent=next.clone().sub(previous).normalize();
      const across=vec(1,0,0), depth=new T.Vector3().crossVectors(across,tangent).normalize();
      for(let j=0;j<=segments;j++){
        const theta=TAU*j/segments;
        const point=r.point.clone().addScaledVector(across,Math.cos(theta)*r.width).addScaledVector(depth,Math.sin(theta)*r.depth);
        positions.push(...point); const blend=r.blend||0;
        skinIndices.push(boneIndex[r.bone],blend?boneIndex[r.other]:0,0,0);skinWeights.push(1-blend,blend,0,0);
      }
    }
    const geometry=new T.BufferGeometry();
    for(let i=0;i<rings.length-1;i++){
      const start=indices.length;
      for(let j=0;j<segments;j++){const a=i*(segments+1)+j,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);}
      geometry.addGroup(start,indices.length-start,materials.indexOf(rings[i].material));
    }
    // A limb is a closed surface. Previously its open hip ring showed the
    // background through the shorts when the thigh rotated during pedalling.
    for(const end of [0,rings.length-1]){
      if(end===0&&openStart)continue;
      const r=rings[end],center=positions.length/3,blend=r.blend||0;
      positions.push(...r.point);skinIndices.push(boneIndex[r.bone],blend?boneIndex[r.other]:0,0,0);skinWeights.push(1-blend,blend,0,0);
      const start=indices.length,ringStart=end*(segments+1);
      for(let j=0;j<segments;j++)indices.push(...(end===0?[center,ringStart+j,ringStart+j+1]:[center,ringStart+j+1,ringStart+j]));
      geometry.addGroup(start,indices.length-start,materials.indexOf(r.material));
    }
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(skinIndices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(skinWeights,4));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    const full=geometry.toNonIndexed();
    // Retain the shared smooth normals while separating material batches.
    for(const group of full.groups){
      const sub=new T.BufferGeometry();
      for(const [name,attr] of Object.entries(full.attributes)){
        const array=attr.array.slice(group.start*attr.itemSize,(group.start+group.count)*attr.itemSize);
        sub.setAttribute(name,new T.BufferAttribute(array,attr.itemSize));
      }
      skinBatches.push({geometry:sub,material:materials[group.materialIndex]});
    }
  }
  for(const [side,suffix] of [[-1,'L'],[1,'R']]) {
    const leg=side<0?avatar.leftLeg:avatar.rightLeg;
    const hip=vec(side*.115,avatar.hips.position.y-.02,avatar.hips.position.z+.01);
    const knee=leg.knee.position.clone();
    const ankle=vec(side*.115,.35+Math.sin(.55+(side<0?0:Math.PI))*.165+.045,-.08+Math.cos(.55+(side<0?0:Math.PI))*.165-.025);
    const thigh='Thigh'+suffix,shin='Shin'+suffix;
    // Each half of the shorts runs from half of the waist, down the shared
    // crotch seam, and into its thigh. Both halves share seam positions and
    // pelvis weights, so no gaps open when either leg rotates.
    const thighAxis=knee.clone().sub(hip).normalize();
    const depthAxis=new T.Vector3().crossVectors(vec(1,0,0),thighAxis).normalize();
    const facing=depthAxis.z>=0?1:-1,segments=16;
    const opening=hip.clone().lerp(knee,.4);
    const pantsPositions=[],pantsIndices=[],pantsBones=[],pantsWeights=[];
    const levels=[0,.2,.5,.8,1];
    for(const level of levels){
      for(let j=0;j<=segments;j++){
        const phi=TAU*j/segments;
        const theta=((facing*Math.PI/2-phi)/(side*facing)%TAU+TAU)%TAU;
        const outer=theta<=Math.PI;
        const seam=(theta-Math.PI)/Math.PI;
        const start=outer
          ?vec(side*Math.sin(theta)*.15,avatar.hips.position.y+.065,avatar.hips.position.z+.02+Math.cos(theta)*.09)
          :vec(0,avatar.hips.position.y+.065-.12*Math.sin(Math.PI*seam),avatar.hips.position.z+.02-.09*Math.cos(Math.PI*seam));
        const target=opening.clone().addScaledVector(vec(1,0,0),Math.cos(phi)*.072).addScaledVector(depthAxis,Math.sin(phi)*.076);
        pantsPositions.push(...start.lerp(target,level));
        pantsBones.push(level<1?boneIndex.Pelvis:0,level>0?boneIndex[thigh]:0,0,0);
        pantsWeights.push(1-level,level,0,0);
      }
    }
    for(let row=0;row<levels.length-1;row++)for(let j=0;j<segments;j++){
      const a=row*(segments+1)+j,b=a+segments+1;pantsIndices.push(a,b,a+1,b,b+1,a+1);
    }
    const pants=new T.BufferGeometry();
    pants.setAttribute('position',new T.Float32BufferAttribute(pantsPositions,3));
    pants.setAttribute('skinIndex',new T.Uint16BufferAttribute(pantsBones,4));
    pants.setAttribute('skinWeight',new T.Float32BufferAttribute(pantsWeights,4));
    pants.setIndex(pantsIndices);pants.computeVertexNormals();
    skinBatches.push({geometry:pants.toNonIndexed(),material:mats.bib});
    const rings=[];
    for(const [t,w,d] of [[.4,.072,.076],[.61,.064,.069],[.66,.062,.066],[.70,.060,.064],[.88,.049,.055],[1,.049,.052]]){
      rings.push({point:hip.clone().lerp(knee,t),width:w,depth:d,bone:thigh,
        other:t<.4?'Pelvis':shin,blend:t<.4?.85*(1-t/.4):Math.max(0,(t-.82)/.18)*.5,
        material:t<.70?mats.bib:mats.skin});
    }
    for(const [t,w,d] of [[.09,.050,.054],[.28,.057,.063],[.48,.046,.052],[.64,.036,.041],[.68,.035,.040],[.72,.034,.039],[1,.029,.034]]){
      rings.push({point:knee.clone().lerp(ankle,t),width:w,depth:d,bone:shin,other:thigh,blend:t<.15?.5*(1-t/.15):0,
        material:t<.64?mats.skin:t<.72?mats.accent:mats.white});
    }
    limb(rings,[mats.bib,mats.accent,mats.skin,mats.white],16,true);
    oval('Shoe'+suffix,mats.white,vec(0,.003,.006),vec(.041,.031,.098));
    oval('Shoe'+suffix,mats.carbon,vec(0,-.024,.009),vec(.042,.006,.103));
    for(const z of [-.025,.016]){
      skin(new T.BoxGeometry(.057,.004,.012),mats.bib,'Shoe'+suffix,boneMatrix('Shoe'+suffix,vec(0,.029,z)));
      oval('Shoe'+suffix,mats.accent,vec(side*.025,.027,z),vec(.008,.005,.008),10);
    }
    const arm=side<0?avatar.leftArm:avatar.rightArm;
    const shoulder=vec(side*.175,avatar.headGroup.position.y-.13-.02-(side>0?.02:0),avatar.headGroup.position.z-.10);
    const elbow=arm.elbow.position.clone(),hand=arm.glove.position.clone();
    const upper='UpperArm'+suffix,lower='Forearm'+suffix;
    const shoulderLocal=shoulder.clone().sub(arm.upperArm.position).applyQuaternion(arm.upperArm.quaternion.clone().invert());
    oval(upper,mats.jersey,shoulderLocal,vec(.055,.052,.058));
    const armRings=[];
    for(const [t,w,d] of [[0,.057,.061],[.22,.058,.060],[.57,.050,.053],[.64,.049,.051],[.69,.046,.048],[.88,.035,.038],[1,.034,.037]]){
      armRings.push({point:shoulder.clone().lerp(elbow,t),width:w,depth:d,bone:upper,other:lower,blend:Math.max(0,(t-.83)/.17)*.5,
        material:t<.57?mats.jersey:t<.69?mats.accent:mats.skin});
    }
    for(const [t,w,d] of [[.10,.034,.037],[.35,.036,.039],[.7,.028,.032],[1,.023,.027]])
      armRings.push({point:elbow.clone().lerp(hand,t),width:w,depth:d,bone:lower,other:upper,blend:t<.16?.5*(1-t/.16):0,material:mats.skin});
    limb(armRings,[mats.jersey,mats.accent,mats.skin]);
    oval('Hand'+suffix,mats.black,vec(0,.005,.004),vec(.032,.028,.041));
    oval('Hand'+suffix,mats.skin,vec(-side*.025,-.009,.023),vec(.015,.018,.023));
    skin(new T.BoxGeometry(.038,.004,.019),mats.accent,'Hand'+suffix,boneMatrix('Hand'+suffix,vec(0,.030,-.002)));
  }

  // Face, neck, wraparound glasses and four genuinely different helmet shells.
  oval('Head',mats.skin,vec(0,-.080,-.032),vec(.051,.095,.052));
  oval('Head',mats.skin,vec(0,-.003,0),vec(.091,.115,.100),24);
  oval('Head',mats.skin,vec(0,-.053,.022),vec(.065,.053,.073));
  oval('Head',mats.skin,vec(0,-.009,.099),vec(.015,.025,.023));
  tube([vec(-.025,-.064,.098),vec(0,-.066,.104),vec(.025,-.064,.098)],.002,mats.bib,model,'Head');
  for(const side of [-1,1]){
    oval('Head',mats.skin,vec(side*.090,-.005,-.008),vec(.016,.029,.019));
    tube([vec(side*.095,.035,-.04),vec(side*.09,-.04,.005),vec(side*.04,-.092,.047),vec(0,-.098,.055)],.0038,mats.black,model,'Head');
  }
  const helmetScale=spec.helmetStyle==='aero'?vec(.120,.102,.187):spec.helmetStyle==='classic'?vec(.124,.105,.153):vec(.123,.105,.163);
  const helmetG=new T.SphereGeometry(1,28,16,0,TAU,0,Math.PI*.55);
  skin(helmetG,mats.helmet,'Head',boneMatrix('Head',vec(0,.052,-.018),helmetScale));
  const lanes=spec.helmetStyle==='vented'?[-.084,-.055,-.026,.026,.055,.084]:spec.helmetStyle==='aero'?[-.069,.069]:[-.074,-.036,.036,.074];
  for(const x of lanes){
    const pts=[], cross=Math.sqrt(1-(x/helmetScale.x)**2);
    for(let i=0;i<17;i++){const th=-1.05+2.0*i/16;pts.push(vec(x,.052+(helmetScale.y+.001)*cross*Math.cos(th),-.018+(helmetScale.z+.001)*cross*Math.sin(th)));}
    tube(pts,spec.helmetStyle==='aero'?.004:.0065,mats.black,model,'Head');
  }
  if(spec.helmetStyle==='classic') tube([vec(0,.111,-.145),vec(0,.158,-.035),vec(0,.137,.089)],.012,mats.accent,model,'Head');
  if(spec.helmetStyle==='race') tube([vec(0,.11,-.15),vec(0,.159,-.02),vec(0,.13,.104)],.009,mats.jersey,model,'Head');
  const visorG=new T.CylinderGeometry(.107,.107,.043,24,1,true,-1.0,2.0);
  mats.lens.side=T.DoubleSide;skin(visorG,mats.lens,'Head',boneMatrix('Head',vec(0,.011,.014)));
  tube([vec(-.089,.034,.073),vec(-.051,.038,.108),vec(0,.039,.122),vec(.051,.038,.108),vec(.089,.034,.073)],.004,mats.helmet,model,'Head');
  for(const side of [-1,1])tube([vec(side*.09,.032,.073),vec(side*.098,.032,-.043)],.004,mats.black,model,'Head');

  // Complete, closed frame geometry. All designs use identical contact points.
  const frame=new T.Group();frame.name='Bicycle_Frame';model.add(frame);
  const bb=vec(0,.35,-.08),seat=vec(0,.80,-.23),head=vec(0,.83,.33),lower=vec(0,.68,.37);
  const radius=spec.id==='heritage'?.016:spec.id==='nocturne'?.031:.024;
  line(bb,vec(0,.86,-.25),radius,mats.frame,frame,.72);
  line(seat,head,radius,mats.frame,frame,.78);
  line(bb,lower,radius*1.15,mats.frame,frame,.80);
  line(lower,head,.027,mats.frame,frame);
  line(vec(0,.84,-.245),vec(0,.89,-.26),.016,mats.carbon,frame);
  for(const side of [-1,1]){
    const rear=vec(side*.043,.34,-.52);
    line(rear,vec(side*.02,.78,-.225),.010,mats.frame,frame);
    line(rear,vec(side*.03,.35,-.08),.012,mats.carbon,frame);
    tube([vec(side*.035,.70,.36),vec(side*.043,.55,.41),vec(side*.043,.34,.52)],.014,mats.frame,frame);
  }
  add(new T.SphereGeometry(1,20,10),mats.carbon,frame,matrix(vec(0,.893,-.28),vec(.077,.021,.105)));
  add(new T.SphereGeometry(1,16,10),mats.carbon,frame,matrix(vec(0,.890,-.19),vec(.030,.016,.095)));
  line(head,vec(0,.86,.43),.018,mats.carbon,frame);
  line(vec(-.19,.86,.43),vec(.19,.86,.43),.015,mats.carbon,frame);
  for(const side of [-1,1]){
    tube([vec(side*.19,.86,.43),vec(side*.19,.88,.49),vec(side*.19,.82,.54),vec(side*.19,.765,.49),vec(side*.19,.77,.41)],.014,mats.black,frame);
    add(new T.SphereGeometry(1,14,10),mats.black,frame,matrix(vec(side*.19,.892,.49),vec(.026,.046,.043)));
    line(vec(side*.19,.91,.523),vec(side*.19,.83,.54),.005,mats.alloy,frame);
  }
  add(new T.BoxGeometry(.048,.014,.07),mats.black,frame,matrix(vec(0,.882,.46)));
  add(new T.BoxGeometry(.036,.002,.05),mats.lens,frame,matrix(vec(0,.891,.46)));
  const bottleA=vec(0,.455,.015),bottleB=vec(0,.615,.14);
  line(bottleA,bottleB,.031,mats.white,frame);
  line(bottleB,vec(0,.634,.155),.023,mats.black,frame);
  tube([vec(-.035,.46,.02),vec(-.039,.55,.095),vec(0,.586,.12),vec(.039,.55,.095),vec(.035,.46,.02)],.004,mats.carbon,frame);
  for(const sign of [-1,1]) line(vec(.071,.35+sign*.098,-.08),vec(.071,.34+sign*.035,-.52),.0025,mats.alloy,frame);
  add(new T.SphereGeometry(1,12,8),mats.accent,frame,matrix(vec(.019,.62,.16),vec(.003,.020,.06)));
  const wheelNodes=[];
  for(const [name,z] of [['Rear_Wheel',-.52],['Front_Wheel',.52]]){
    const wheel=new T.Group();wheel.name=name;wheel.position.set(0,.34,z);model.add(wheel);wheelNodes.push(wheel);
    torus(.320,.020,mats.black,wheel);
    for(const side of [-1,1]){
      torus(.320,.004,mats.tan,wheel,side*.017);
      ring(.315,spec.rim,mats.carbon,wheel,side*.012);
    }
    line(vec(-.05,0,0),vec(.05,0,0),.021,mats.carbon,wheel);
    for(let i=0;i<20;i++){const angle=i/20*TAU;line(vec(i%2?.027:-.027,0,0),vec(0,Math.sin(angle)*spec.rim,Math.cos(angle)*spec.rim),.0012,mats.alloy,wheel);}
    ring(.075,.046,mats.alloy,wheel,-.039);
    torus(.309,.003,mats.accent,wheel,.014);
  }
  const crank=new T.Group();crank.name='Crankset';crank.position.copy(bb);model.add(crank);
  torus(.098,.006,mats.alloy,crank,.067);
  for(const side of [-1,1]){
    line(vec(side*.070,0,0),vec(side*.070,0,side<0?.165:-.165),.011,mats.carbon,crank);
    line(vec(.066,0,0),vec(.066,side*.092,0),.005,mats.carbon,crank);
  }
  const pedals=[];
  for(const [side,suffix] of [[-1,'L'],[1,'R']]){
    const pedal=new T.Group();pedal.name='Pedal'+suffix;model.add(pedal);pedals.push(pedal);
    add(new T.BoxGeometry(.078,.013,.048),mats.carbon,pedal);
  }
  for(const {parent,material,geometries} of batches.values()){
    const geometry=mergeGeometries(geometries,false);
    const item=new T.Mesh(geometry,material);item.name=`${parent.name}_${material.name}`;parent.add(item);
  }
  const skinMats=[...new Set(skinBatches.map(b=>b.material))];
  const ordered=skinMats.map(material=>skinBatches.filter(b=>b.material===material).map(b=>b.geometry));
  const skinGeometry=mergeGeometries(ordered.flat(),false);
  let offset=0;
  for(let i=0;i<ordered.length;i++){
    const count=ordered[i].reduce((sum,g)=>sum+g.attributes.position.count,0);
    skinGeometry.addGroup(offset,count,i);offset+=count;
  }
  const body=new T.SkinnedMesh(skinGeometry,skinMats);body.name='Rider_Body';model.add(body);
  model.updateMatrixWorld(true);body.bind(skeleton);
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  function update(phase,wheelAngle=0,stand=0,tuck=0){
    pose(avatar,phase,stand,tuck);
    for(let i=0;i<bones.length;i++){const ref=boneMap[boneNames[i]](avatar);bones[i].position.copy(ref.position);bones[i].quaternion.copy(ref.quaternion);}
    for(const wheel of wheelNodes)wheel.rotation.x=wheelAngle;
    crank.rotation.x=-phase;
    for(let i=0;i<2;i++){const shoe=i===0?avatar.leftLeg.shoe:avatar.rightLeg.shoe;pedals[i].position.copy(shoe.position).add(vec(0,-.022,-.035));}
    model.updateMatrixWorld(true);
  }
  // Bake one portable pedalling clip. Runtime continues to use the shared IK.
  const animated=[...bones,...wheelNodes,crank,...pedals], buffers=new Map(animated.map(o=>[o,{p:[],q:[]} ]));
  const times=[];
  for(let i=0;i<=60;i++){
    const t=i/60;times.push(t);update(-t*TAU,t*8/.34);
    for(const item of animated){const b=buffers.get(item);b.p.push(...item.position);b.q.push(...item.quaternion);}
  }
  const tracks=[];
  for(const item of animated){const b=buffers.get(item);tracks.push(new T.VectorKeyframeTrack(item.name+'.position',times,b.p),new T.QuaternionKeyframeTrack(item.name+'.quaternion',times,b.q));}
  const clip=new T.AnimationClip('Pedal_Seated_60rpm',1,tracks);
  update(.55);
  return {model,body,clip};
}

await fs.mkdir(out,{recursive:true});
const manifest=[];
for(const spec of specs){
  const {model,body,clip}=create(spec);
  // glTF skinned meshes are scene roots; the rig and rigid bicycle share their
  // identity transform. This also removes the non-root skin validation warning.
  const exportScene=new T.Scene();model.remove(body);exportScene.add(model,body);
  const raw=await new GLTFExporter().parseAsync(exportScene,{binary:true,animations:[clip],onlyVisible:true});
  const io=new NodeIO();
  const document=await io.readBinary(new Uint8Array(raw));
  await document.transform(weld(),dedup(),prune(),resample());
  const data=await io.writeBinary(document);
  const file=`kolarz-${spec.number}-${spec.id}.glb`;
  await fs.writeFile(path.join(out,file),Buffer.from(data));
  if(spec.number==='01')await fs.writeFile(path.join(out,'kolarz.glb'),Buffer.from(data));
  let triangles=0,drawCalls=0;
  for(const node of document.getRoot().listNodes()){
    const assetMesh=node.getMesh();if(!assetMesh)continue;
    for(const primitive of assetMesh.listPrimitives()){
      triangles+=(primitive.getIndices()?.getCount()||primitive.getAttribute('POSITION').getCount())/3;drawCalls++;
    }
  }
  const revision=createHash('sha256').update(data).digest('hex').slice(0,16);
  manifest.push({...spec,file,revision,bytes:data.byteLength,triangles,drawCalls});
  console.log(`${spec.title}: ${Math.round(data.byteLength/1024)} KiB, ${triangles} triangles, ${drawCalls} draws`);
}
await fs.writeFile(path.join(out,'modele.json'),JSON.stringify(manifest,null,2)+'\n');
// Ship the matching engine and loader locally so both the app and review work offline.
const vendor=[['build/three.module.js','three.module.js'],['examples/jsm/loaders/GLTFLoader.js','addons/loaders/GLTFLoader.js'],
  ['examples/jsm/utils/SkeletonUtils.js','addons/utils/SkeletonUtils.js'],['examples/jsm/utils/BufferGeometryUtils.js','addons/utils/BufferGeometryUtils.js'],['LICENSE','LICENSE']];
for(const [source,target] of vendor){const destination=path.join(out,'vendor',target);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(path.join(root,'tools/3d/node_modules/three',source),destination);}
console.log('Four skinned GLBs and the matching Three.js runtime written to grafika/.');
