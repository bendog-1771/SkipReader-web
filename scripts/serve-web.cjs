const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../web-site/public");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".json": "application/json" };
const worker = import('../dictionary-worker/worker.mjs').then(module => module.default);
http.createServer(async (req,res)=>{
  const requestUrl = new URL(req.url, 'http://localhost:5174');
  if (requestUrl.pathname === '/api/dictionary' || requestUrl.pathname === '/health') {
    try {
      const headers = new Headers(req.headers);
      if (!headers.has('Origin')) headers.set('Origin', 'http://localhost:5174');
      const result = await (await worker).fetch(new Request(requestUrl, { method: req.method, headers }));
      res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(await result.text());
    } catch { res.writeHead(502, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: '查词服务暂时不可用' })); }
    return;
  }
  let filename;
  try { const pathname = decodeURIComponent(new URL(req.url,"http://localhost").pathname).replace(/^\/(?:SkipReader-web|eRead-web)(?=\/)/,"" ); filename = path.resolve(root, "." + pathname); } catch { res.writeHead(400).end(); return; }
  if (filename !== root && !filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (filename === root) filename = path.join(root,"index.html");
  fs.readFile(filename,(error,buffer)=>{ if(error){res.writeHead(404).end("Not found");return;} res.writeHead(200,{"Content-Type":types[path.extname(filename)]||"application/octet-stream","Cache-Control":"no-cache"}).end(buffer); });
}).listen(Number(process.env.SKIPREADER_PORT || 5174),"127.0.0.1",()=>console.log("SkipReader Web: http://localhost:" + (process.env.SKIPREADER_PORT || 5174)));
