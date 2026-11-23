async (page) => {
  await page.waitForLoadState('networkidle');
  const result = await page.evaluate(async () => {
    const THREE = await import('/grafika/vendor/three.module.js');
    const { GLTFLoader } = await import('/grafika/vendor/addons/loaders/GLTFLoader.js');
    const { createSpectator, animateSpectators, SPECTATOR_DESIGNS } = await import('/src/world/spectatorCrowd.js');
    const { buildRouteWorld } = await import('/src/world/worldBuilder.js');
    const { generatePresetRoute, detectClimbs } = await import('/src/gpx/gpxParser.js');
    const assert = (condition, message) => { if (!condition) throw Error(message); };
    const release = await (await fetch('/grafika/kibice/modele.json')).json();
    assert(release.length === 12, 'Twelve exported designs');
    assert(release.every((model,index)=>model.id===SPECTATOR_DESIGNS[index]),'Manifest matches runtime designs');
    const standalone = SPECTATOR_DESIGNS.map((_,i) => createSpectator(i,0));
    await Promise.all(standalone.map(f=>f.ready));
    let maxBoundsDelta=0, maxDrawCalls=0;
    for(const fan of standalone){
      assert(fan.state==='ready', 'Model ready: '+fan.design);
      const raw = await new GLTFLoader().loadAsync('/grafika/kibice/'+fan.design+'.glb');
      const mixer=new THREE.AnimationMixer(raw.scene);
      mixer.clipAction(raw.animations[0]).play();
      let meshes=0; fan.visual.traverse(o=>{if(o.isMesh)meshes++;});
      maxDrawCalls=Math.max(maxDrawCalls,meshes);
      assert(meshes<=5,'Rigid surface batching: '+fan.design);
      for(const t of [0,.4,1.1,2.7]){
        fan.mixer.setTime(t); mixer.setTime(t);
        const a=new THREE.Box3().setFromObject(fan.visual,true);
        const b=new THREE.Box3().setFromObject(raw.scene,true);
        maxBoundsDelta=Math.max(maxBoundsDelta,a.min.distanceTo(b.min),a.max.distanceTo(b.max));
        assert(a.min.y>=-1e-4,'No below-ground pose: '+fan.design);
      }
      raw.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
    }
    assert(maxBoundsDelta<1e-4,'Optimized geometry and animation match the exported model: '+maxBoundsDelta);
    const duplicate=createSpectator(SPECTATOR_DESIGNS.length,0); await duplicate.ready;
    const original=standalone[0];
    const meshOf=f=>{let mesh;f.visual.traverse(o=>{if(o.isMesh)mesh??=o;});return mesh;};
    assert(meshOf(original).geometry===meshOf(duplicate).geometry,'Shared geometry');
    assert(meshOf(original).material===meshOf(duplicate).material,'Shared material');
    original.mixer.setTime(.2); duplicate.mixer.setTime(1.3);
    assert(original.visual!==duplicate.visual,'Independent animated transforms');
    const before=duplicate.mixer.time;
    duplicate.group.visible=false; animateSpectators([duplicate],12);
    assert(duplicate.mixer.time===before,'Hidden fan skips animation');
    duplicate.group.visible=true;
    const hiddenParent=new THREE.Group(); hiddenParent.visible=false; hiddenParent.add(duplicate.group);
    animateSpectators([duplicate],13);
    assert(duplicate.mixer.time===before,'Hidden sector skips animation');
    hiddenParent.visible=true; animateSpectators([duplicate],14);
    assert(duplicate.mixer.time!==before,'Visible fan animates');
    standalone.forEach(f=>f.dispose()); duplicate.dispose();

    const scene=new THREE.Scene();
    const rows=[]; let previous=null, previousFans=[];
    for(const [preset,quality] of [['mountain','medium'],['mountain','eco'],['mountain','ultra'],['switchbacks','medium'],['rolling','medium'],['flat','medium']]){
      const points=generatePresetRoute(preset);
      const built=buildRouteWorld(scene,points,previous,{climbs:detectClimbs(points),quality});
      assert(previousFans.every(f=>f.disposed&&f.mixer===null&&f.group.children.length===0),'Route rebuild releases old mixers');
      const fans=built.animatedObjects.spectators;
      await Promise.all(fans.map(f=>f.ready));
      assert(fans.length>0,'Fans placed: '+preset+'/'+quality);
      assert(fans.every(f=>f.state==='ready'),'World models loaded');
      const cast=new Set(fans.map(f=>f.design));
      assert(cast.size===SPECTATOR_DESIGNS.length,'Full cast on route '+preset+'/'+quality+': '+cast.size);
      for(const f of fans){
        assert(f.group.userData.sceneryKind==='spectator','Scenery collision reservation');
        assert(f.group.parent.userData.minDistM<=f.distanceM&&f.group.parent.userData.maxDistM>=f.distanceM,'Own distance sector');
        assert(!built.tunnelIntervals.some(t=>f.distanceM>=t.startDist-14&&f.distanceM<=t.endDist+14),'Outside tunnels');
        const pt=built.routeCurve.getPointAt(f.distanceM/built.totalDistanceM);
        const offset=Math.hypot(f.group.position.x-pt.x,f.group.position.z-pt.z);
        assert(offset>4.8&&offset<5.3,'On terrace');
        assert(Math.abs(f.group.position.y-(pt.y-.04-(offset-3.6)*.1))<1e-4,'Ground height');
        const forward=new THREE.Vector3(0,0,1).applyQuaternion(f.group.quaternion);
        const roadward=new THREE.Vector3(pt.x-f.group.position.x,0,pt.z-f.group.position.z).normalize();
        assert(forward.dot(roadward)>.999,'Facing the road');
      }
      const near=fans[0];
      built.updateVisibleWindow(near.distanceM);
      const active=fans.filter(f=>f.group.visible);
      assert(active.length>0,'Nearby crowd visible');
      built.updateVisibleWindow(0);
      assert(fans.every(f=>f.group.visible===(f.distanceM<=(quality==='eco'?140:quality==='ultra'?500:300))),'Initial distance culling');
      rows.push({preset,quality,people:fans.length,designs:cast.size});
      previous=built.routeGroup; previousFans=fans;
    }
    previous.userData.disposeSpectators();
    // Dispose during a pending load: no late GLB may reattach to an obsolete route.
    const stale=createSpectator(0,0); stale.dispose(); await stale.ready;
    assert(stale.group.children.length===0&&stale.mixer===null,'No late attachment after disposal');
    return {maxBoundsDelta,maxDrawCalls,rows};
  });
  return result;
}
