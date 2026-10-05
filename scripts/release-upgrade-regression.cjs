// Stages a disposable old-site library, then verifies its ordinary PWA update after deployment.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,browserOptions}=require('./browser-test-runtime.cjs');
const out=path.resolve('reports/release'),flag=path.resolve(process.env.SKIPREADER_UPGRADE_FLAG||'work/release-deployed.flag'),url=process.env.SKIPREADER_UPGRADE_URL||'https://bendog-1771.github.io/eRead-web/';
async function run(){
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch(browserOptions),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),checks=[],errors=[];
 const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(url);await page.waitForFunction(()=>window.readerAPI);
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller&&window.readerAPI);
  const oldCache=await page.evaluate(()=>caches.keys());
  const chooser=page.waitForEvent('filechooser'),imported=page.evaluate(()=>window.readerAPI.books.import());await(await chooser).setFiles({name:'Release upgrade QA.md',mimeType:'text/markdown',buffer:Buffer.from('# 保留的书\n\nOnly this disposable test browser contains this passage.\n\n书籍、笔记和单词应该在版本更新后保持。')});const book=await imported;
  const saved=await page.evaluate(async b=>{
   const note=await window.readerAPI.notes.add({bookId:b.book.id,chapterId:b.chapters[0].id,selectedText:'书籍、笔记和单词应该在版本更新后保持。',noteText:'PWA upgrade fixture',color:'yellow'}),n=await window.readerAPI.vocab.addNotebook('Release QA'),word=await window.readerAPI.vocab.addItem({word:'resonance',chineseDef:'共鸣',sourceSentence:'The resonance stays.',notebookId:n.id,bookId:b.book.id});
   const s=await window.readerAPI.settings.get();await window.readerAPI.settings.set({...s,theme:'sepia',dictionary:{...s.dictionary,enabled:false}});
   return{bookId:b.book.id,noteId:note.id,wordId:word.id};
  },book);
  check('Old production service worker and disposable library are ready',oldCache.length>0&&saved.bookId);
  fs.writeFileSync(path.join(out,'upgrade-staged.json'),JSON.stringify({oldCache,saved,stagedAt:new Date().toISOString()},null,2));console.log('WAITING_FOR_DEPLOYMENT');
  const deadline=Date.now()+30*60*1000;while(!fs.existsSync(flag)){if(Date.now()>deadline)throw new Error('Deployment wait expired');await new Promise(r=>setTimeout(r,2000));}
  // Recreate the browser badge if the old client had dismissed it.
  await page.reload();await page.waitForFunction(()=>window.readerAPI);
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
  await page.getByRole('button',{name:'更新版本',exact:true}).waitFor({timeout:120000});
  check('An old installed client receives the normal update button',await page.getByRole('button',{name:'更新版本',exact:true}).isVisible());
  await page.getByRole('button',{name:'更新版本',exact:true}).click();await page.waitForFunction(()=>window.readerAPI&&window.skipReaderYujingSnapshot,{},{timeout:120000});
  const s=await page.evaluate(()=>window.readerAPI.settings.get());
  check('Updating preserves the existing theme and explicit dictionary-off choice',s.theme==='sepia'&&!s.dictionary.enabled);
  check('Art stays opt-in after updating an existing reader',!s.yujing.enabled&&await page.locator('.yj-scene canvas').count()===0);
  const intact=await page.evaluate(async saved=>{const books=await window.readerAPI.books.list(),notes=await window.readerAPI.notes.listAll(),vocab=(await window.readerAPI.vocab.list()).items;return books.some(b=>b.id===saved.bookId)&&notes.some(n=>n.id===saved.noteId&&n.noteText==='PWA upgrade fixture')&&vocab.some(w=>w.id===saved.wordId&&w.chineseDef==='共鸣');},saved);
  check('PWA update preserves exact book, note and vocabulary identities',intact);
  await page.getByRole('button',{name:`阅读《${book.book.title}》`,exact:true}).click();await page.locator('.reader-text').waitFor();check('The saved book still opens as ordinary DOM text',(await page.locator('.reader-text').innerText()).includes('Only this disposable'));
  await page.getByRole('button',{name:'跃境',exact:true}).click();await page.locator('.yj-scene-picks').getByRole('button',{name:'海的慢呼吸',exact:true}).click();await page.getByLabel('光的时刻').selectOption('dusk');await page.getByLabel('关闭气候设置').click();await page.waitForFunction(()=>window.skipReaderYujingSnapshot().models.ocean==='ready'&&window.skipReaderYujingSnapshot().skyAsset==='dusk');
  check('Deployed HDR sky and native ocean model load on the tested site',(await page.evaluate(()=>window.skipReaderYujingSnapshot())).celestial.visible);
  check('Reading on the tested site hides bottles and correspondence',await page.locator('.yj-sea-dock').count()===0&&(await page.evaluate(()=>window.skipReaderYujingSnapshot())).bottles.length===0);
  await page.screenshot({path:path.join(out,'online-ocean-reader.png')});
  const cache=await page.evaluate(()=>caches.keys());check('The new worker replaces the old asset cache',cache.some(k=>!oldCache.includes(k))&&oldCache.every(k=>!cache.includes(k)));
  await context.setOffline(true);await page.reload();await page.waitForFunction(()=>window.readerAPI&&window.skipReaderYujingSnapshot?.().skyAsset==='dusk');await page.getByRole('button',{name:`阅读《${book.book.title}》`,exact:true}).click();await page.locator('.reader-text').waitFor();check('The updated reader and previously used sky work offline',(await page.locator('.reader-text').innerText()).includes('Only this disposable'));
  check('No uncaught exceptions during the production upgrade',errors.length===0);
  fs.writeFileSync(path.join(out,process.env.SKIPREADER_UPGRADE_REPORT||'online-upgrade-checks.json'),JSON.stringify({url,checkedAt:new Date().toISOString(),checks,errors,oldCache,cache},null,2));
 }catch(e){await page.screenshot({path:path.join(out,'online-upgrade-failure.png'),fullPage:true});throw e;}finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
