const CACHE="eread-web-4e12c0afdbaafc6f";const FILES=["./","./index.html","./manifest.webmanifest","./icon.png","./icon.svg","./third-party-notices.txt","./assets/app.js","./assets/mammoth.browser-MV4MZANE.js","./assets/App-K2QNVOEQ.js","./assets/chunk-JDIHTBEQ.js","./assets/chunk-ZWRDP37E.js","./assets/app.css","./assets/App-6NKSNWK2.css"];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('eread-web-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
const known=FILES.some(file=>new URL(file,self.registration.scope).href===event.request.url);
if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match(new URL('./index.html',self.registration.scope))));
else if(known)event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request).then(hit=>hit||fetch(event.request))));});