import type { Data } from "./data";
export type SyncEntry = { kind: string; id: string; value: any; stamp: number; actor: string };
export type SyncDocument = { schema: "skipreader-learning"; version: 1; entries: Record<string, SyncEntry> };
export const emptyDocument = (): SyncDocument => ({ schema: "skipreader-learning", version: 1, entries: {} });
const kinds = ["bookmeta", "notes", "vocab", "bookmarks", "notebooks", "positions", "chapterPositions"];
const refOf = (data: Data, id: string) => data.books.find(book => book.id === id)?.contentKey || (id.startsWith("cloud:") ? id.slice(6) : id);
function chapterRef(data: Data, id?: string) { const chapter = data.chapters.find(chapter => chapter.id === id); return chapter ? `order:${chapter.orderIndex}` : id?.includes("|order:") ? id.slice(id.indexOf("|order:") + 1) : id || ""; }
export function valuesOf(data: Data): Record<string, { kind: string; id: string; value: any }> {
 const result: ReturnType<typeof valuesOf> = {};
 for (const book of data.books) {
  const id = refOf(data, book.id);
  result[`bookmeta:${id}`] = { kind: "bookmeta", id, value: { title: book.title, author: book.author || "", contentKey: book.contentKey || "", chapters: data.chapters.filter(c => c.bookId === book.id).map(c => ({ orderIndex: c.orderIndex, title: c.title })) } };
 }
 for (const kind of kinds.filter(k => k !== "bookmeta")) {
  for (const row of (data as any)[kind] || []) {
   const value = structuredClone(row);
   if (value.bookId) { value.bookId = refOf(data, value.bookId); value.bookTitle ||= data.books.find(b => refOf(data, b.id) === value.bookId)?.title || ""; }
   if (value.chapterId) value.chapterId = chapterRef(data, value.chapterId);
   const id = kind === "positions" ? value.bookId : kind === "chapterPositions" ? `${value.bookId}/${value.chapterId}` : value.id;
   result[`${kind}:${id}`] = { kind, id, value };
  }
 }
 return result;
}
export function mergeDocuments(a: SyncDocument, b: SyncDocument): SyncDocument {
 const merged = structuredClone(a);
 for (const [key, entry] of Object.entries(b.entries)) {
  const existing = merged.entries[key];
  if (!existing || entry.stamp > existing.stamp || entry.stamp === existing.stamp && entry.actor > existing.actor) merged.entries[key] = structuredClone(entry);
 }
 return merged;
}
export function validateDocument(value: any): SyncDocument {
 if (value?.schema !== "skipreader-learning" || value?.version !== 1 || !value.entries || typeof value.entries !== "object" || Array.isArray(value.entries) || Object.keys(value.entries).length > 20000) throw new Error("云端记录格式无效，请使用导出备份恢复");
 for (const [key, e] of Object.entries(value.entries) as [string, any][]) {
  if (!e || !kinds.includes(e.kind) || typeof e.id !== "string" || e.id.length > 300 || key !== `${e.kind}:${e.id}` || !Number.isSafeInteger(e.stamp) || e.stamp < 0 || typeof e.actor !== "string" || e.actor.length > 80) throw new Error("云端记录格式无效");
  if (e.value !== null && (typeof e.value !== "object" || Array.isArray(e.value))) throw new Error("云端记录格式无效");
  if (e.value && ["notes", "vocab", "bookmarks", "notebooks"].includes(e.kind) && e.value.id !== e.id) throw new Error("云端记录标识无效");
  if (e.value && e.kind === "notes" && (typeof e.value.selectedText !== "string" || !["solid", "wavy"].includes(e.value.lineStyle))) throw new Error("云端笔记格式无效");
  if (e.value && e.kind === "vocab" && typeof e.value.word !== "string") throw new Error("云端生词格式无效");
 }
 return value;
}
export function applyDocument(data: Data, document: SyncDocument): Data {
 const next = structuredClone(data);
 for (const kind of kinds.filter(k => k !== "bookmeta")) {
  (next as any)[kind] = Object.values(document.entries).filter(e => e.kind === kind && e.value !== null).map(e => {
   const value = structuredClone(e.value);
   if (value.bookId) {
    const ref = value.bookId, book = next.books.find(b => refOf(next, b.id) === ref && !b.deletedAt);
    const meta = document.entries[`bookmeta:${ref}`]?.value;
    value.bookTitle ||= meta?.title || "未导入的书籍";
    value.bookId = book?.id || `cloud:${ref}`;
    if (value.chapterId) {
     const order = /^order:(\d+)$/.exec(value.chapterId);
     const chapter = book && order && next.chapters.find(c => c.bookId === book.id && c.orderIndex === Number(order[1]));
     value.chapterId = chapter?.id || `cloud:${ref}|${value.chapterId}`;
    }
   }
   return value;
  });
 }
 return next;
}
export const canonical = (doc: SyncDocument) => JSON.stringify(Object.fromEntries(Object.entries(doc.entries).sort(([a], [b]) => a.localeCompare(b))));
export const learningCanonical = (doc: SyncDocument) => JSON.stringify(Object.fromEntries(Object.entries(doc.entries).filter(([, e]) => !["positions", "chapterPositions", "bookmeta"].includes(e.kind)).sort(([a], [b]) => a.localeCompare(b))));
export function base64url(bytes: Uint8Array): string { let text = ""; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
export function fromBase64url(value: string): Uint8Array<ArrayBuffer> { const text = atob(value.replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(text, c => c.charCodeAt(0)); }
const enc = new TextEncoder();
export async function digest(value: string) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value)))].map(v => v.toString(16).padStart(2, "0")).join(""); }
export async function credentials(code: string) {
 if (!/^SKIP1\.[A-Za-z0-9_-]{43}$/.test(code.trim())) throw new Error("请粘贴完整的 SkipReader 登录码，或导入登录恢复卡");
 const material = await crypto.subtle.importKey("raw", fromBase64url(code.trim().slice(6)), "HKDF", false, ["deriveBits", "deriveKey"]);
 const params = (info: string) => ({ name: "HKDF", hash: "SHA-256", salt: enc.encode("SkipReader cloud v1"), info: enc.encode(info) });
 const token = base64url(new Uint8Array(await crypto.subtle.deriveBits(params("authentication"), material, 256)));
 const key = await crypto.subtle.deriveKey(params("encryption"), material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
 return { token, key, id: (await digest(token)).slice(0, 32) };
}
export async function encrypt(document: SyncDocument, key: CryptoKey) {
 const bytes = enc.encode(JSON.stringify(document)); if (bytes.length > 500000) throw new Error("学习记录超过本次免费同步容量（约 500KB），请先导出完整备份");
 const iv = crypto.getRandomValues(new Uint8Array(12));
 const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode("skipreader-learning-v1") }, key, bytes);
 return { version: 1, iv: base64url(iv), ciphertext: base64url(new Uint8Array(ciphertext)) };
}
export async function decrypt(envelope: any, key: CryptoKey): Promise<SyncDocument> {
 if (envelope?.version !== 1 || !/^[A-Za-z0-9_-]{16}$/.test(envelope.iv || "") || typeof envelope.ciphertext !== "string" || envelope.ciphertext.length > 720000) throw new Error("云端加密记录格式无效");
 try { const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64url(envelope.iv), additionalData: enc.encode("skipreader-learning-v1") }, key, fromBase64url(envelope.ciphertext)); return validateDocument(JSON.parse(new TextDecoder().decode(plain))); }
 catch { throw new Error("无法解密云端记录，请确认使用了正确的登录恢复卡"); }
}
