const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,browserOptions}=require('./browser-test-runtime.cjs');
async function run(){const browser=await chromium.launch(browserOptions),context=await browser.newContext(),page=await context.newPage(),checks=[];const check=(n,v)=>{assert.ok(v,n);checks.push(n);console.log('PASS '+n);};
 try{
  await page.addInitScript(()=>{
   if(sessionStorage.getItem('legacy-seeded'))return;sessionStorage.setItem('legacy-seeded','true');
   const req=indexedDB.open('eRead-web',2);
   req.onupgradeneeded=()=>{const db=req.result;for(const store of ['state','html','chapterText'])db.createObjectStore(store);
    req.transaction.objectStore('state').put({settings:{},books:[{id:'legacy-book',title:'Legacy fixture',contentKey:'legacyhash',filePath:'Legacy.md',fileType:'md',importedAt:'2026-01-01',updatedAt:'2026-01-01'}],chapters:[{id:'legacy-ch',bookId:'legacy-book',title:'One',orderIndex:0,plainText:''}],tocItems:[],positions:[{bookId:'legacy-book',chapterId:'legacy-ch',scrollTop:123,updatedAt:'2026-01-01'}],chapterPositions:[],notebooks:[],vocab:[],bookmarks:[],notes:[{id:'legacy-note',bookId:'legacy-book',chapterId:'legacy-ch',chapterTitle:'One',selectedText:'Original text',noteText:'Legacy private idea',lineStyle:'solid',color:'#ccc',createdAt:'2026-01-01'}]},'data');
    req.transaction.objectStore('html').put('<h1>One</h1><p>Original text</p>','legacy-ch');req.transaction.objectStore('chapterText').put('Original text','legacy-ch');};req.onsuccess=()=>req.result.close();
  });
  await page.goto('http://localhost:5174/');await page.waitForFunction(()=>!!window.readerAPI);
  check('Legacy version-2 library remains after version-3 upgrade',(await page.evaluate(()=>window.readerAPI.books.list()))[0].title==='Legacy fixture');
  check('Old private notes remain intact',(await page.evaluate(()=>window.readerAPI.notes.listAll()))[0].noteText==='Legacy private idea');
  check('Legacy original HTML survives unchanged',(await page.evaluate(()=>window.readerAPI.books.chapterHtml('legacy-ch'))).includes('Original text'));
  check('Saved position survives schema upgrade',(await page.evaluate(()=>window.readerAPI.books.open('legacy-book',{touchLastOpened:false}))).position.scrollTop===123);
  const schema=await page.evaluate(()=>new Promise(resolve=>{const req=indexedDB.open('eRead-web');req.onsuccess=()=>{const db=req.result;resolve({version:db.version,controls:db.objectStoreNames.contains('controls')});db.close();};}));check('Upgrade adds data protection store without resetting old stores',schema.version===3&&schema.controls);
  const second=await context.newPage();await second.goto('http://localhost:5174/');await second.waitForFunction(()=>!!window.readerAPI);
  const add=(p,text)=>p.evaluate(text=>window.readerAPI.notes.add({bookId:'legacy-book',chapterId:'legacy-ch',chapterTitle:'One',selectedText:'Original text',noteText:text,lineStyle:'solid',color:'#ccc'}),text);
  await Promise.all([add(page,'First tab'),add(second,'Second tab')]);await new Promise(r=>setTimeout(r,100));
  check('Two tabs preserve both concurrent local changes',(await page.evaluate(()=>window.readerAPI.notes.listAll())).length===3);
  const ledger=await page.evaluate(()=>new Promise(resolve=>{const req=indexedDB.open('eRead-web');req.onsuccess=()=>{const db=req.result,r=db.transaction('controls').objectStore('controls').get('protection');r.onsuccess=()=>{resolve(JSON.stringify(r.result.document));db.close();};};}));check('Protection ledger preserves changes from both tabs',ledger.includes('First tab')&&ledger.includes('Second tab'));
  fs.mkdirSync(path.resolve(__dirname,'../reports/sync'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../reports/sync/upgrade.json'),JSON.stringify({checks},null,2));
 }finally{await browser.close();}}
run().catch(e=>{console.error(e);process.exitCode=1;});
