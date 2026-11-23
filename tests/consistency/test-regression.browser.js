async(page)=>{
 const checks=[],errors=[];const evidence={};
 const check=(name,ok)=>{if(!ok)throw new Error(name);checks.push(name);};
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:8080/index.html');await page.waitForLoadState('networkidle');
 const moduleChecks=await page.evaluate(async()=>{
   const {WORKOUT_PRESETS,parseZwoWorkout,getWorkoutStateAtTime}=await import('/src/workouts/workoutEngine.js');
   const {TrainerController}=await import('/src/ble/trainerController.js');
   const {syncTrainerControl}=await import('/src/workouts/trainerMode.js');
   const {getCogganPowerZone}=await import('/src/physics/cyclingPhysics.js');
   const {formatNumber,formatWorkoutDuration}=await import('/src/ui/formatters.js');
   const results=[];const ok=(name,v)=>{if(!v)throw Error(name);results.push(name);};
   ok('All preset durations are sums of blocks',WORKOUT_PRESETS.every(p=>p.totalDurationSec===p.blocks.reduce((s,b)=>s+b.durationSec,0)));
   ok('Durations match documented values',JSON.stringify(WORKOUT_PRESETS.map(p=>p.totalDurationSec))===JSON.stringify([3000,2580,1820,2280,3600]));
   ok('Formatter keeps seconds and English decimals',formatWorkoutDuration(1820)==='30 min 20 s' && formatNumber(1.25,2)==='1.25');
   const zwo=parseZwoWorkout('<workout_file><name>Przejścia ZWO</name><workout><SteadyState Duration="10" Power="0.8"/><FreeRide Duration="10"/><SteadyState Duration="10" Power="0.9"/></workout></workout_file>');
   ok('ZWO FreeRide boundaries',getWorkoutStateAtTime(zwo,9,250).isErgMode && !getWorkoutStateAtTime(zwo,10,250).isErgMode && getWorkoutStateAtTime(zwo,20,250).isErgMode && getWorkoutStateAtTime(zwo,30,250).isCompleted);
   ok('Workout zones match live HUD including Z7',[0,54.9,55,60,75,76,90,91,105,106,120,121,150,151].every(p=>{const power=p*2.5;const w=getWorkoutStateAtTime({totalDurationSec:60,blocks:[{type:'steadystate',durationSec:60,powerWatts:power}]},0,250);const c=getCogganPowerZone(Math.round(power),250);return w.zoneNumber===c.zone && w.zoneColor===c.color;}));
   for(const protocol of ['tacx','wahoo']) {
     const s={hasRideStarted:true,bleConnected:true,trainerMode:'sim',trainerDifficultyPct:100,ergSoftStartSec:0,virtualShiftingMode:'off'};
     const c=new TrainerController(s);const writes=[];const char={writeValue:async b=>writes.push([...new Uint8Array(b)])};
     if(protocol==='tacx'){c.activeProtocol='tacx-fec';c.tacxTxChar=char;}else{c.activeProtocol='wahoo';c.wahooControlChar=char;}
     await c.updateSimulationGrade(3,true);c.setTrainerMode('erg');await c.setTargetPowerWatts(200,true);
     ok(protocol+' uses separate SIM and ERG opcodes',protocol==='tacx'?writes[0][4]===0x33&&writes[1][4]===0x31:writes[0][0]===0x43&&writes[1][0]===0x42);
     c.cancelPendingControl();
   }
   const s={hasRideStarted:true,bleConnected:true,trainerMode:'erg',manualErgTargetWatts:200,currentGradePct:4,watts:200,ergSoftStartSec:0,lastErgSendTime:0,lastErgTargetSent:null};
   const c=new TrainerController(s);const writes=[];c.ftmsControlPointChar={writeValue:async b=>writes.push([...new Uint8Array(b)])};
   syncTrainerControl(s,c,()=>{},100);s.watts=260;syncTrainerControl(s,c,()=>{},1800);
   ok('Manual ERG target does not follow measured power',writes.every(b=>new DataView(new Uint8Array(b).buffer).getInt16(1,true)===200));
   s.ergSoftStartSec=1;await c.setTargetPowerWatts(300);c.handleGattDisconnection();
   ok('Disconnect cancels ramp and pending commands',c.ergRampIntervalId===null && c.pendingControlWrite===null && !s.bleConnected);
   s.bleConnected=true;c.ftmsControlPointChar={writeValue:async b=>writes.push([...new Uint8Array(b)])};c.syncControlAfterConnection();
   ok('Reconnect in ERG restores power command',writes.at(-1)[0]===0x05);
   c.cancelPendingControl();return results;
 });
 checks.push(...moduleChecks);
 await page.locator('#btn-tab-workouts').click();
 await page.locator('#workout-file-input').setInputFiles({name:'bad.erg',mimeType:'text/plain',buffer:Buffer.from('invalid')});
 await page.locator('#workout-import-status.is-error').waitFor({state:'visible'});
 check('Invalid import gives visible recovery message',(await page.locator('#workout-import-status').textContent()).includes('Could not load workout'));
 await page.locator('#btn-tab-play').click();
 await page.locator('#gpx-input').setInputFiles('tests/fixtures/trasa-testowa.gpx');
 await page.waitForFunction(()=>window.state.routeName.toLowerCase().includes('trasa-testowa'));
 evidence.gpx=await page.evaluate(()=>({route:state.routeName,totalDistanceM:state.totalDistanceM,altitude:state.currentAltitudeM,grade:state.currentGradePct}));
 check('Reported GPX loads with finite route telemetry',Number.isFinite(evidence.gpx.totalDistanceM)&&evidence.gpx.totalDistanceM>1000&&Number.isFinite(evidence.gpx.grade));
 await page.locator('#start-km-slider').fill('1');await page.locator('#start-km-slider').dispatchEvent('input');
 await page.waitForTimeout(200);
 check('Choosing GPX start offset keeps session time zero',await page.evaluate(()=>state.elapsedSeconds===0 && !state.hasRideStarted && state.distanceM>900));
 await page.locator('#btn-settings-close').click();await page.locator('#sim-watts').fill('180');await page.waitForTimeout(2300);
 const fit=page.waitForEvent('download');await page.locator('#btn-export-fit').click();await (await fit).saveAs('__RESULTS_DIR__/test-ride.fit');
 const tcx=page.waitForEvent('download');await page.locator('#btn-export-tcx').click();await (await tcx).saveAs('__RESULTS_DIR__/test-ride.tcx');
 check('FIT and TCX downloads finish',true);
 await page.screenshot({path:'__RESULTS_DIR__/gpx-jazda-1366.png'});
 await page.locator('#btn-end-ride').click();
 const frozen=await page.evaluate(()=>({time:state.elapsedSeconds,distance:state.distanceM}));await page.waitForTimeout(200);
 check('Finish freezes ride counters',await page.evaluate(v=>state.elapsedSeconds===v.time&&state.distanceM===v.distance,frozen));
 await page.locator('#btn-finish-close').click();
 await page.locator('#btn-restart-route').click();await page.waitForTimeout(200);
 check('Restart returns to unstarted zero session',await page.evaluate(()=>!state.hasRideStarted&&state.elapsedSeconds===0&&state.distanceM===0&&state.energyJoules===0));
 check('No browser exceptions',errors.length===0);
 return {passed:checks.length,checks,evidence,errors};
}

