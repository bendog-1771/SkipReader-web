const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),esbuild=require('esbuild');
const {chromium,browserOptions}=require('./browser-test-runtime.cjs');
const out=path.resolve(__dirname,'../reports/continuity'),checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
const box={exports:{}};vm.runInNewContext(esbuild.transformSync(fs.readFileSync('src/web/yujing/light-clock.ts','utf8'),{format:'cjs',loader:'ts'}).code,{module:box,exports:box.exports});
for(const [hour,minute,expected]of [[0,0,'night'],[4,59,'night'],[5,0,'dawn'],[7,59,'dawn'],[8,0,'day'],[16,59,'day'],[17,0,'dusk'],[19,59,'dusk'],[20,0,'night'],[23,59,'night']])
 check(`Local light boundary ${hour}:${minute} selects ${expected}`,box.exports.localLight({getHours:()=>hour,getMinutes:()=>minute})===expected);

async function run(){
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch(browserOptions),context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const snap=()=>page.evaluate(()=>window.skipReaderYujingSnapshot());
 const panel=async()=>{if(!(await snap()).panel)await page.getByRole('button',{name:(await snap()).gameOpen?'气候与声音':'跃境',exact:true}).click();};
 const scene=async name=>{await panel();await page.locator('.yj-scene-picks').getByRole('button',{name,exact:true}).click();await page.getByLabel('关闭气候设置').click();};
 const light=async mood=>{await panel();await page.getByRole('tab',{name:'画面',exact:true}).click();await page.getByLabel('光的时刻').selectOption(mood);await page.getByLabel('关闭气候设置').click();await page.waitForFunction(mood=>window.skipReaderYujingSnapshot().light.mode===mood,mood);};
 const sameRadius=state=>{const {center,inner}=state.audioScreen,r=inner.map(p=>Math.hypot(p.x-center.x,p.y-center.y));return Math.max(...r)-Math.min(...r)<.05;};
 try{
  await page.goto('http://localhost:5174/');await page.waitForFunction(()=>window.readerAPI&&window.skipReaderYujingSnapshot);
  check('Fresh light defaults to the local clock',(await page.evaluate(()=>window.readerAPI.settings.get())).yujing.mood==='auto');
  const chooser=page.waitForEvent('filechooser'),imported=page.evaluate(()=>window.readerAPI.books.import());await(await chooser).setFiles({name:'Continuity.md',mimeType:'text/markdown',buffer:Buffer.from('# 继续的风\n\n风穿过书页，新的画面不必重新开始。\n\nThe sea reflects a quiet sky.')});const book=await imported;
  await page.evaluate(async b=>{
   for(const selectedText of ['风穿过书页，翻动的界面并不会打断这句话。','When the wind comes, these words stay together on the page.','另一个完整摘录，留住一个短暂而清晰的片刻。'])await window.readerAPI.notes.add({bookId:b.book.id,chapterId:b.chapters[0].id,selectedText,color:'yellow'});
   const notebook=await window.readerAPI.vocab.addNotebook('Continuity QA');for(const word of ['wind','sky','reflection','tide','luminous','tranquil'])await window.readerAPI.vocab.addItem({word,chineseDef:'记住 '+word,notebookId:notebook.id,bookId:b.book.id,sourceSentence:'A quiet '+word+' stays.'});
   const s=await window.readerAPI.settings.get();await window.readerAPI.settings.set({...s,theme:'blue',yujing:{...s.yujing,enabled:true,scene:'wind',mood:'day',intensity:1}});
  },book);await page.reload();await page.waitForFunction(()=>window.skipReaderYujingSnapshot?.().windCards?.length===3);await page.waitForTimeout(2200);
  let a=await snap();check('Short intact excerpts have a quicker readable rhythm',a.windCards.every(c=>c.hold>=8&&c.hold<18));
  const canvas=await page.locator('.yj-scene canvas').count();await page.getByRole('button',{name:'列表视图',exact:true}).click();await page.waitForTimeout(350);let b=await snap();
  check('Switching book view preserves all current excerpt ages and content',a.windCards.every(c=>{const d=b.windCards.find(d=>d.row===c.row);return d&&d.text===c.text&&d.page===c.page&&d.age>=c.age;}));
  a=b;await page.getByRole('button',{name:'封面视图',exact:true}).click();await page.waitForTimeout(300);b=await snap();check('Returning to cover view continues rather than rebuilding the scene',b.time>a.time&&b.windCards[0].age>a.windCards[0].age&&await page.locator('.yj-scene canvas').count()===canvas);
  a=b;await page.setViewportSize({width:1280,height:900});await page.waitForTimeout(200);b=await snap();check('Window changes reflow without restarting the reading clock',b.windCards[0].age>=a.windCards[0].age&&b.windCards[0].source===a.windCards[0].source);await page.setViewportSize({width:1440,height:1000});
  check('Sidebar entry uses whitespace rather than a curved divider',await page.locator('.yj-entry-nav').evaluate(e=>getComputedStyle(e).borderTopColor==='rgba(0, 0, 0, 0)'));await page.screenshot({path:path.join(out,'wind-continuous.png')});
  await scene('海的慢呼吸');await page.waitForFunction(()=>window.skipReaderYujingSnapshot().skyAsset==='day');
  for(const mood of ['day','dawn','dusk','night']){
   await light(mood);await page.waitForTimeout(250);b=await snap();check(`Photographic ${mood} sky retains a visible ${mood==='night'?'moon':'sun'}`,b.celestial?.visible&&b.celestial.kind===(mood==='night'?'moon':'sun')&&b.skyAsset!=='fallback');await page.screenshot({path:path.join(out,'ocean-'+mood+'.png')});
  }
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);b=await snap();check('Moon remains visible in portrait layout',b.celestial.visible&&b.celestial.x>0&&b.celestial.x<390);await page.screenshot({path:path.join(out,'moon-phone.png')});await light('day');await page.waitForTimeout(200);check('Sun remains visible in portrait layout',(await snap()).celestial.visible);await page.setViewportSize({width:1440,height:1000});
  await page.clock.setFixedTime(new Date('2026-10-05T06:00:00+08:00'));await light('auto');
  for(const [hour,mood]of [['06','dawn'],['12','day'],['18','dusk'],['22','night']]){
   await page.clock.setFixedTime(new Date(`2026-10-05T${hour}:00:00+08:00`));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(mood=>window.skipReaderYujingSnapshot().light.resolved===mood,mood);check(`Returning at local ${hour}:00 resolves ${mood}`,(await snap()).light.mode==='auto');
  }
  check('Automatic light does not repeatedly persist its derived mood',(await page.evaluate(()=>window.readerAPI.settings.get())).yujing.mood==='auto');
  await light('day');await page.clock.setFixedTime(new Date('2026-10-05T23:00:00+08:00'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(200);check('An explicit manual light survives a clock change',(await snap()).light.resolved==='day');
  await scene('词语星轨');await panel();await page.getByRole('tab',{name:'声音',exact:true}).click();await page.getByRole('button',{name:'试听律动',exact:true}).click();await page.getByLabel('关闭气候设置').click();await page.waitForFunction(()=>window.skipReaderYujingSnapshot().audioScreen&&window.skipReaderYujingSnapshot().audioBandCount===32);
  b=await snap();check('Light application themes keep orbit navigation legible',await page.getByRole('button',{name:'我的笔记',exact:true}).evaluate(e=>getComputedStyle(e).color==='rgb(237, 244, 250)'));check('Spectrum inner endpoints are equidistant from the actual core',sameRadius(b));check('Real frequency bands drive the instanced spectrum',b.audioBandCount===32&&b.drawCalls<65&&Math.max(...b.audioLengths)-Math.min(...b.audioLengths)>.1);
  const samples=[];for(let i=0;i<16;i++){await page.waitForTimeout(170);samples.push((await snap()).audioLengths);}const changes=samples[0].map((_,i)=>Math.max(...samples.map(s=>s[i]))-Math.min(...samples.map(s=>s[i])));check('Music produces visible extension and decay instead of nearly static strokes',Math.max(...changes)>.09&&samples.every(s=>Math.max(...s)<=.601));await page.screenshot({path:path.join(out,'orbit-frequency.png')});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(600);check('Music circle remains concentric on a phone',sameRadius(await snap()));await page.screenshot({path:path.join(out,'orbit-phone.png')});await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'星轨练习',exact:true}).click();await page.getByRole('button',{name:'居中专注',exact:true}).click();await page.waitForTimeout(850);check('Practice movement retains spectrum concentricity',sameRadius(await snap()));
  await panel();await page.getByRole('tab',{name:'声音',exact:true}).click();await page.getByRole('button',{name:'停止 / 断开',exact:true}).click();await page.getByLabel('关闭气候设置').click();await page.waitForTimeout(400);check('Disconnect leaves no stale music energy',(await snap()).energy===0);
  const prefixContext=await browser.newContext(),prefix=await prefixContext.newPage(),prefixErrors=[];
  prefix.on('pageerror',e=>prefixErrors.push(e.message));prefix.on('response',r=>{if(r.status()>=400&&r.url().startsWith('http://localhost:5174/'))prefixErrors.push(r.url());});
  try{
   await prefix.goto('http://localhost:5174/eRead-web/');await prefix.waitForFunction(()=>window.readerAPI&&window.skipReaderYujingSnapshot);
   await prefix.getByRole('button',{name:'跃境',exact:true}).click();await prefix.locator('.yj-scene-picks').getByRole('button',{name:'海的慢呼吸',exact:true}).click();await prefix.getByLabel('关闭气候设置').click();await prefix.waitForFunction(()=>window.skipReaderYujingSnapshot().models.ocean==='ready'&&window.skipReaderYujingSnapshot().skyAsset!=='fallback');
   check('GitHub Pages subpath resolves the live 3D model and photographic sky',prefixErrors.length===0);
   await prefix.evaluate(()=>navigator.serviceWorker.ready);await prefix.waitForTimeout(400);await prefixContext.setOffline(true);await prefix.reload();await prefix.waitForFunction(()=>window.skipReaderYujingSnapshot?.().models?.ocean==='ready'&&window.skipReaderYujingSnapshot().skyAsset!=='fallback');
   check('Pages subpath remains functional offline after its first use',prefixErrors.length===0);
  }finally{await prefixContext.close();}
  check('No runtime or shader compilation errors',errors.length===0);
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checkedAt:new Date().toISOString(),checks,errors},null,2));
 }catch(e){fs.writeFileSync(path.join(out,'failure-state.json'),JSON.stringify(await snap(),null,2));await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});console.error(errors);throw e;}finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
