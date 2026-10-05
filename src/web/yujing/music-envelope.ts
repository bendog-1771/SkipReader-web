// Audio-only onset and frequency envelopes; all buffers are reused.
export class MusicEnvelope {
  readonly bands = new Float32Array(32);
  readonly transients = new Float32Array(32);
  beat = 0;
  flux = 0;
  private previous = new Float32Array(32);
  private ranges: [number, number][];
  private baseline = .006;
  private rmsMean = .02;
  private last = 0;
  private lastBeat = -1000;
  constructor(sampleRate:number, fftSize:number) {
    const bin=(hz:number)=>Math.min(fftSize/2-1,Math.floor(hz/sampleRate*fftSize));
    this.ranges=Array.from({length:32},(_,k)=>{
      const start=bin(45*(10000/45)**(k/32));
      return [start,Math.max(start+1,bin(45*(10000/45)**((k+1)/32)))];
    });
  }
  sample(spectrum:Uint8Array, rms:number, now:number) {
    const dt=Math.max(.001,Math.min(.1,this.last?(now-this.last)/1000:1/60));this.last=now;
    let flux=0;
    for(let k=0;k<32;k++){
      const [start,end]=this.ranges[k];let power=0;
      for(let i=start;i<end;i++)power+=spectrum[i]**2;
      const value=Math.sqrt(power/(end-start))/255;
      const rise=Math.max(0,value-this.previous[k]);this.previous[k]=value;flux+=rise;
      this.bands[k]+=(value-this.bands[k])*(1-Math.exp(-dt*(value>this.bands[k]?35:9)));
      this.transients[k]=Math.max(this.transients[k]*Math.exp(-dt*10),Math.min(1,rise*5.5));
    }
    this.flux=flux/32;
    const onset=rms>.012&&now-this.lastBeat>150&&(this.flux>Math.max(.008,this.baseline*1.65)||rms>this.rmsMean*1.55&&this.flux>.004);
    this.beat*=Math.exp(-dt*8);
    if(onset){this.beat=Math.max(this.beat,Math.min(1,.4+this.flux*12));this.lastBeat=now;}
    this.baseline+=(this.flux-this.baseline)*(1-Math.exp(-dt*1.5));
    this.rmsMean+=(rms-this.rmsMean)*(1-Math.exp(-dt*1.4));
  }
}
