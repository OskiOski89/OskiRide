const fresh = (at, now) => Number.isFinite(at) && now >= at && now - at <= 5000;
const round = value => Number.isFinite(value) ? Math.round(value) : 0;

export class DeviceCheck {
  constructor(state, controller, { log = () => {}, changed = () => {}, now = () => performance.now(), holdMs = 5000 } = {}) {
    this.state=state;this.controller=controller;this.log=log;this.changed=changed;this.now=now;this.holdMs=holdMs;
    this.readingState='idle';this.rows={};this.resistance='idle';this.message='';this.runId=0;
  }

  get canTest() { return (!this.state.hasRideStarted || this.state.isRideFinished) && !this.controller.isSpindownActive; }
  get supportsControl() {
    const c=this.controller;
    return Boolean(this.state.bleConnected && (
      ['ftms-sim','ftms-res'].includes(c.activeProtocol)&&c.ftmsControlPointChar ||
      c.activeProtocol==='tacx-fec'&&c.tacxTxChar || c.activeProtocol==='wahoo'&&c.wahooControlChar));
  }

  startReadings() {
    if(!this.canTest || this.state.isDeviceTestActive)return;
    this.startedAt=this.now();this.readingState='running';this.seen={power:{},cadence:{},heart:{}};
    this.rows={};this.log('Started the 30-second readings check');this.tick();this.changed();
  }

  tick() {
    const s=this.state,now=this.now();
    if(this.state.isDeviceTestActive && (!this.state.bleConnected || !this.canTest))this.cancel('Resistance test stopped: the device disconnected or the session changed.');
    if(this.readingState!=='running')return;
    if(!this.canTest){this.cancelReadings();return;}
    const inputs={
      power:{value:s.watts,at:s.lastPowerAtMs,connected:s.lastPowerSource==='trainer'&&s.bleConnected||s.lastPowerSource==='power-meter'&&s.powerMeterConnected,expected:true,max:3000},
      cadence:{value:s.cadence,at:s.lastCadenceAtMs,connected:s.lastCadenceSource==='trainer'&&s.bleConnected||s.lastCadenceSource==='cadence-sensor'&&s.cadenceSensorConnected||s.lastCadenceSource==='power-meter'&&s.powerMeterConnected,expected:Boolean(s.bleConnected||s.cadenceSensorConnected||s.lastCadenceSource==='power-meter'&&s.powerMeterConnected),max:250},
      heart:{value:s.heartRate,at:s.lastHeartRateAtMs,connected:Boolean(s.heartRateConnected),expected:Boolean(s.heartRateConnected),max:240},
    };
    for(const [key,input] of Object.entries(inputs)){
      const seen=this.seen[key],valid=input.connected&&fresh(input.at,now)&&input.at>=this.startedAt&&Number.isFinite(input.value)&&input.value>0&&input.value<=input.max&&(key!=='heart'||input.value>=30);
      if(valid&&input.at!==seen.at){seen.at=input.at;seen.count=(seen.count||0)+1;}
      const ok=valid&&seen.count>=2;
      const status=ok?'pass':!input.expected?'optional':input.connected&&fresh(input.at,now)&&input.value===0&&key!=='heart'?'pedal':'waiting';
      this.rows[key]={status,value:round(input.value),samples:seen.count||0};
    }
    if(now-this.startedAt>=30000){
      this.readingState='done';
      this.log('Readings check complete',this.rows);
    }
    this.changed();
  }

  cancelReadings() {
    if(this.readingState==='running'){this.readingState='cancelled';this.log('Readings check stopped');this.changed();}
  }

  async timed(promise) {
    let timer;
    try{return await Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),3500);})]);}
    finally{clearTimeout(timer);}
  }

  async restore() {
    if(this.restoring)return this.restoring;
    this.restoring=this.timed(this.controller.clearDiagnosticLoad()).finally(()=>{this.restoring=null;});
    return this.restoring;
  }

  async startResistance() {
    if(!this.canTest||!this.supportsControl||this.state.isDeviceTestActive||this.state.deviceTestNeedsNeutral)return;
    const now=this.now(),s=this.state;
    const realPower=s.lastPowerSource==='trainer'&&s.bleConnected||s.lastPowerSource==='power-meter'&&s.powerMeterConnected;
    if(!fresh(s.lastPowerAtMs,now)||s.watts<=0||!realPower){
      this.message='Pedal gently. This test requires a current power reading from your device.';this.changed();return;
    }
    const id=++this.runId;
    this.probeDevice=this.controller.bleDevice||this.controller.deviceName;
    this.state.isDeviceTestActive=true;
    this.resistance='running';this.message='Setting neutral resistance…';this.changed();
    this.log('Resistance test started: neutral → small increase → neutral');
    try{
      const neutral=await this.timed(this.controller.setDiagnosticGrade(0));
      if(id!==this.runId)return;
      if(!neutral)throw new Error('Could not confirm the neutral resistance command.');
      this.message='Pedal gently for 5 seconds while resistance rises to a 1% grade or by one small step.';this.changed();
      this.state.deviceTestNeedsNeutral=true;
      const written=await this.timed(this.controller.setDiagnosticGrade(1));
      if(id!==this.runId)return;
      if(!written)throw new Error('Could not confirm the resistance change command.');
      await new Promise(resolve=>{this.releaseHold=resolve;this.holdTimer=setTimeout(resolve,this.holdMs);});
      if(id!==this.runId)return;
      this.message='Restoring neutral resistance…';this.changed();
      const restored=await this.restore();
      if(id!==this.runId)return;
      if(!restored)throw new Error('Could not confirm neutral resistance. Reconnect the trainer and retry.');
      this.resistance='confirm';this.message='Neutral resistance command sent. Did you feel a change?';
    }catch(error){
      if(id===this.runId){this.resistance='error';this.message=error.message;this.log(error.message);await this.restore();}
    }finally{
      clearTimeout(this.holdTimer);this.releaseHold=null;
      if(id===this.runId){this.state.isDeviceTestActive=false;this.changed();}
    }
  }

  confirmResistance(confirmed) {
    if(this.resistance!=='confirm'||this.state.deviceTestNeedsNeutral)return;
    if(!this.state.bleConnected||(this.controller.bleDevice||this.controller.deviceName)!==this.probeDevice){
      this.resistance='error';this.message='The connection changed during the test. Connect the intended trainer and retry.';this.changed();return;
    }
    this.resistance=confirmed?'pass':'fail';
    this.message=confirmed?'Resistance change confirmed.':'Resistance change was not confirmed. Check the connection and control logs.';
    this.log('Resistance test result',{confirmed,protocol:this.controller.activeProtocol});this.changed();
  }

  async cancel(message='Resistance test stopped.') {
    this.cancelReadings();
    if(this.resistance==='cancelled'&&this.state.isDeviceTestActive)return;
    if(!this.state.isDeviceTestActive){
      if(this.resistance==='confirm'){this.resistance='cancelled';this.message='Resistance change was not confirmed. You can run the test again.';this.changed();}
      return;
    }
    ++this.runId;clearTimeout(this.holdTimer);this.releaseHold?.();
    this.resistance='cancelled';this.message='Restoring neutral resistance…';this.changed();
    const restored=await this.restore();
    this.state.isDeviceTestActive=false;
    this.message=restored?message:'Could not confirm neutral resistance. Connect the trainer and select “Reset resistance.”';
    this.log(this.message);this.changed();
  }

  async retryNeutral() {
    if(this.state.isDeviceTestActive||!this.state.bleConnected)return;
    this.state.isDeviceTestActive=true;this.changed();
    const ok=await this.restore();this.state.isDeviceTestActive=false;
    this.message=ok?'Neutral resistance command sent.':'Could not confirm neutral resistance. Check the connection and try again.';
    this.log(this.message);this.changed();
  }
}
