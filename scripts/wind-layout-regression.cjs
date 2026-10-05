const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm'),esbuild=require('esbuild');
const moduleBox={exports:{}};vm.runInNewContext(esbuild.transformSync(fs.readFileSync('src/web/yujing/wind-field.js','utf8'),{format:'cjs'}).code,{module:moduleBox,exports:moduleBox.exports});
const {drawWind,windFragments}=moduleBox.exports,checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
const ctx={createLinearGradient:()=>({addColorStop(){}}),measureText:t=>({width:Array.from(t).reduce((n,c)=>n+(/[\u4e00-\u9fff]/.test(c)?24:11),0)}),fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},setLineDash(){},save(){},restore(){},translate(){},rotate(){},fillText(){}};
const sentence='风从书页间穿过，逗号后面仍是同一个句子。',long=sentence.repeat(40);
check('Source grouping never splits a normal sentence or long excerpt',JSON.stringify(windFragments([sentence,long]))===JSON.stringify([sentence,long]));
function engine(width,height,quotes){return{ctx,width,height,quotes,time:0,settings:{paused:false},reduced:{matches:false},palette:{horizon:'#def',top:'#123',sun:'#fed',ink:'#123'},pointerTarget:{x:1,y:-1},pointerInside:false,windCache:new Map()};}
for(const [width,height]of [[1440,1000],[390,844],[820,520]]){
 const e=engine(width,height,[long]),pages=[],positions=[];let previous=-1;
 for(let i=0;i<7000;i++){e.time+=.12;drawWind(e,.12);const c=e.windCards[0];if(c&&c.page!==previous){if(c.page===0&&pages.length)break;pages.push(c.text);positions.push([c.x,c.y]);previous=c.page;assert.ok(c.height<=height*.45&&c.x+c.width<=width&&c.y+c.height<=height);}}
 check(`All long prose survives ordered pages at ${width}px`,pages.length>1&&pages.join('')===long);
 check(`Continuation stays at one readable position at ${width}px`,positions.every(p=>JSON.stringify(p)===JSON.stringify(positions[0])));
}
const e=engine(1440,1000,[sentence]);drawWind(e,.12);const cache=e.windCache;e.settings.paused=true;const time=e.windElapsed;drawWind(e,1);check('Paused text keeps its readable page and clock',e.windElapsed===time&&e.windCards.length===1);
e.settings.paused=false;e.quotes=[long];drawWind(e,.12);check('Replacing sources immediately invalidates the old layout',e.windCards[0].source===long&&e.windCards[0].page===0);
for(let i=0;i<40;i++){e.quotes=[sentence+i];drawWind(e,.12);}check('Excerpt layout cache has a bounded memory budget',cache.size<=24);
fs.mkdirSync('reports/harmony',{recursive:true});fs.writeFileSync('reports/harmony/wind-layout-checks.json',JSON.stringify({checks},null,2));
