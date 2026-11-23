async (page) => {
  const result = await page.evaluate(async () => {
    const studio = window.riderStudio;
    await studio.ready;
    studio.setPaused(true);
    const legacy = await import('./kinematyka.js?v=20261030-sprint');
    const current = await import('./kolarz.js?v=20261030-sprint');
    const manifest = await (await fetch('./modele.json', {cache:'no-store'})).json();
    const base = legacy.createCyclistMesh();
    const riders = studio.views.map(v => v.avatar);
    for(const rider of riders){
      const expected=manifest.find(item=>item.id===rider.design);
      if(rider.modelRevision!==expected.revision||rider.modelSurface!=='continuous-shorts-v2')
        throw Error('Stale cyclist asset loaded: '+rider.design);
    }
    const rig = {
      Pelvis:a=>a.hips,Torso:a=>a.torso,Head:a=>a.headGroup,
      UpperArmL:a=>a.leftArm.upperArm,UpperArmR:a=>a.rightArm.upperArm,
      ForearmL:a=>a.leftArm.forearm,ForearmR:a=>a.rightArm.forearm,
      HandL:a=>a.leftArm.glove,HandR:a=>a.rightArm.glove,
      ThighL:a=>a.leftLeg.thigh,ThighR:a=>a.rightLeg.thigh,
      ShinL:a=>a.leftLeg.calf,ShinR:a=>a.rightLeg.calf,
      ShoeL:a=>a.leftLeg.shoe,ShoeR:a=>a.rightLeg.shoe,
    };
    const reset = a => {
      for(const name of ['crankAngle','wheelAngle','standBlend','tuckBlend','currentLeanRad','sprintBlend'])a[name]=0;
      a.isSprinting=false;a.sprintEffort=null;
    };
    [base,...riders].forEach(reset);
    const scenarios = [
      [0,0,{gradePct:0,watts:0}],
      [8,80,{gradePct:0,watts:180}],
      [6,110,{gradePct:10,watts:430}],
      [17,0,{gradePct:-7,watts:0}],
      [11,75,{gradePct:0,turnAngleDeg:60,watts:210}],
      [11,75,{gradePct:0,turnAngleDeg:-60,watts:210}],
      [3,30,{gradePct:5,watts:100}],
    ];
    let maxDelta = 0, samples = 0;
    const difference=(a,b)=>Math.max(...a.map((value,i)=>Math.abs(value-b[i])));
    for(const [speed,cadence,telemetry] of scenarios){
      for(let frame=0;frame<45;frame++){
        const dt=frame%2?1/60:1/30;
        legacy.animateCyclistMesh(base,speed,cadence,dt,telemetry);
        for(const rider of riders){
          if(rider.visualState!=='ready')throw Error('GLB failed: '+rider.design);
          current.animateCyclistMesh(rider,speed,cadence,dt,telemetry);
          for(const [name,proxy] of Object.entries(rig)){
            const expected=proxy(base),actual=proxy(rider),bone=rider.visual.nodes[name];
            maxDelta=Math.max(maxDelta,difference(expected.position.toArray(),actual.position.toArray()),difference(expected.quaternion.toArray(),actual.quaternion.toArray()),
              difference(actual.position.toArray(),bone.position.toArray()),difference(actual.quaternion.toArray(),bone.quaternion.toArray()));
          }
          for(const name of ['crankAngle','wheelAngle','standBlend','tuckBlend','currentLeanRad'])maxDelta=Math.max(maxDelta,Math.abs(rider[name]-base[name]));
          samples++;
        }
      }
    }
    if(maxDelta>1e-9)throw Error('The motion diverged from the preserved kinematics: '+maxDelta);
    for(const rider of riders){
      reset(rider);current.animateCyclistMesh(rider,0,0,0);
      const frontY=rider.leftLeg.shoe.position.y;
      current.animateCyclistMesh(rider,8,60,.01);
      if(rider.leftLeg.shoe.position.y>=frontY||rider.visual.nodes.Crankset.rotation.x<=0)
        throw Error('Backward pedalling: '+rider.design);
    }
    let vertices=0,maxWeightError=0;
    for(const rider of riders)rider.visual.root.traverse(item=>{
      if(!item.isSkinnedMesh)return;
      const weights=item.geometry.attributes.skinWeight;
      for(let i=0;i<weights.count;i++){
        const sum=weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i);
        if(!Number.isFinite(sum))throw Error('Non-finite skin weight');
        maxWeightError=Math.max(maxWeightError,Math.abs(1-sum));vertices++;
      }
    });
    if(maxWeightError>1e-5)throw Error('Skin weights not normalized');
    const ghost=current.createCyclistMesh({isGhost:true,hasHeadlight:true,showPowerRing:true,jerseyColor:0xc084fc});
    await ghost.ready;
    if(ghost.visualState!=='ready'||ghost.headlightMesh.parent!==ghost.bikeGroup)throw Error('Ghost/headlight compatibility failed');
    ghost.visual.root.traverse(item=>{
      if(!item.isMesh)return;
      for(const material of Array.isArray(item.material)?item.material:[item.material])
        if(!material.transparent||material.depthWrite||material.opacity!==.42)throw Error('Ghost material failed');
    });
    for(const rider of riders){
      reset(rider);rider.crankAngle=.55;current.animateCyclistMesh(rider,8,80,0,{gradePct:0,watts:180});
    }
    studio.render();
    return {designs:riders.map(r=>r.design),scenarioCount:scenarios.length,poseSamples:samples,
      maxMotionDelta:maxDelta,forwardPedalling:true,currentAssetRevisions:true,skinVertices:vertices,maxWeightError,ghostAndHeadlight:true,
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth};
  });
  return result;
}
