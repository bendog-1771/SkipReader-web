const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm'),esbuild=require('esbuild');
const box={exports:{}};vm.runInNewContext(esbuild.transformSync(fs.readFileSync('src/web/yujing/music-envelope.ts','utf8'),{loader:'ts',format:'cjs'}).code,{module:box,exports:box.exports,Float32Array,Uint8Array});
const {MusicEnvelope}=box.exports,checks=[],check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
const e=new MusicEnvelope(48000,2048),s=new Uint8Array(1024),bands=e.bands,transients=e.transients;
let now=1000;for(let i=0;i<30;i++){e.sample(s,0,now);now+=16;}
check('Silence does not invent a beat or a moving spectrum',e.beat===0&&e.bands.every(v=>v===0));
s.fill(205,2,13);e.sample(s,.10,now);const attack=e.beat,peak=Math.max(...e.transients);now+=16;
check('A low-frequency attack immediately produces a substantial beat',attack>.45&&peak>.5);
let repeated=0,last=e.beat;for(let i=0;i<110;i++){e.sample(s,.10,now);now+=16;if(e.beat>last+.01)repeated++;last=e.beat;}
check('A sustained tone settles rather than producing artificial periodic beats',repeated===0&&e.beat<.001&&Math.max(...e.transients)<.001);
check('Quiet and active frequency regions retain distinct heights',Math.max(...e.bands)>.6&&Math.min(...e.bands)<.01);
s.fill(0);for(let i=0;i<35;i++){e.sample(s,0,now);now+=16;}
s.fill(180,70,160);e.sample(s,.11,now);now+=16;
check('A new treble attack also produces a local response and beat',e.beat>.4&&e.transients.some((v,i)=>v>.5&&i>15));
const afterAttack=e.beat;s.fill(0);for(let i=0;i<30;i++){e.sample(s,0,now);now+=16;}
check('Attack energy decays naturally within half a second',e.beat<afterAttack*.025&&Math.max(...e.transients)<.025);
check('Frequency envelopes reuse their buffers',e.bands===bands&&e.transients===transients);
check('All response values remain finite and bounded',Number.isFinite(e.flux)&&e.beat>=0&&e.beat<=1&&e.bands.every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&e.transients.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
fs.mkdirSync('reports/release',{recursive:true});fs.writeFileSync('reports/release/music-checks.json',JSON.stringify({checks},null,2));
