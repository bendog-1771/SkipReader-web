export class RenderBudget {
 constructor(){this.mode='';this.tier=1;this.samples=[];this.frames=0;this.averageMs=0;}
 configure(mode='auto',reading=false){
  if(this.mode!==mode){this.mode=mode;const modest=(navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4||innerWidth<760;this.tier=mode==='high'?2:mode==='battery'?0:modest?0:1;this.samples=[];this.warmup=performance.now()+2000;}
  this.reading=reading;
 }
 get fps(){return this.reading?(this.tier===0?12:18):(this.tier===0?18:this.tier===2?30:24);}
 get dpr(){return Math.min(devicePixelRatio||1,this.tier===2?1.5:this.tier===1?1:.75);}
 sample(now,duration,spacing){
  this.frames++;this.averageMs=this.averageMs*.92+duration*.08;
  if(this.mode!=='auto'||this.tier===0||now<this.warmup)return false;
  this.samples.push({now,duration,spacing});if(this.samples[0].now>now-2200)return false;
  const list=this.samples;this.samples=[];const average=key=>list.reduce((sum,s)=>sum+s[key],0)/list.length;
  if(average('duration')>1000/this.fps*.55||average('spacing')>1000/this.fps*1.7){this.tier--;this.warmup=now+3000;return true;}return false;
 }
 snapshot(){return{mode:this.mode,tier:['节能','均衡','精致'][this.tier],fps:this.fps,dpr:this.dpr,frames:this.frames,renderMs:Math.round(this.averageMs*10)/10};}
}
