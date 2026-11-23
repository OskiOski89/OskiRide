import { DeviceCheck } from '../diagnostics/deviceCheck.js';

export function mountDeviceTest(state, controller, { changed, log }) {
  const put=(id,text)=>{const e=document.getElementById(id);if(e.textContent!==text)e.textContent=text;};
  const model=new DeviceCheck(state,controller,{log,changed:()=>{render();changed();}});
  function render() {
    const running=model.readingState==='running',done=model.readingState==='done';
    const seconds=running?Math.min(30,Math.floor((model.now()-model.startedAt)/1000)):done?30:0;
    document.getElementById('device-check-progress').value=seconds;
    const readingsOk=done&&model.rows.power?.status==='pass'&&Object.values(model.rows).every(row=>['pass','optional'].includes(row.status));
    put('device-check-reading-status',running?`Pedal gently. Checking readings: ${seconds}/30 s.`:done?readingsOk?'Readings check complete. Available signals look good.':'Readings check complete. Some signals could not be verified. See results below.':model.readingState==='cancelled'?'Readings check stopped.':'Connect your devices, then start the readings check.');
    const labels={pass:'Valid reading',optional:'No sensor · optional',pedal:'Not pedaling',waiting:done?'No valid reading':'Waiting for a current reading'};
    for(const [key,unit] of [['power','W'],['cadence','rpm'],['heart','bpm']]){
      const row=model.rows[key];
      const element=document.getElementById(`device-check-${key}`);
      element.dataset.result=row?.status||'idle';
      put(`device-check-${key}-value`,row&&row.status!=='optional'?`${row.value} ${unit}`:'—');
      put(`device-check-${key}-status`,row?labels[row.status]:'Test not run');
    }
    put('device-check-trainer',state.bleConnected?`${controller.deviceName} · ${controller.activeProtocol||'BLE'}`:'Trainer disconnected');
    put('device-check-availability',model.canTest?'The test adds no ride time or distance.':'Finish the current ride or calibration before running a device check.');
    document.getElementById('btn-check-readings').disabled=!model.canTest||running||state.isDeviceTestActive;
    document.getElementById('btn-check-resistance').disabled=!model.canTest||!model.supportsControl||state.isDeviceTestActive||state.deviceTestNeedsNeutral;
    document.getElementById('btn-check-stop').disabled=!running&&!state.isDeviceTestActive;
    document.getElementById('device-check-confirmation').hidden=model.resistance!=='confirm';
    document.getElementById('btn-check-neutral').hidden=!state.deviceTestNeedsNeutral;
    document.getElementById('btn-check-neutral').disabled=state.isDeviceTestActive||!state.bleConnected;
    const fallback=!model.supportsControl?'A resistance test requires a connected trainer with SIM or resistance control.':'Pedal gently. For 5 seconds the trainer will simulate a 1% grade or a small resistance increase, then return to neutral.';
    put('device-check-resistance-status',model.message||fallback);
    document.getElementById('device-check-resistance-status').dataset.result=model.resistance;
  }
  document.getElementById('btn-check-readings').addEventListener('click',()=>model.startReadings());
  document.getElementById('btn-check-resistance').addEventListener('click',()=>model.startResistance());
  document.getElementById('btn-check-stop').addEventListener('click',()=>model.cancel());
  document.getElementById('btn-check-neutral').addEventListener('click',()=>model.retryNeutral());
  document.getElementById('btn-check-resistance-yes').addEventListener('click',()=>model.confirmResistance(true));
  document.getElementById('btn-check-resistance-no').addEventListener('click',()=>model.confirmResistance(false));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)model.cancel('Resistance test stopped when the window went into the background.');});
  window.addEventListener('pagehide',()=>model.cancel('Resistance test stopped when the application closed.'));
  setInterval(()=>{
    model.tick();
    if(document.querySelector('.main-menu-shell')?.dataset.menuView==='device-test')render();
  },250);
  render();
  model.refreshView=render;
  return model;
}
