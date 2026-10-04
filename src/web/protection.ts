import type { Data } from "./data";
import { base64url, canonical, credentials, decrypt, digest, emptyDocument, encrypt, learningCanonical, mergeDocuments, valuesOf, type SyncDocument } from "./sync-model";
type Adapters = { current: () => Data; snapshot: () => Promise<string>; apply: (document: SyncDocument) => Promise<void> };
type Config = { directory?: any; interval: number; retention: number; lastBackup?: string; backupEnabled: boolean; session?: { code: string; id: string; confirmed: boolean }; lastSync?: string; document: SyncDocument; actor: string; clock: number };
const request = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const defaultConfig = (): Config => ({ interval: 15, retention: 7, backupEnabled: false, document: emptyDocument(), actor: crypto.randomUUID(), clock: Date.now() });
export class Protection {
 private config = defaultConfig(); private work: Promise<any> = Promise.resolve(); private timer?: number; private syncWork?: Promise<void>; private backingUp = false; private backupDirty = true; private dirtyVersion = 0; private baseline: ReturnType<typeof valuesOf> = {}; private listeners = new Set<() => void>();
 private status = { backup: "尚未设置自动文件备份", cloud: "云同步未开启", busy: false, error: "" };
 constructor(private db: IDBDatabase, private adapters: Adapters) {}
 private async save() {
  const tx = this.db.transaction("controls", "readwrite"), store = tx.objectStore("controls");
  const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error); });
  const stored = await request(store.get("protection"));
  if (stored && stored.session?.id === this.config.session?.id) {
   this.config.document = mergeDocuments(stored.document, this.config.document);
   this.config.clock = Math.max(this.config.clock, stored.clock);
  }
  store.put(this.config, "protection"); await done;
 }
 private emit() { this.listeners.forEach(fn => fn()); }
 subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
 state() { return { ...this.status, interval: this.config.interval, retention: this.config.retention, backupEnabled: this.config.backupEnabled, directory: this.config.directory?.name || "", lastBackup: this.config.lastBackup, account: this.config.session?.id.slice(0, 8) || "", needsCard: !!this.config.session && !this.config.session.confirmed, lastSync: this.config.lastSync, folderSupported: typeof (window as any).showDirectoryPicker === "function" }; }
 async initialize() {
  const saved = await request(this.db.transaction("controls").objectStore("controls").get("protection"));
  if (saved) this.config = { ...defaultConfig(), ...saved };
  this.config.actor = crypto.randomUUID();
  this.baseline = valuesOf(this.adapters.current());
  this.seed(); await this.save();
  this.status.backup = this.config.backupEnabled ? "自动备份已开启，正在检查文件夹权限" : "尚未设置自动文件备份";
  this.status.cloud = this.config.session ? "云账号已登录，等待同步" : "云同步未开启"; this.emit();
  window.setInterval(() => { void this.backup(false); if (this.config.session && navigator.onLine && document.visibilityState === "visible") void this.sync().catch(() => {}); }, 60000);
  window.addEventListener("online", () => { if (this.config.session) void this.sync().catch(() => {}); });
  window.addEventListener("offline", () => { this.status.cloud = this.config.session ? "离线：修改已保存在本地，联网后同步" : "云同步未开启"; this.emit(); });
  window.addEventListener("focus", () => { if (this.config.session) void this.sync().catch(() => {}); });
  if (this.config.session) void this.sync().catch(() => {});
  if (this.config.backupEnabled) void this.backup(false);
 }
 private seed() {
  for (const [key, entry] of Object.entries(this.baseline)) if (!this.config.document.entries[key]) this.config.document.entries[key] = { ...entry, actor: this.config.actor, stamp: Math.min(Date.now(), Date.parse(entry.value.updatedAt || entry.value.createdAt || "") || Date.now()) };
 }
 changed(data: Data) {
  this.backupDirty = true; this.dirtyVersion++;
  const captured = valuesOf(data);
   for (const key of new Set([...Object.keys(this.baseline), ...Object.keys(captured)])) {
    const previous = this.baseline[key], next = captured[key];
    if (JSON.stringify(previous?.value) === JSON.stringify(next?.value) || !next && previous?.kind === "bookmeta") continue;
    const entry = next || previous; this.config.clock = Math.max(Date.now(), this.config.clock + 1);
    this.config.document.entries[key] = { kind: entry.kind, id: entry.id, value: next?.value ?? null, stamp: this.config.clock, actor: this.config.actor };
   }
   this.baseline = captured;
   this.work = this.work.then(() => this.save()).catch(error => { this.status.error = "同步记录暂时无法保存：" + error.message; this.emit(); });
  if (!this.timer) this.timer = window.setTimeout(() => { this.timer = undefined; void this.backup(false); if (this.config.session) void this.sync().catch(() => {}); }, 15000);
 }
 async chooseFolder() {
  if (typeof (window as any).showDirectoryPicker !== "function") throw new Error("此浏览器不支持自动写入文件夹，请用 Edge／Chrome，或使用导出备份");
  const directory = await (window as any).showDirectoryPicker({ id: "skipreader-backup", mode: "readwrite", startIn: "documents" });
  this.config.directory = directory; this.config.backupEnabled = true; this.backupDirty = true; await this.save(); await this.backup(true); this.emit();
 }
 async authorizeFolder() { if (!this.config.directory) return this.chooseFolder(); const permission = await this.config.directory.requestPermission({ mode: "readwrite" }); if (permission !== "granted") throw new Error("未获得文件夹写入权限，已有备份文件不受影响"); this.config.backupEnabled = true; await this.save(); await this.backup(true); }
 async configureBackup(interval: number, retention: number) { if (![15, 60, 1440].includes(interval) || ![3, 7, 14].includes(retention)) throw new Error("备份设置无效"); this.config.interval = interval; this.config.retention = retention; await this.save(); this.emit(); }
 async pauseBackup() { this.config.backupEnabled = false; await this.save(); this.status.backup = "自动文件备份已暂停，已有文件仍保留"; this.emit(); }
 async backup(force = false) {
  if (this.backingUp || !this.config.backupEnabled || !this.config.directory) return;
  if (!force && (!this.backupDirty || Date.now() - Date.parse(this.config.lastBackup || "1970-01-01") < this.config.interval * 60000)) return;
  this.backingUp = true;
  try {
   const directory = this.config.directory;
   if (await directory.queryPermission({ mode: "readwrite" }) !== "granted") { this.status.backup = "需要重新授权：点击“允许继续备份”"; return; }
   const dirtyVersion = this.dirtyVersion, content = await this.adapters.snapshot();
   const stamp = new Date().toISOString().replace(/[-:.]/g, "");
   const filename = `SkipReader_自动备份_${stamp}_${crypto.randomUUID().slice(0, 8)}.json`;
   const file = await directory.getFileHandle(filename, { create: true }), writer = await file.createWritable();
   try { await writer.write(content); await writer.close(); } catch (error) { await writer.abort().catch(() => {}); throw error; }
   const files: string[] = [];
   for await (const [name, handle] of directory.entries()) if (handle.kind === "file" && /^SkipReader_自动备份_\d{8}T\d{9}Z_[a-f0-9]{8}\.json$/.test(name)) files.push(name);
   for (const name of files.sort().reverse().slice(this.config.retention)) await directory.removeEntry(name);
   this.config.lastBackup = new Date().toISOString(); this.backupDirty = this.dirtyVersion !== dirtyVersion; await this.save(); this.status.backup = "自动备份成功";
  } catch (error: any) { this.status.backup = "自动备份未完成：" + error.message; }
  finally { this.backingUp = false; this.emit(); }
 }
 private endpoint() { const value = document.querySelector<HTMLMetaElement>('meta[name="skipreader-sync-api"]')?.content; if (!value || !/^https:\/\//.test(value)) throw new Error("云同步服务尚未连接"); return value.replace(/\/$/, ""); }
 private async api(path: string, options: RequestInit = {}, code = this.config.session?.code) {
  if (!code) throw new Error("请先登录云账号");
  if (!navigator.onLine) throw new Error("当前离线，修改已保存在本地，联网后再同步");
  const { token } = await credentials(code);
  let response: Response;
  try { response = await fetch(this.endpoint() + path, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { "Content-Type": "application/json" } : {}) }, credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(25000) }); }
  catch { throw new Error("无法连接云同步服务，修改仍保存在本地，请稍后重试"); }
  const value = await response.json().catch(() => ({}));
  if (!response.ok) { const error: any = new Error(value.error || "云同步暂时不可用"); error.status = response.status; throw error; }
  return value;
 }
 recoveryCard(code = this.config.session?.code) { if (!code) throw new Error("请先创建或登录云账号"); return JSON.stringify({ schema: "skipreader-login-card", version: 1, code, service: this.endpoint(), note: "此登录码可读取和解密你的云端学习记录。请妥善保存，不要分享或放进公开仓库。它不是书籍备份。" }, null, 2); }
 loginCode() { return this.config.session?.code || ""; }
 async create() {
  if (this.config.session) throw new Error("请先退出当前云账号");
  const code = "SKIP1." + base64url(crypto.getRandomValues(new Uint8Array(32))), auth = await credentials(code);
  await this.api("/accounts", { method: "POST" }, code);
  this.config.session = { code, id: auth.id, confirmed: false }; this.config.document = emptyDocument(); this.seed(); await this.save(); this.status.cloud = "账号已创建，请先保存登录恢复卡"; this.emit();
  // The UI saves the recovery card before enabling its first upload.
  return code;
 }
 async login(code: string) {
  await this.work;
  const auth = await credentials(code.trim()); await this.api("/state", {}, code.trim());
  this.config.session = { code: code.trim(), id: auth.id, confirmed: true }; this.config.document = emptyDocument(); this.seed(); await this.save(); await this.sync();
 }
 async logout() { await this.work; this.config.session = undefined; this.config.document = emptyDocument(); await this.save(); this.status.cloud = "已退出云账号，本地资料仍保留"; this.emit(); }
 async deleteAccount() { await this.api("/accounts", { method: "DELETE" }); await this.logout(); }
 async activate() { if (!this.config.session) throw new Error("请先创建账号"); this.config.session.confirmed = true; await this.save(); await this.sync(); }
 mergeForApply(doc: SyncDocument) { this.config.document = mergeDocuments(doc, this.config.document); return this.config.document; }
 private async apply(doc: SyncDocument) {
  await this.adapters.apply(doc); this.baseline = valuesOf(this.adapters.current()); this.backupDirty = true; this.dirtyVersion++;
  window.dispatchEvent(new Event("skipreader-data-updated"));
 }
 async remap() { await this.work; if (Object.keys(this.config.document.entries).length) await this.apply(this.config.document); }
 async sync() {
  if (this.syncWork) return this.syncWork;
  if (!this.config.session?.confirmed) return;
  this.syncWork = this.performSync();
  try { await this.syncWork; } finally { this.syncWork = undefined; }
 }
 private async performSync() {
  this.status.busy = true; this.status.cloud = "正在合并云端学习记录…"; this.emit();
  try {
   const run = async () => {
    await this.work;
    const session = this.config.session!; const auth = await credentials(session.code);
    for (let attempt = 0; attempt < 4; attempt++) {
     const remote = await this.api("/state", {}, session.code);
     const remoteDoc = remote.envelope ? await decrypt(remote.envelope, auth.key) : emptyDocument();
     await this.work;
     if (this.config.session?.id !== session.id) throw new Error("登录状态已改变，请重新同步");
     const merged = mergeDocuments(this.config.document, remoteDoc);
     this.config.clock = Math.max(this.config.clock, ...Object.values(merged.entries).map(e => e.stamp));
     const changed = canonical(merged) !== canonical(this.config.document);
     this.config.document = merged; await this.save();
     if (changed) await this.apply(merged);
     await this.work; const outgoing = structuredClone(this.config.document);
     if (canonical(outgoing) !== canonical(remoteDoc)) {
      try { await this.api("/state", { method: "PUT", body: JSON.stringify({ revision: remote.revision, envelope: await encrypt(outgoing, auth.key), digest: await digest(learningCanonical(outgoing)) }) }, session.code); }
      catch (error: any) { if (error.status === 409) continue; throw error; }
     }
     this.config.lastSync = new Date().toISOString(); await this.save(); this.status.cloud = "学习记录已同步"; return;
    }
    throw new Error("其他设备正在更新，请稍后再次同步");
   };
   if (navigator.locks) await navigator.locks.request("skipreader-cloud-sync", run); else await run();
  } catch (error: any) { this.status.cloud = error.message; throw error; }
  finally { this.status.busy = false; this.emit(); }
 }
 async history() { const value = await this.api("/history"); return value.items as Array<{ revision: number; savedAt: string }>; }
 async restore(revision: number) {
  await this.sync(); const session = this.config.session; if (!session) throw new Error("请先登录");
  const saved = await this.api(`/history/${revision}`), restored = await decrypt(saved.envelope, (await credentials(session.code)).key);
  await this.work;
  const next = emptyDocument();
  for (const key of new Set([...Object.keys(this.config.document.entries), ...Object.keys(restored.entries)])) {
   const old = restored.entries[key], current = this.config.document.entries[key];
   this.config.clock = Math.max(Date.now(), this.config.clock + 1);
   next.entries[key] = { ...(old || current), value: old?.value ?? null, stamp: this.config.clock, actor: this.config.actor };
  }
  this.config.document = next; await this.save(); await this.apply(next); await this.backup(true); await this.sync();
 }
}
declare global { interface Window { skipReaderProtection?: Protection } }
