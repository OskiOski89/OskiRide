async (page) => {
  const checks=[]; const evidence={}; const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const check=(name,ok)=>{if(!ok)throw new Error(name);checks.push(name);};
  const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.setViewportSize({width:1440,height:900});
  await page.goto('http://localhost:8080/index.html');
  await page.waitForLoadState('networkidle');
  await page.screenshot({path:'__RESULTS_DIR__/menu-1440.png'});
  for(const width of [390,760,1366]) {
    await page.setViewportSize({width,height:width===390?844:768}); await frame();
    const size=await page.evaluate(()=>{const e=document.querySelector('.main-menu-shell');return {window:innerWidth,doc:document.documentElement.scrollWidth,client:e.clientWidth,scroll:e.scrollWidth,deviceButton:getComputedStyle(document.getElementById('btn-home-devices')).backgroundColor};});
    evidence['home'+width]=size;
    check('Home content fits at '+width,size.scroll<=size.client+1);
    check('Device button has brand background at '+width,size.deviceButton!=='rgb(240, 240, 240)');
    if(width===390)await page.screenshot({path:'__RESULTS_DIR__/menu-390.png'});
  }
  await page.locator('#btn-tab-play').click();
  check('Five preset routes',await page.locator('button.route-card[data-preset]').count()===5);
  await page.locator('#card-route-flat').click();
  check('Route selection preserves aria-pressed',await page.locator('#card-route-flat').getAttribute('aria-pressed')==='true');
  await page.locator('#btn-tab-workouts').click();
  const activeTab=await page.locator('#btn-tab-workouts').evaluate(e=>({color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor}));
  check('Active tab remains readable while hovered',activeTab.color==='rgb(255, 252, 247)' && activeTab.background!=='rgb(221, 227, 207)');
  check('Over-Unders name matches two series',(await page.locator('[data-workout-id="over-unders-3x9"]').textContent()).includes('2×9'));
  check('Tabata displays exact duration',(await page.locator('[data-workout-id="tabata-hiit"]').textContent()).includes('30 min 20 s'));
  await page.locator('#workout-file-input').setInputFiles({name:'test-200w.erg',mimeType:'text/plain',buffer:Buffer.from('[COURSE HEADER]\nFILE NAME=Test 200 W\nMINUTES WATTS\n[COURSE DATA]\n0 200\n1 200\n[END COURSE DATA]')});
  await page.locator('#workout-import-status').waitFor({state:'visible'});
  check('ERG import selects without starting',await page.evaluate(()=>!window.state.hasRideStarted && !window.state.isWorkoutRunning && window.state.elapsedSeconds===0));
  check('Imported name shown',(await page.locator('#workout-active-title').textContent())==='Test 200 W');
  await page.waitForTimeout(250);
  await page.screenshot({path:'__RESULTS_DIR__/treningi-1366.png'});
  await page.locator('#btn-workout-toggle').click();
  await page.waitForTimeout(350);
  check('ERG imported watts reach HUD',(await page.locator('#workout-target-watts').textContent())==='200 W');
  check('HUD uses decimal points',(await page.locator('#hud-wkg').textContent()).includes('.') && (await page.locator('#hud-speed').textContent()).includes('.'));
  await page.screenshot({path:'__RESULTS_DIR__/hud-1366.png'});
  await page.locator('#btn-end-ride').click();
  const colors=()=>page.locator('#btn-finish-strava').evaluate(e=>({color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor}));
  evidence.strava=await colors();
  await page.locator('#btn-finish-strava').hover();
  await page.waitForTimeout(250);
  evidence.stravaHover=await colors();
  const ratio = pair=>{
    const lum=c=>{const x=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*x[0]+.7152*x[1]+.0722*x[2];};
    const a=lum(pair.color),b=lum(pair.background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  };
  evidence.contrast={normal:ratio(evidence.strava),hover:ratio(evidence.stravaHover)};
  check('Strava contrast passes 4.5 in both states',Object.values(evidence.contrast).every(v=>v>=4.5));
  await page.screenshot({path:'__RESULTS_DIR__/podsumowanie-1366.png'});
  check('No page errors',errors.length===0);
  return {passed:checks.length,checks,evidence,errors};
}

