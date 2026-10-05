const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "web-site", "public");
const dictionaryConfigPath = path.join(root, "web-site", "dictionary-config.json");
const dictionaryApi = fs.existsSync(dictionaryConfigPath) ? JSON.parse(fs.readFileSync(dictionaryConfigPath, "utf8")).apiUrl || "" : "";
const syncConfigPath = path.join(root, "web-site", "sync-config.json");
const syncApi = fs.existsSync(syncConfigPath) ? JSON.parse(fs.readFileSync(syncConfigPath, "utf8")).apiUrl || "" : "";
if (syncApi && !/^https:\/\/[\w.-]+$/.test(syncApi)) throw new Error("Sync endpoint must be an HTTPS origin");
if (dictionaryApi && (!/^https:\/\/[\w.-]+(?::\d+)?(?:\/[^"<>]*)?$/.test(dictionaryApi))) throw new Error("Dictionary endpoint must be an HTTPS URL");
fs.mkdirSync(path.join(out, "assets"), { recursive: true });
const result = esbuild.buildSync({
  absWorkingDir: root, entryPoints: { app: "./src/web/main.ts", "yujing-lab": "./src/web/yujing/lab.tsx" }, bundle: true,
  outdir: path.join(out, "assets"), entryNames: "[name]", chunkNames: "[name]-[hash]",
  format: "esm", platform: "browser", target: ["chrome105", "firefox115", "safari16"],
  jsx: "automatic", splitting: true, minify: true, metafile: true,
  loader: { ".glb": "file", ".hdr": "file" },
  define: { "process.env.NODE_ENV": '"production"' }
});
const outputs = Object.keys(result.metafile.outputs).map(p => "./" + path.relative(out, path.resolve(root, p)).replace(/\\/g, "/"));
const css = outputs.filter(p => p.endsWith(".css") && !p.endsWith("/yujing-lab.css"));
fs.copyFileSync(path.join(root, "assets", "skipreader-icon.png"), path.join(out, "icon.png"));
fs.copyFileSync(path.join(root, "assets", "skipreader-icon.svg"), path.join(out, "icon.svg"));
const iconHash = require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(out, "icon.png"))).digest("hex").slice(0, 12);
const installIcons = [192, 512].map(size => {
  const filename = `icon-${iconHash}-${size}.png`;
  fs.copyFileSync(path.join(root, "assets", size === 512 ? "skipreader-icon.png" : "skipreader-icon-192.png"), path.join(out, filename));
  return { src: "./" + filename, sizes: `${size}x${size}`, type: "image/png", purpose: "any" };
});
// Include the runtime dependencies' licenses, including dependencies embedded in mammoth's browser bundle.
const notices = [], seenPackages = new Set();
function collectLicenses(directory) {
  if (seenPackages.has(directory)) return;
  seenPackages.add(directory);
  const pkg = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  const licenseFiles = fs.readdirSync(directory).filter(name => /^(?:licen[sc]e|copying)(?:\.|$)/i.test(name));
  let license = licenseFiles.map(name => fs.readFileSync(path.join(directory, name), "utf8")).join("\n\n");
  if (pkg.name === "jszip") license = license.split("GPL version 3")[0] + "\nJSZip is used under the MIT option.\n";
  notices.push(`${pkg.name} ${pkg.version} · ${pkg.license || "See license below"}\n${license || JSON.stringify({ author: pkg.author, license: pkg.license, repository: pkg.repository }, null, 2)}`);
  for (const dependency of Object.keys(pkg.dependencies || {})) collectLicenses(path.dirname(require.resolve(dependency + "/package.json", { paths: [directory] })));
}
for (const dependency of ["react", "react-dom", "jszip", "marked", "mammoth"]) collectLicenses(path.dirname(require.resolve(dependency + "/package.json", { paths: [root] })));
const threeDirectory = path.dirname(path.dirname(require.resolve("three", { paths: [root] })));
collectLicenses(threeDirectory);
fs.writeFileSync(path.join(out, "third-party-notices.txt"), "SkipReader · Third-party software notices\n\n" + notices.join("\n\n----------------------------------------\n\n") + "\n\n" + fs.readFileSync(path.join(root, "assets/yuejing/sky/LICENSE.md"), "utf8"));
// Rounded artwork uses purpose:any so browsers don't crop the composition again.
fs.writeFileSync(path.join(out, "manifest.webmanifest"), JSON.stringify({ id: "./", name: "SkipReader · 一跃", short_name: "一跃", description: "免费阅读器，自动文件备份与可选加密学习记录同步", lang: "zh-CN", start_url: "./", scope: "./", display: "standalone", background_color: "#f3efe7", theme_color: "#f3efe7", icons: installIcons }, null, 2));
fs.writeFileSync(path.join(out, "index.html"), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f3efe7"><meta name="eread-dictionary-api" content="${dictionaryApi.replace(/&/g, "&amp;")}"><meta name="skipreader-sync-api" content="${syncApi}"><meta name="description" content="一跃 SkipReader：免费阅读器，支持浏览器查词插件、自动文件备份和可选加密云同步"><title>SkipReader · 一跃</title><link rel="icon" href="./icon.png"><link rel="manifest" href="./manifest.webmanifest">${css.map(p=>`<link rel="stylesheet" href="${p}">`).join("")}</head><body><div id="root">正在打开一跃…</div><script type="module" src="./assets/app.js"></script></body></html>`);
fs.writeFileSync(path.join(out, "lab.html"), '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SkipReader · 跃境实验室</title><link rel="icon" href="./icon.png"><link rel="stylesheet" href="./assets/yujing-lab.css"></head><body><div id="root"></div><script type="module" src="./assets/yujing-lab.js"></script></body></html>');
const files = ["./", "./index.html", "./lab.html", "./manifest.webmanifest", "./icon.png", "./icon.svg", ...installIcons.map(icon => icon.src), "./third-party-notices.txt", ...outputs];
const optionalFiles = files.filter(file => file.endsWith('.hdr'));
const coreFiles = files.filter(file => !file.endsWith('.hdr'));
const hash = require("node:crypto").createHash("sha256");
for (const file of files.filter(p => p !== "./")) hash.update(fs.readFileSync(path.join(out, file)));
const version = "eread-web-" + hash.digest("hex").slice(0, 16);
fs.writeFileSync(path.join(out, "sw.js"), `const CACHE=${JSON.stringify(version)};const FILES=${JSON.stringify(coreFiles)};const OPTIONAL=${JSON.stringify(optionalFiles)};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('eread-web-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
const known=[...FILES,...OPTIONAL].some(file=>new URL(file,self.registration.scope).href===event.request.url);
if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match(new URL('./index.html',self.registration.scope))));
else if(known)event.respondWith(caches.open(CACHE).then(async cache=>{const hit=await cache.match(event.request);if(hit)return hit;const response=await fetch(event.request);if(response.ok){const copy=response.clone();event.waitUntil(cache.put(event.request,copy));}return response;}));});`);
fs.writeFileSync(path.join(out, "_headers"), "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n");
console.log("Web build ready: " + out);
