export type AudioEnergy = { bass: number; mid: number; high: number; level: number; bands?: Float32Array };
export class AtmosphereAudio {
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private gain?: GainNode;
  private source?: AudioNode;
  private stream?: MediaStream;
  private player?: HTMLAudioElement;
  private url?: string;
  private timer?: number;
  private frame = 0;
  private serial = 0;
  private volume = .12;
  private oscillators = new Set<OscillatorNode>();
  energy: AudioEnergy = { bass: 0, mid: 0, high: 0, level: 0 };
  constructor(private changed: (label: string, energy: AudioEnergy) => void) {}
  async stop(announce = true) {
    this.serial++;
    cancelAnimationFrame(this.frame); clearInterval(this.timer); this.timer = undefined;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = undefined;
    this.player?.pause(); if (this.player) { this.player.removeAttribute("src"); this.player.load(); } this.player = undefined;
    if (this.url) URL.revokeObjectURL(this.url); this.url = undefined;
    this.oscillators.forEach(o => { try { o.stop(); o.disconnect(); } catch {} }); this.oscillators.clear();
    this.source?.disconnect(); this.source = undefined; this.analyser = undefined; this.gain = undefined;
    const context = this.context; this.context = undefined;
    this.energy = { bass: 0, mid: 0, high: 0, level: 0 };
    if (announce) this.changed("声音已断开", this.energy);
    if (context) await context.close().catch(() => {});
  }
  private async initialize(playback: boolean, serial: number) {
    const context = new AudioContext(); this.context = context;
    await context.resume();
    if(serial!==this.serial || context.state==='closed'){await context.close().catch(()=>{});return false;}
    this.analyser = context.createAnalyser(); this.analyser.fftSize = 1024; this.analyser.smoothingTimeConstant = .45;
    if (playback) { this.gain = context.createGain(); this.gain.gain.value = this.volume; this.analyser.connect(this.gain); this.gain.connect(context.destination); }
    return true;
  }
  private follow(label: string) {
    const spectrum = new Uint8Array(512), wave = new Uint8Array(1024), bands = new Float32Array(32);let lastMusic=performance.now();const bin=(hz:number)=>Math.min(511,Math.max(0,Math.floor(hz/this.context!.sampleRate*1024)));
    const ranges=Array.from({length:32},(_,k)=>{
      const start=bin(80*(6000/80)**(k/32)),end=Math.max(start+1,bin(80*(6000/80)**((k+1)/32)));return [start,end];
    });
    const average = (a:number,b:number) => { let sum=0;for(let i=a;i<b;i++)sum+=spectrum[i];return Math.min(1,sum/(b-a)/255*2.6); };
    const loop = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(spectrum); this.analyser.getByteTimeDomainData(wave);
      let sum = 0; for (const v of wave) sum += ((v-128)/128)**2;
      const target = Math.min(1,Math.sqrt(sum/wave.length)*7);
      for(let k=0;k<32;k++){
        const [start,end]=ranges[k];
        let power=0;for(let i=start;i<end;i++)power+=spectrum[i]**2;
        bands[k]=Math.min(1,Math.sqrt(power/(end-start))/255*2.1);
      }
      this.energy = { bands, bass: average(bin(20),Math.max(1,bin(250))), mid: average(bin(250),bin(2000)), high: average(bin(2000),bin(10000)), level: this.energy.level*.65+target*.35 };
      if(this.energy.level>.015)lastMusic=performance.now();
      this.changed(performance.now()-lastMusic>3500?label+' · 已连接，等待音乐':label, this.energy); this.frame = requestAnimationFrame(loop);
    }; this.frame = requestAnimationFrame(loop);
  }
  setVolume(value: number) { this.volume=value; if(this.gain&&this.context)this.gain.gain.setTargetAtTime(value,this.context.currentTime,.08); }
  async file(file: File) {
    if(file.size>100*1024*1024)throw new Error("请选择 100 MB 以内的音乐文件");
    await this.stop(false); const serial=this.serial; if(!await this.initialize(true,serial))return;
    this.url=URL.createObjectURL(file);this.player=new Audio(this.url);this.player.loop=true;
    this.source=this.context!.createMediaElementSource(this.player);this.source.connect(this.analyser!);
    try{await this.player.play();this.follow("本地音乐正在律动");}catch{await this.stop();throw new Error("此文件暂时无法播放，请换用 MP3、WAV 等浏览器支持的文件");}
  }
  async demo() {
    await this.stop(false); const serial=this.serial; if(!await this.initialize(true,serial))return;
    const chord=()=>{if(!this.context||!this.analyser)return;const ctx=this.context,now=ctx.currentTime,root=[130.81,146.83,110,174.61][Math.floor(now/4)%4];
      [1,1.5,2].forEach((ratio,i)=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=root*ratio;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.13,now+.3+i*.1);gain.gain.exponentialRampToValueAtTime(.001,now+3.8);osc.connect(gain);gain.connect(this.analyser!);osc.start();osc.stop(now+4);this.oscillators.add(osc);osc.onended=()=>{osc.disconnect();gain.disconnect();this.oscillators.delete(osc);};});
      const kick=ctx.createOscillator(),g=ctx.createGain();kick.frequency.setValueAtTime(90,now);kick.frequency.exponentialRampToValueAtTime(35,now+.25);g.gain.setValueAtTime(.1,now);g.gain.exponentialRampToValueAtTime(.001,now+.4);kick.connect(g);g.connect(this.analyser);kick.start();kick.stop(now+.5);this.oscillators.add(kick);kick.onended=()=>{kick.disconnect();g.disconnect();this.oscillators.delete(kick);};
    };chord();this.timer=window.setInterval(chord,4000);this.follow("试听轻音正在律动");
  }
  async share(system: boolean | "player") {
    if(!navigator.mediaDevices?.getDisplayMedia)throw new Error("这里没有声音共享入口。请在 Windows 的 Edge / Chrome 中打开，或选择本地音乐");
    // Open the chooser within the click gesture. No screen frames are read or recorded.
    const pending=navigator.mediaDevices.getDisplayMedia({video:{displaySurface:system==="player"?"window":system?"monitor":"browser",frameRate:1},audio:{suppressLocalAudioPlayback:false},...{systemAudio:system===true?"include":"exclude",windowAudio:system==="player"?"window":system===true?"system":"exclude",monitorTypeSurfaces:system===true?"include":"exclude",selfBrowserSurface:"exclude"}} as DisplayMediaStreamOptions);
    pending.catch(()=>{});await this.stop(false);const serial=this.serial;this.changed("等待授权 · 选择声音来源",this.energy);
    let stream:MediaStream;try{stream=await pending;}catch(e){if(serial!==this.serial)return;const name=(e as DOMException).name;if(name==='NotAllowedError'||name==='AbortError'){this.changed("已取消声音共享",this.energy);return;}this.changed("声音连接未完成",this.energy);throw new Error(name==='NotReadableError'?"浏览器暂时无法读取这个声音来源。先播放音乐，再选择整个屏幕并开启系统音频；也可以改用标签页或本地音乐。":"声音授权窗口未能打开。请使用页面里的连接按钮，在 Windows Edge / Chrome 中重试，或选择本地音乐。");}
    if(serial!==this.serial){stream.getTracks().forEach(t=>t.stop());return;}
    if(!stream.getAudioTracks().length){stream.getTracks().forEach(t=>t.stop());this.changed('未收到声音 · 请重新连接',this.energy);throw new Error(system==="player"?"未收到播放器声音。若授权窗口没有「共享窗口音频」，此浏览器不支持单独连接播放器；可选择标签页音乐或电脑媒体声音。":system?"没有收到系统声音。请选择「整个屏幕」，并勾选共享系统音频；此浏览器若没有该选项，请换用 Windows Edge / Chrome":"没有收到音轨，请勾选「共享标签页音频」");}
    this.stream=stream;stream.getVideoTracks().forEach(t=>t.enabled=false);
    try{if(!await this.initialize(false,serial)){stream.getTracks().forEach(t=>t.stop());return;}}catch{if(serial===this.serial)await this.stop();else stream.getTracks().forEach(t=>t.stop());throw new Error("声音暂时无法启动，请重新连接或选择本地音乐。");}
    this.source=this.context!.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));this.source.connect(this.analyser!);
    stream.getTracks().forEach(track=>track.addEventListener("ended",()=>void this.stop(),{once:true}));this.follow(system==="player"?"正在分析播放器声音":system?"正在分析电脑声音":"正在分析标签页声音");
  }
}
