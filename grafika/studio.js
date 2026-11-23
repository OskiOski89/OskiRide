import * as THREE from 'three';
import { createCyclistMesh, animateCyclistMesh, CYCLIST_DESIGNS, selectedCyclistDesign } from './kolarz.js?v=20261030-sprint';

const canvas = document.querySelector('#canvas');
const grid = document.querySelector('#grid');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.setClearColor(0x000000, 0);
const backgrounds = ['#e7e2d7','#e0e7dc','#dfe3e4','#e9e1d6'];
const state = { cadence:80, paused:matchMedia('(prefers-reduced-motion: reduce)').matches, pose:'seated', yaw:.92, pitch:.25, zoom:3.55 };
const views = [...document.querySelectorAll('.card')].map((card,i) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(backgrounds[i]);
  const camera = new THREE.PerspectiveCamera(34,1,.05,30);
  scene.add(new THREE.HemisphereLight(0xffffff,0xb6b4a7,2.4));
  const key = new THREE.DirectionalLight(0xfff6e8,3.0);
  key.position.set(-2,4,3);key.castShadow=true;key.shadow.mapSize.set(1024,1024);
  key.shadow.camera.left=-1.6;key.shadow.camera.right=1.6;key.shadow.camera.top=2;key.shadow.camera.bottom=-1.5;
  key.shadow.normalBias=.015;scene.add(key);
  const fill = new THREE.DirectionalLight(0xd7e6ef,1.4);fill.position.set(2,2,-2);scene.add(fill);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(50,50),new THREE.MeshStandardMaterial({color:backgrounds[i],roughness:1}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.003;ground.receiveShadow=true;scene.add(ground);
  const circle = new THREE.Mesh(new THREE.RingGeometry(1.02,1.027,80),new THREE.MeshBasicMaterial({color:0xa5aca0,transparent:true,opacity:.3,side:THREE.DoubleSide}));
  circle.rotation.x=-Math.PI/2;circle.position.y=.002;scene.add(circle);
  const avatar = createCyclistMesh({design:CYCLIST_DESIGNS[i].id,useDesignPalette:true});scene.add(avatar.group);
  return {card,stage:card.querySelector('.stage'),scene,camera,avatar};
});

function choose(id) {
  const design=CYCLIST_DESIGNS.find(d=>d.id===id)||CYCLIST_DESIGNS[0];
  for(const view of views){
    const selected=view.card.dataset.design===design.id;
    view.card.classList.toggle('selected',selected);
    const button=view.card.querySelector('.choose');button.setAttribute('aria-pressed',String(selected));
    button.innerHTML=selected?'Selected <span>✓</span>':'Select <span>↗</span>';
  }
  try{localStorage.setItem('oskiride-cyclist-design',design.id);}catch{}
  document.querySelector('#download').href=design.file;
  document.querySelector('#ride').setAttribute('aria-label',`Ride with model ${design.title}`);
}
choose(selectedCyclistDesign());
document.querySelectorAll('.choose').forEach(button=>button.addEventListener('click',()=>choose(button.dataset.id)));

function updatePause() {
  document.querySelector('#pause').setAttribute('aria-pressed',String(state.paused));
  document.querySelector('#pause-icon').textContent=state.paused?'▷':'Ⅱ';
  document.querySelector('#pause-label').textContent=state.paused?'Play':'Pause';
}
updatePause();
document.querySelector('#pause').addEventListener('click',()=>{state.paused=!state.paused;updatePause();});
document.querySelector('#cadence').addEventListener('input',event=>{state.cadence=Number(event.target.value);document.querySelector('#cadence-value').value=String(state.cadence);});
document.querySelector('#pose').addEventListener('change',event=>{state.pose=event.target.value;});
const angles={three:.92,side:Math.PI/2,rear:Math.PI,front:0};
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
  state.yaw=angles[button.dataset.view];state.pitch=.25;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b===button));
}));
let drag=null;
for(const {stage} of views){
  stage.addEventListener('pointerdown',event=>{drag={x:event.clientX,y:event.clientY,yaw:state.yaw,pitch:state.pitch};stage.setPointerCapture(event.pointerId);});
  stage.addEventListener('pointermove',event=>{if(!drag)return;state.yaw=drag.yaw-(event.clientX-drag.x)*.009;state.pitch=THREE.MathUtils.clamp(drag.pitch+(event.clientY-drag.y)*.005,-.04,.85);document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('active'));});
  stage.addEventListener('pointerup',()=>{drag=null;});stage.addEventListener('pointercancel',()=>{drag=null;});
  stage.addEventListener('wheel',event=>{event.preventDefault();state.zoom=THREE.MathUtils.clamp(state.zoom+event.deltaY*.002,2.3,5);},{passive:false});
}

function render(dt=0) {
  const rect=grid.getBoundingClientRect();
  if(canvas.width!==Math.round(rect.width*renderer.getPixelRatio())||canvas.height!==Math.round(rect.height*renderer.getPixelRatio()))renderer.setSize(rect.width,rect.height,false);
  renderer.setScissorTest(false);renderer.setViewport(0,0,rect.width,rect.height);renderer.clear();renderer.setScissorTest(true);
  const telemetry=state.pose==='standing'?{gradePct:10,watts:400}:state.pose==='aero'?{gradePct:-7,watts:0}:{gradePct:0,watts:180};
  const speed=state.pose==='aero'?17:state.pose==='standing'?5:8;
  const cadence=state.pose==='aero'?0:state.cadence;
  for(const view of views){
    if(!state.paused)animateCyclistMesh(view.avatar,speed,cadence,dt,telemetry);
    const stage=view.stage.getBoundingClientRect(),w=stage.width,h=stage.height;
    view.camera.aspect=w/h;view.camera.updateProjectionMatrix();
    view.camera.position.set(Math.sin(state.yaw)*state.zoom, .80+state.zoom*Math.sin(state.pitch),Math.cos(state.yaw)*state.zoom);
    view.camera.lookAt(0,.76,0);
    renderer.setViewport(stage.left-rect.left,rect.bottom-stage.bottom,w,h);
    renderer.setScissor(stage.left-rect.left,rect.bottom-stage.bottom,w,h);
    renderer.render(view.scene,view.camera);
  }
  renderer.setScissorTest(false);
}
let previous=performance.now();
function frame(now){const dt=Math.min((now-previous)/1000,.05);previous=now;render(dt);requestAnimationFrame(frame);}
requestAnimationFrame(frame);
const ready=Promise.all(views.map(v=>v.avatar.ready)).then(()=>{
  const failures=views.filter(v=>v.avatar.visualState!=='ready');
  const status=document.querySelector('#load-status');
  status.textContent=failures.length?'A model failed to load. Refresh the preview.':'4 models · shared animation';status.classList.toggle('error',!!failures.length);
  render();
});
window.riderStudio={views,state,ready,render,renderer,setPaused(value){state.paused=value;updatePause();}};
