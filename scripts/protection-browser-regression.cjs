const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const { chromium, browserOptions } = require('./browser-test-runtime.cjs');
const out=path.resolve(__dirname,'../reports/sync');fs.mkdirSync(out,{recursive:true});
async function run(){
 const browser=await chromium.launch(browserOptions);
 const contexts=await Promise.all([browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1100}}),browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1100}})]);
 const pages=await Promise.all(contexts.map(c=>c.newPage())),[a,b]=pages,checks=[],errors=[];let created=false;
 const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
 pages.forEach(p=>p.on('pageerror',e=>errors.push(e.message)));
 const ready=async p=>{await p.goto(process.env.SKIPREADER_TEST_URL||'http://localhost:5174/');await p.waitForFunction(()=>!!window.readerAPI&&!!window.skipReaderProtection);await p.getByRole('button',{name:'导入书籍',exact:true}).waitFor();};
 const panel=async p=>{await p.getByTitle('设置',{exact:true}).click();await p.locator('.settings-categories').getByRole('button',{name:'备份与日志',exact:true}).click();};
 const fixture='# First\n\nPRIVATE-BOOK-TEXT only stays local. A curious reader saves a short quote.\n\n# Second\n\nA second chapter.';
 const importBook=async p=>{const chooser=p.waitForEvent('filechooser');await p.getByRole('button',{name:'导入书籍',exact:true}).click();await(await chooser).setFiles({name:'Cloud-fixture.md',mimeType:'text/markdown',buffer:Buffer.from(fixture)});await p.locator('.library-book').getByText('Cloud-fixture',{exact:true}).waitFor();};
 const add=async(p,text)=>p.evaluate(async text=>{const api=window.readerAPI,book=(await api.books.list())[0],opened=await api.books.open(book.id,{touchLastOpened:false});return api.notes.add({bookId:book.id,chapterId:opened.chapters[0].id,selectedText:'A curious reader',startOffset:40,endOffset:56,lineStyle:'solid',color:'#edc565',noteText:text});},text);
 const sync=p=>p.evaluate(()=>window.skipReaderProtection.sync());
 const notes=p=>p.evaluate(()=>window.readerAPI.notes.listAll());
 try{
  await ready(a);await ready(b);check('New name and icon appear',await a.title()==='SkipReader · 一跃'&&await a.locator('.brand-icon').count()===1);
  await importBook(a);const first=await add(a,'Private-note-alpha');await panel(a);
  await a.getByRole('button',{name:'创建云账号',exact:true}).click();await a.getByRole('button',{name:'下载登录恢复卡',exact:true}).waitFor();created=true;
  check('First upload waits for explicit recovery-card confirmation',await a.getByRole('button',{name:'开启云同步',exact:true}).isDisabled());
  const downloadPromise=a.waitForEvent('download');await a.getByRole('button',{name:'下载登录恢复卡',exact:true}).click();const download=await downloadPromise;const card=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  check('Recovery card is separate from book backup',card.schema==='skipreader-login-card'&&!JSON.stringify(card).includes('Private-note-alpha')&&await a.getByRole('button',{name:'开启云同步',exact:true}).isDisabled());
  await a.getByRole('checkbox',{name:'我已把恢复卡保存在浏览器之外'}).check();await a.getByRole('button',{name:'开启云同步',exact:true}).click();await a.getByRole('button',{name:'立即同步',exact:true}).waitFor();await a.waitForFunction(()=>window.skipReaderProtection.state().cloud==='学习记录已同步');
  check('Real cloud account activation uploads encrypted learning records',true);
  await panel(b);await b.getByLabel('云账号登录码',{exact:true}).fill(card.code);await b.getByRole('button',{name:'登录并合并记录',exact:true}).click();await b.getByRole('button',{name:'立即同步',exact:true}).waitFor();await b.waitForFunction(()=>window.skipReaderProtection.state().cloud==='学习记录已同步');
  check('Independent browser receives notes before importing book',(await notes(b)).some(n=>n.noteText==='Private-note-alpha'&&n.bookId.startsWith('cloud:')));
  await b.locator('.settings-modal .float-close').click();await importBook(b);
  const mapped=await b.evaluate(async()=>{const book=(await window.readerAPI.books.list())[0],opened=await window.readerAPI.books.open(book.id,{touchLastOpened:false}),note=(await window.readerAPI.notes.listAll())[0];return note.bookId===book.id&&note.chapterId===opened.chapters[0].id;});check('Import on second device reconnects note to actual original text',mapped);
  const second=await add(b,'Private-note-beta');await sync(b);await sync(a);check('New notes merge across actual devices',(await notes(a)).length===2);
  const before=await a.evaluate(()=>window.skipReaderProtection.history());check('Learning changes create cloud history',before.length>0);
  await a.evaluate(id=>window.readerAPI.notes.delete(id),first.id);await sync(a);await sync(b);check('Deleting a note propagates without resurrection',!(await notes(b)).some(n=>n.id===first.id));
  await contexts[1].setOffline(true);await add(b,'Offline-note');check('Offline edits remain readable locally',(await notes(b)).some(n=>n.noteText==='Offline-note'));await assert.rejects(sync(b));await contexts[1].setOffline(false);await sync(b);await sync(a);check('Offline changes merge when network returns',(await notes(a)).some(n=>n.noteText==='Offline-note'));
  const history=await a.evaluate(()=>window.skipReaderProtection.history());await a.evaluate(rev=>window.skipReaderProtection.restore(rev),before[0].revision);await sync(b);
  check('Cloud history restores earlier records across devices',(await notes(a)).some(n=>n.id===first.id)&&!(await notes(b)).some(n=>n.noteText==='Offline-note'));
  check('History restore preserves full local book',(await a.evaluate(()=>window.readerAPI.books.list())).length===1);
  const packet=await a.evaluate(async()=>{const p=window.skipReaderProtection,code=p.loginCode();const raw=JSON.parse(p.recoveryCard());const bytes=Uint8Array.from(atob(code.slice(6).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));const material=await crypto.subtle.importKey('raw',bytes,'HKDF',false,['deriveBits']);const tokenBytes=new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:new TextEncoder().encode('SkipReader cloud v1'),info:new TextEncoder().encode('authentication')},material,256));const token=btoa(String.fromCharCode(...tokenBytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');const response=await fetch(raw.service+'/state',{headers:{Authorization:'Bearer '+token}});return {body:await response.text(),codeSent:token===code.slice(6)};});
  check('Real server stores ciphertext and never receives recovery secret',!packet.codeSent&&!/Private-note|PRIVATE-BOOK-TEXT/.test(packet.body));
  // Use a real browser directory handle in isolated OPFS; stub only the OS folder chooser.
  await a.evaluate(async()=>{const root=await navigator.storage.getDirectory();window.testBackupDirectory=await root.getDirectoryHandle('isolated-backup',{create:true});window.showDirectoryPicker=async()=>window.testBackupDirectory;const file=await window.testBackupDirectory.getFileHandle('my-important-file.txt',{create:true}),writer=await file.createWritable();await writer.write('keep');await writer.close();});
  await a.evaluate(()=>window.skipReaderProtection.chooseFolder());
  const files=await a.evaluate(async()=>{const entries=[];for await(const[name,h]of window.testBackupDirectory.entries())if(h.kind==='file')entries.push(name);return entries;});check('Auto backup writes a complete file outside application database',files.some(n=>n.startsWith('SkipReader_自动备份_')));
  const backup=await a.evaluate(async()=>{for await(const[name,h]of window.testBackupDirectory.entries())if(name.startsWith('SkipReader_自动备份_'))return JSON.parse(await(await h.getFile()).text());});check('File backup includes full book and restored notes',JSON.stringify(backup).includes('PRIVATE-BOOK-TEXT')&&JSON.stringify(backup).includes('Private-note-alpha')&&!JSON.stringify(backup).includes(card.code));
  await a.evaluate(async()=>{const m=window.skipReaderProtection;await m.configureBackup(15,3);for(let i=0;i<4;i++)await m.backup(true);});
  const retention=await a.evaluate(async()=>{let count=0,unrelated=false;for await(const[name,h]of window.testBackupDirectory.entries()){if(name.startsWith('SkipReader_自动备份_'))count++;if(name==='my-important-file.txt')unrelated=await(await h.getFile()).text()==='keep';}return{count,unrelated};});check('Backup retention keeps only selected count and never deletes unrelated files',retention.count===3&&retention.unrelated);
  await a.reload();await a.waitForFunction(()=>!!window.skipReaderProtection);check('Backup handle and cloud login survive reopening',await a.evaluate(()=>!!window.skipReaderProtection.state().directory&&!!window.skipReaderProtection.state().account));
  await panel(a);await a.setViewportSize({width:390,height:900});await a.screenshot({path:path.join(out,'mobile-protection.png'),fullPage:true});
  check('Data protection controls stay within mobile viewport',await a.evaluate(()=>[...document.querySelectorAll('.protection-panel button,.protection-panel select')].every(e=>{const r=e.getBoundingClientRect();return r.width===0||r.left>=0&&r.right<=innerWidth+1;})));
  check('New protection functionality has no uncaught browser errors',errors.length===0);
  fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,errors,cloudService:'https://skipreader-sync.eread-dictionary-worker.workers.dev'},null,2));console.log(`${checks.length} browser checks passed`);
 } finally {if(created)await a.evaluate(()=>window.skipReaderProtection.deleteAccount()).catch(()=>{});await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
