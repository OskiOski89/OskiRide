export class AdaptiveGraphics {
  constructor(changed = () => {}) { this.changed=changed;this.enabled=true;this.level=0;this.reset(); }

  reset(clearLevel = true) {
    this.seconds=0;this.frames=0;this.lowSeconds=0;this.highSeconds=0;this.cooldown=0;this.grace=8;this.wasActive=false;
    if(clearLevel&&this.level!==0){this.level=0;this.changed(0,'reset');}
  }

  setEnabled(enabled) { this.enabled=Boolean(enabled);this.reset(); }

  frame(dt,active) {
    if(!this.enabled||!active){this.seconds=0;this.frames=0;this.lowSeconds=0;this.highSeconds=0;this.wasActive=false;return;}
    if(!Number.isFinite(dt)||dt<=0)return;
    if(!this.wasActive){this.grace=8;this.wasActive=true;}
    if(dt>1){this.grace=2;this.seconds=0;this.frames=0;this.lowSeconds=0;this.highSeconds=0;return;}
    if(this.grace>0){this.grace-=dt;return;}
    this.cooldown=Math.max(0,this.cooldown-dt);
    this.seconds+=dt;this.frames++;
    if(this.seconds<2)return;
    const seconds=this.seconds,fps=this.frames/seconds;
    this.seconds=0;this.frames=0;
    this.lowSeconds=fps<48?this.lowSeconds+seconds:0;
    this.highSeconds=fps>=58?this.highSeconds+seconds:0;
    if(this.cooldown>0)return;
    if(this.lowSeconds>=6&&this.level<2){
      this.level++;this.cooldown=15;this.lowSeconds=0;this.highSeconds=0;this.changed(this.level,'slow',fps);
    }else if(this.highSeconds>=30&&this.level>0){
      this.level--;this.cooldown=30;this.lowSeconds=0;this.highSeconds=0;this.changed(this.level,'recovered',fps);
    }
  }
}
