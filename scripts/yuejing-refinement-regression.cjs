const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,browserOptions}=require('./browser-test-runtime.cjs');
const out=path.resolve(__dirname,'../reports/yuejing-refinement');
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch(browserOptions),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),checks=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
 const snap=()=>page.evaluate(()=>window.skipReaderYujingSnapshot());
 const themes=['paper','night','sepia','forest','blue','dusk'];
 const tab=async name=>{await page.getByRole('tab',{name,exact:true}).click();};
 try{
  await page.goto('http://localhost:5174/lab.html');await page.locator('.yj-lab-home').waitFor();
  await page.locator('.yj-toggle').click();await tab('画面');await page.getByLabel('背景跟随应用主题',{exact:true}).check();await page.getByLabel('关闭气候设置').click();
  const seen={};for(const id of ['wind','ocean','island','orbit']){
   await page.locator(`[data-scene=${id}]`).click();if(['ocean','island'].includes(id))await page.waitForFunction(id=>window.skipReaderYujingSnapshot().models[id]===(id==='island'?'retired':'ready'),id);
   seen[id]=[];for(const theme of themes){await page.getByLabel('实验室主题').selectOption(theme);await page.waitForFunction(theme=>window.skipReaderYujingSnapshot().theme===theme,theme);await page.waitForTimeout(180);const state=await snap();seen[id].push(state.palette);check(`${id} follows ${theme} with one visible scene`,state.visibleLayers.length===1&&state.visibleLayers[0]===id);}
   check(`${id} has six distinct matching palettes`,new Set(seen[id].map(p=>JSON.stringify(p))).size===6);
  }
  await page.getByLabel('实验室主题').selectOption('night');await page.waitForTimeout(250);await page.screenshot({path:path.join(out,'orbit-night.png')});
  let a=await snap();await page.waitForTimeout(550);let b=await snap();check('The stellar rings precess while the atmosphere runs',JSON.stringify(a.rings)!==JSON.stringify(b.rings));
  check('Desktop planet text keeps a legible 20px screen size',b.targets.length>=6&&b.targets.every(t=>t.fontPixels>=20));
  await page.locator('.yj-toggle').click();await tab('性能');await page.getByRole('button',{name:'暂停流动',exact:true}).click();await page.waitForTimeout(120);a=await snap();await page.waitForTimeout(500);b=await snap();check('Pausing also freezes every stellar ring',a.time===b.time&&JSON.stringify(a.rings)===JSON.stringify(b.rings));check('Paused graphics stop submitting redundant frames',a.renderFrames===b.renderFrames);
  await tab('性能');await page.getByRole('button',{name:'继续流动',exact:true}).click();await tab('画面');await page.getByLabel('背景跟随应用主题',{exact:true}).uncheck();await tab('画面');await page.getByLabel('光的时刻').selectOption('night');await page.locator('.yj-panel-title button').click();
  a=await snap();await page.getByLabel('实验室主题').selectOption('sepia');await page.waitForTimeout(180);b=await snap();check('Independent scene colours remain available when theme matching is off',a.palette.top===b.palette.top&&a.palette.ink===b.palette.ink);
  await page.locator('.yj-toggle').click();await tab('画面');await page.getByLabel('背景跟随应用主题',{exact:true}).check();await tab('画面');await page.getByRole('button',{name:'进入词语星轨 · 快速刷词',exact:true}).click();await page.waitForTimeout(250);await page.screenshot({path:path.join(out,'game-sepia.png')});
  check('Practice text uses the reader theme ink',await page.locator('.yj-play').evaluate(el=>getComputedStyle(el).color==='rgb(52, 41, 27)'));
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);await page.screenshot({path:path.join(out,'game-mobile.png'),fullPage:true});a=await snap();
  check('Phone planet text remains 16px and does not shrink with the scene',a.targets.length>=5&&a.targets.every(t=>t.fontPixels>=16));
  const windowBox=await page.locator('.yj-orbit-window').boundingBox(),controls=await page.locator('.yj-game-controls').boundingBox();
  check('Phone gives the orbit its own space above the controls',windowBox.height>200&&controls.y>=windowBox.y+windowBox.height&&a.targets.every(t=>t.y>=windowBox.y&&t.y<=windowBox.y+windowBox.height));
  check('Practice has no horizontal overflow on a phone',await page.evaluate(()=>document.querySelector('.yj-play').scrollWidth<=innerWidth));
  await page.getByLabel('自动下一题',{exact:true}).uncheck();await page.locator('.yj-play').evaluate(el=>el.scrollTop=0);await page.waitForTimeout(150);a=await snap();check('All three answer planets remain visible on a phone',a.choices.every(index=>a.targets.some(t=>t.index===index)));const target=a.targets.find(t=>t.index===a.queue[0]);await page.mouse.click(target.x,target.y);check('The phone orbit window accepts direct 3D word picking',(await snap()).learned===1);
  await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:1000});await page.getByLabel('实验室主题').selectOption('blue');await page.locator('[data-scene=ocean]').click();await page.waitForTimeout(500);
  await page.screenshot({path:path.join(out,'ocean-a.png')});a=await snap();await page.waitForTimeout(1100);await page.screenshot({path:path.join(out,'ocean-b.png')});b=await snap();
  check('Continuous sea stays on the native Blender mesh while time advances',a.models.ocean==='ready'&&b.time>a.time&&b.triangles>=18000);
  await page.locator('[data-scene=island]').click();await page.waitForTimeout(400);await page.screenshot({path:path.join(out,'garden-blue.png')});
  check('Book memories use a canvas wall instead of the retired island',(await snap()).models.island==='retired'&&(await snap()).triangles<70000);
  await page.emulateMedia({reducedMotion:'reduce'});a=await snap();await page.waitForTimeout(500);b=await snap();check('Reduced motion freezes the garden and sky clock',a.time===b.time);
  await page.locator('[data-scene=orbit]').click();await page.waitForTimeout(120);a=await snap();await page.waitForTimeout(400);b=await snap();check('Reduced motion also freezes stellar precession',JSON.stringify(a.rings)===JSON.stringify(b.rings));
  await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('http://localhost:5174/');await page.getByRole('button',{name:'导入书籍',exact:true}).waitFor();
  const chooser=page.waitForEvent('filechooser'),imported=page.evaluate(()=>window.readerAPI.books.import());await(await chooser).setFiles({name:'Unicode sea.md',mimeType:'text/markdown',buffer:Buffer.from('# 海边\n\n海洋映出了光。\n\nAn éclat of light crosses the sea.')});const book=await imported;
  await page.evaluate(async book=>{const notebook=await window.readerAPI.vocab.addNotebook('Unicode originals');for(const [word,chineseDef,sourceSentence] of [['海洋','广阔的水域','海洋映出了光。'],['éclat','光彩','An éclat of light crosses the sea.']])await window.readerAPI.vocab.addItem({notebookId:notebook.id,bookId:book.book.id,word,chineseDef,sourceSentence});const cfg=await window.readerAPI.settings.get();await window.readerAPI.settings.set({...cfg,yujing:{...cfg.yujing,enabled:true,scene:'orbit'}});},book);
  await page.reload();await page.locator('.library-book').getByText('Unicode sea',{exact:true}).click();await page.locator('.reader-text p').first().waitFor();await page.getByRole('button',{name:'跃境',exact:true}).click();await tab('画面');await page.getByRole('button',{name:'进入词语星轨 · 快速刷词',exact:true}).click();await page.getByLabel('自动下一题',{exact:true}).uncheck();
  for(let i=0;i<2;i++){a=await snap();const key=a.choices.indexOf(a.queue[0]);const word=(await page.locator('.yj-choices button').nth(key).innerText()).replace(/^\d+\s*/,'');const example=await page.locator('.yj-example p').innerText();check(`Original ${word} example hides the answer before choosing`,example.includes('______')&&!example.includes(word));await page.keyboard.press(String(key+1));check(`Answering restores the exact original ${word} sentence`,(await page.locator('.yj-example p').innerText()).includes(word));await page.keyboard.press('Space');}
  check('All theme changes, sea shaders and model renders stay error-free',errors.length===0);
  fs.writeFileSync(path.join(out,'refinement-checks.json'),JSON.stringify({checkedAt:new Date().toISOString(),checks,errors,palettes:seen},null,2));
 }catch(e){await page.screenshot({path:path.join(out,'refinement-failure.png'),fullPage:true});console.log('STATE',await snap(),'ERRORS',errors);throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
