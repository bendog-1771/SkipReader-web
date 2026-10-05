import { DEFAULT_SETTINGS, DEFAULT_YUJING } from "../shared/defaults";
import { renderNotesExport, renderVocabExport, exportExtension, type LearningExportFormat } from "../shared/learningExport";
import type { AppSettings, Book, Chapter, TocItem, Bookmark, Notebook, ReaderNote, ReadingPosition, VocabItem, DictionaryResult } from "../shared/types";
import { cleanBookHtml, importWebBook } from "./importer";
import { Protection } from "./protection";
import { applyDocument } from "./sync-model";
import type { Data } from "./data";
import { createSeaLetterAPI, validSeaLetter } from "./sea-letters";

export type { Data } from "./data";
const fresh = (): Data => ({ settings: { ...structuredClone(DEFAULT_SETTINGS), tts: { ...DEFAULT_SETTINGS.tts, autoScroll: true } }, books: [], chapters: [], tocItems: [], positions: [], chapterPositions: [], bookmarks: [], notebooks: [], vocab: [], notes: [], seaLetters: [] });
let db: IDBDatabase;
let data = fresh();
let queue: Promise<unknown> = Promise.resolve();
let protection: Protection | undefined;
const now = () => new Date().toISOString();
const identified = <T extends object>(value: T) => ({ ...value, id: crypto.randomUUID(), createdAt: now() });
const journalKey = "eread-web-position-journal-v1";

export function browserSettings(input: Partial<AppSettings> = {}): AppSettings {
  const defaults = fresh().settings;
  const settings = { ...defaults, ...input };
  for (const key of ["dictionary", "ai", "tts", "library", "backgrounds", "onboarding", "vocabulary", "shortcuts"] as const) {
    (settings as any)[key] = { ...defaults[key], ...input[key] };
  }
  settings.dictionary.enabled = settings.dictionary.enabled !== false;
  const art = { ...DEFAULT_YUJING, ...input.yujing };
  art.enabled = art.enabled === true;
  if ((art.scene as string) === "train") art.scene = "island";
  if (!["wind", "ocean", "island", "orbit"].includes(art.scene)) art.scene = "ocean";
  if (!["dawn", "day", "dusk", "night"].includes(art.mood)) art.mood = "day";
  if (!["highlights", "chapter", "manual"].includes(art.source)) art.source = "highlights";
  art.blend = art.blend === "mix" ? "mix" : "art";
  art.manualQuotes = Array.isArray(art.manualQuotes) ? art.manualQuotes.filter(q => typeof q === "string").slice(0,24).map(q => q.slice(0,2000)) : [];
  for (const [key, low, high, fallback] of [["speed",0,1.5,.7],["intensity",.1,1,.85],["soundStrength",.5,3,1.8],["readerOpacity",0,1,.78],["planetCount",8,48,24]] as const) art[key] = Number.isFinite(art[key]) ? Math.max(low,Math.min(high,art[key])) : fallback;
  art.paused = art.paused === true;
  art.matchTheme = art.matchTheme === true;
  art.chromeOpacity = Number.isFinite(art.chromeOpacity) ? Math.max(0, Math.min(1, art.chromeOpacity!)) : .34;
  art.bottlesEnabled = art.bottlesEnabled !== false;
  art.quality = ["auto", "battery", "high"].includes(art.quality || "") ? art.quality : "auto";
  art.weather = ["clear", "clouds", "radiant"].includes(art.weather || "") ? art.weather : "radiant";
  settings.yujing = art;
  if (!settings.dictionary.enabled) Object.assign(settings.dictionary, { hover: false, click: false, doubleClick: false, selection: false });
  settings.dictionary.source = "bing";
  settings.dictionary.defaultWebSource = "bing";
  settings.dictionary.pronunciationSource = "bing";
  settings.dictionary.supplementEnglish = false;
  Object.assign(settings.ai, { enabled: false, useBaiduForTranslation: false });
  settings.tts.provider = "webspeech";
  if (!settings.dictionary.enabled) settings.shortcuts.lookup = "";
  settings.onboarding.helpShown = true;
  for (const key of ["appPath", "readerPath"] as const) if (!/^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,/i.test(settings.backgrounds[key])) settings.backgrounds[key] = "";
  return settings;
}

function request<T>(req: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
function complete(tx: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error || new Error("浏览器存储失败，请检查可用空间并导出备份")); }); }
async function write(next: Data, html: Record<string, string> = {}, removeHtml: string[] = [], notify = true) {
  const tx = db.transaction(["state", "html", "chapterText"], "readwrite"), done = complete(tx);
  const stored = { ...next, chapters: next.chapters.map(chapter => {
    if (chapter.plainText) tx.objectStore("chapterText").put(chapter.plainText, chapter.id);
    return { ...chapter, plainText: "" };
  }) };
  tx.objectStore("state").put(stored, "data");
  for (const [id, value] of Object.entries(html)) tx.objectStore("html").put(value, id);
  for (const id of removeHtml) { tx.objectStore("html").delete(id); tx.objectStore("chapterText").delete(id); }
  await done; data = next; if (notify) protection?.changed(next);
}
function mutate<T>(fn: (next: Data) => T, html: Record<string, string> = {}, removeHtml: string[] = [], notify = true): Promise<T> {
  const operation = async () => {
    const run = async () => {
      const saved = await request(db.transaction("state").objectStore("state").get("data"));
      const next = structuredClone(saved || data) as Data;
      const value = fn(next); await write(next, html, removeHtml, notify); return value;
    };
    return navigator.locks ? navigator.locks.request("eread-web-data", run) : run();
  };
  const pending = queue.then(operation); queue = pending.catch(() => undefined); return pending;
}
async function refresh() { await queue; const saved = await request(db.transaction("state").objectStore("state").get("data")); if (saved) data = saved; }
function positionInto(next: Data, position: ReadingPosition) {
  if (!next.books.some(b => b.id === position.bookId)) return;
  const previous = next.positions.find(p => p.bookId === position.bookId);
  if (!previous || previous.updatedAt <= position.updatedAt) next.positions = next.positions.filter(p => p.bookId !== position.bookId).concat(position);
  const chapterPosition = next.chapterPositions.find(p => p.bookId === position.bookId && p.chapterId === position.chapterId);
  if (position.chapterId && (!chapterPosition || chapterPosition.updatedAt <= position.updatedAt)) next.chapterPositions = next.chapterPositions.filter(p => p.bookId !== position.bookId || p.chapterId !== position.chapterId).concat(position);
}
function journal(): ReadingPosition[] { try { return JSON.parse(localStorage.getItem(journalKey) || "[]"); } catch { return []; } }
function clearJournal(position: ReadingPosition) {
  const remaining = journal().filter(p => !(p.bookId === position.bookId && p.chapterId === position.chapterId && p.updatedAt === position.updatedAt));
  localStorage.setItem(journalKey, JSON.stringify(remaining));
}
async function savePosition(position: ReadingPosition) {
  await mutate(next => positionInto(next, position)); clearJournal(position); return position;
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement("input"); input.type = "file"; input.accept = accept;
    input.style.display = "none"; document.body.append(input);
    const finish = (value: File | null) => { input.remove(); resolve(value); };
    input.onchange = () => finish(input.files?.[0] || null); input.addEventListener("cancel", () => finish(null), { once: true });
    input.click();
  });
}
async function dataUrl(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
export function download(content: string | Blob, filename: string): string {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = filename.replace(/[<>:"/\\|?*]/g, "_"); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); return filename;
}
const unavailable = async (): Promise<never> => { throw new Error("网页版暂不支持此功能"); };
async function lookupDictionary(term: string): Promise<DictionaryResult> {
  await refresh();
  const settings = browserSettings(data.settings).dictionary;
  if (!settings.enabled) throw new Error("请先在设置中启用内置查词");
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  const configured = settings.webApiUrl?.trim() || (local ? "" : document.querySelector<HTMLMetaElement>('meta[name="eread-dictionary-api"]')?.content || "");
  if (!configured && !local) throw new Error("查词服务尚未连接，请在设置中填写服务地址，或打开必应词典官网");
  const url = new URL(configured || "/api/dictionary", location.href);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("查词服务地址需要使用 HTTPS");
  if (configured && url.pathname === "/") url.pathname = "/dictionary";
  url.search = ""; url.searchParams.set("q", term); url.searchParams.set("source", "bing");
  url.searchParams.set("supplement", "0");
  let response: Response;
  try { response = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(25000) }); }
  catch { throw new Error(navigator.onLine ? "无法连接查词服务，请检查服务地址或稍后重试" : "当前处于离线状态，请联网后查词"); }
  const value = await response.json().catch(() => null);
  if (!response.ok || !value) throw new Error(value?.error || "查词服务暂时不可用");
  const strings = (items: unknown) => Array.isArray(items) ? items.filter(item => typeof item === "string").slice(0, 20) : [];
  const links = (items: unknown) => Array.isArray(items) ? items.filter(item => typeof item?.label === "string" && /^https:\/\//i.test(item?.url)).slice(0, 12) : [];
  return { term: String(value.term || term), phonetic: String(value.phonetic || ""), chineseDefinition: String(value.chineseDefinition || ""), englishDefinitions: strings(value.englishDefinitions), examples: strings(value.examples), source: String(value.source || "词典"), englishSource: String(value.englishSource || ""), links: links(value.links), attributions: links(value.attributions), ...Object.fromEntries(["audio", "audioUs", "audioUk"].filter(key => /^https:\/\//i.test(value[key] || "")).map(key => [key, value[key]])) };
}
const browserState = { loading: false, canGoBack: false, canGoForward: false, visible: false, url: "" };
function row(value: Record<string, any>): any { return Object.fromEntries(Object.entries(value).map(([key, val]) => [key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), val])); }

async function importBackup() {
  const file = await pickFile(".json"); if (!file) return null;
  const backup = JSON.parse(await file.text());
  if (!backup || !["eRead-web-backup", "eRead-backup"].includes(backup.schema) || ![1, 2].includes(backup.version)) throw new Error("请选择有效的 eRead 备份文件");
  const desktop = backup.schema === "eRead-backup";
  const next = fresh(), html: Record<string, string> = {};
  const sources: Record<Exclude<keyof Data, "settings">, string> = { books: "books", chapters: "chapters", tocItems: "tocItems", positions: desktop ? "readingPositions" : "positions", chapterPositions: desktop ? "readingChapterPositions" : "chapterPositions", bookmarks: "bookmarks", notebooks: "notebooks", vocab: desktop ? "vocabItems" : "vocab", notes: "notes", seaLetters: "seaLetters" };
  for (const [key, source] of Object.entries(sources)) {
    const values = backup[source] ?? [];
    if (!Array.isArray(values) || values.some(v => !v || typeof v !== "object")) throw new Error(`备份中的 ${source} 格式无效`);
    (next as any)[key] = values.map(row);
  }
  next.settings = browserSettings(backup.settings);
  if (next.seaLetters?.some(l => !validSeaLetter(l)) || new Set(next.seaLetters?.map(l => l.id)).size !== next.seaLetters?.length) throw new Error("备份中的漂流信格式无效");
  for (const book of next.books) {
    if (!book.id || typeof book.title !== "string") throw new Error("备份书籍信息无效");
    const raw = (backup.books as any[]).find(b => b.id === book.id);
    if (raw.cover_content_base64) book.coverPath = `data:image/${/png$/i.test(raw.cover_ext) ? "png" : "jpeg"};base64,${raw.cover_content_base64}`;
    if (book.coverPath && !/^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,/i.test(book.coverPath)) book.coverPath = "";
    book.missing = false;
  }
  for (const chapter of next.chapters) {
    if (!chapter.id || !next.books.some(b => b.id === chapter.bookId) || typeof chapter.plainText !== "string") throw new Error("备份章节信息无效");
    const raw = (backup.chapters as any[]).find(c => c.id === chapter.id);
    html[chapter.id] = cleanBookHtml(desktop ? raw.html_content || `<p>${chapter.plainText.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>` : backup.html?.[chapter.id] || "");
    if (!html[chapter.id]) throw new Error("备份缺少章节正文");
  }
  for (const note of next.notes) if (!/^#[0-9a-f]{6}$/i.test(note.color)) note.color = "#f2c94c";
  if (!confirm(`导入后将替换当前网页书库（${next.books.length} 本书）。会先自动下载当前数据备份。是否继续？`)) return null;
  await exportBackup("eRead_导入前备份.json");
  await mutate(current => Object.assign(current, next), html, data.chapters.filter(c => !next.chapters.some(n => n.id === c.id)).map(c => c.id));
  localStorage.removeItem(journalKey);
  return { books: next.books.length, chapters: next.chapters.length, tocItems: next.tocItems.length, notebooks: next.notebooks.length, vocabItems: next.vocab.length, notes: next.notes.length, bookmarks: next.bookmarks.length };
}
async function backupContent() {
  await refresh();
  const backup = structuredClone(data);
  for (const position of journal()) positionInto(backup, position);
  const tx = db.transaction(["html", "chapterText"]);
  const requests = backup.chapters.map(async c => {
    const [html, plainText] = await Promise.all([request(tx.objectStore("html").get(c.id)), request(tx.objectStore("chapterText").get(c.id))]);
    c.plainText = plainText || c.plainText; return [c.id, html];
  });
  const html = Object.fromEntries(await Promise.all(requests));
  return JSON.stringify({ schema: "eRead-web-backup", version: 1, exportedAt: now(), ...backup, html });
}
async function exportBackup(filename = "SkipReader_网页备份.json") { return download(await backupContent(), filename); }

export async function installBrowserAPI() {
  const opening = indexedDB.open("eRead-web", 3);
  opening.onupgradeneeded = () => {
    for (const name of ["state", "html", "chapterText", "controls"]) if (!opening.result.objectStoreNames.contains(name)) opening.result.createObjectStore(name);
    const tx = opening.transaction!, state = tx.objectStore("state"), saved = state.get("data");
    saved.onsuccess = () => { if (!saved.result) return; const next = saved.result as Data; next.chapters.forEach(c => { if (c.plainText) tx.objectStore("chapterText").put(c.plainText, c.id); c.plainText = ""; }); state.put(next, "data"); };
  };
  opening.onblocked = () => { document.getElementById("root")!.textContent = "请关闭其他 SkipReader 网页窗口以完成数据升级，再重新打开。"; };
  db = await request(opening); await refresh();
  data.settings = browserSettings(data.settings);
  for (const position of journal()) await savePosition(position);
  protection = new Protection(db, { current: () => data, snapshot: backupContent, apply: async doc => { await mutate(current => Object.assign(current, applyDocument(current, protection!.mergeForApply(doc))), {}, [], false); } });
  window.skipReaderProtection = protection;
  await protection.initialize();
  window.readerAPI = {
    seaLetters: createSeaLetterAPI({ refresh, current: () => data, mutate, chapterText: async id => await request(db.transaction("chapterText").objectStore("chapterText").get(id)) || "" }),
    books: {
      import: async () => {
        const file = await pickFile(".epub,.txt,.md,.markdown,.docx"); if (!file) return null;
        const result = await importWebBook(file);
        await mutate(next => {
          if (next.books.some(b => b.contentKey === result.book.contentKey && !b.deletedAt)) throw new Error("这本书已在书库中");
          const previous = next.books.find(b => b.contentKey === result.book.contentKey && b.deletedAt && !b.associationDismissedAt && !b.associatedBookId);
          if (previous) result.associationCandidate = { oldBookId: previous.id, oldTitle: previous.title, oldAuthor: previous.author, deletedAt: previous.deletedAt, notes: next.notes.filter(n => n.bookId === previous.id).length, vocabItems: next.vocab.filter(v => v.bookId === previous.id).length, bookmarks: next.bookmarks.filter(b => b.bookId === previous.id).length };
          next.books.push(result.book); next.chapters.push(...result.chapters); next.tocItems.push(...result.tocItems);
        }, result.html);
        await protection?.remap(); void navigator.storage?.persist?.(); return result;
      },
      list: async () => { await refresh(); return data.books.filter(b => !b.deletedAt); },
      open: async (bookId, options) => {
        await refresh(); const book = data.books.find(b => b.id === bookId && !b.deletedAt); if (!book) throw new Error("请先在这台设备导入同一本书，再定位到原文；云端不上传整本书");
        if (options?.touchLastOpened !== false) await mutate(next => { const b = next.books.find(b => b.id === bookId)!; b.lastOpenedAt = now(); });
        const selected = data.chapters.filter(c => c.bookId === bookId).sort((a, b) => a.orderIndex - b.orderIndex);
        const tx = db.transaction("chapterText");
        const chapters = await Promise.all(selected.map(async c => ({ ...c, plainText: await request(tx.objectStore("chapterText").get(c.id)) || c.plainText })));
        return { book: { ...book }, chapters, tocItems: data.tocItems.filter(t => t.bookId === bookId), position: data.positions.find(p => p.bookId === bookId) || null, chapterPositions: data.chapterPositions.filter(p => p.bookId === bookId), bookmarks: data.bookmarks.filter(b => b.bookId === bookId) };
      },
      chapterHtml: async id => await request(db.transaction("html").objectStore("html").get(id)) || "",
      chapterText: async id => await request(db.transaction("chapterText").objectStore("chapterText").get(id)) || "",
      savePosition,
      savePositionSync: position => {
        try { localStorage.setItem(journalKey, JSON.stringify(journal().filter(p => p.bookId !== position.bookId || p.chapterId !== position.chapterId).concat(position))); positionInto(data, position); void savePosition(position).catch(console.error); return position; } catch { return null; }
      },
      addBookmark: async value => mutate(next => { const bookmark = identified(value); next.bookmarks.push(bookmark); return bookmark; }),
      deleteBookmark: async id => mutate(next => { next.bookmarks = next.bookmarks.filter(b => b.id !== id); }),
      delete: async id => mutate(next => { const book = next.books.find(b => b.id === id); if (book) book.deletedAt = now(); }),
      associateDeletedContent: async (oldId, newId) => mutate(next => {
        const previous = next.chapters.filter(c => c.bookId === oldId), current = next.chapters.filter(c => c.bookId === newId);
        const mapped = new Map(previous.map(c => [c.id, current.find(n => n.title === c.title)?.id || current.find(n => n.orderIndex === c.orderIndex)?.id]));
        let notes = 0, vocabItems = 0, bookmarks = 0;
        for (const note of next.notes) if (note.bookId === oldId && mapped.get(note.chapterId)) { note.bookId = newId; note.chapterId = mapped.get(note.chapterId)!; notes++; }
        for (const item of next.vocab) if (item.bookId === oldId) { item.bookId = newId; if (item.chapterId) item.chapterId = mapped.get(item.chapterId); vocabItems++; }
        for (const bookmark of next.bookmarks) if (bookmark.bookId === oldId) { bookmark.bookId = newId; if (bookmark.chapterId) bookmark.chapterId = mapped.get(bookmark.chapterId); bookmarks++; }
        const previousBook = next.books.find(b => b.id === oldId); if (previousBook) previousBook.associatedBookId = newId;
        return { notes, vocabItems, bookmarks };
      }),
      dismissAssociation: async id => mutate(next => { const book = next.books.find(b => b.id === id); if (book) book.associationDismissedAt = now(); }),
      relocate: async () => { throw new Error("网页书籍保存在浏览器中；如需恢复旧数据，请导入完整备份"); },
      rename: async (id, title) => mutate(next => { const book = next.books.find(b => b.id === id)!; book.title = title; book.updatedAt = now(); return book; }),
      exportCover: async id => { await refresh(); const cover = data.books.find(b => b.id === id)?.coverPath; if (!cover) return null; const blob = await (await fetch(cover)).blob(); return download(blob, "eRead_封面." + (blob.type.split("/")[1] === "jpeg" ? "jpg" : blob.type.split("/")[1] || "png")); },
      exportNotes: async (id, mode) => { await refresh(); const book = data.books.find(b => b.id === id)!; return download(renderNotesExport(data.notes.filter(n => n.bookId === id && (mode !== "ideas" || n.noteText)), { [id]: book.title }, "md", book.title), `${book.title}_笔记.md`); }
    },
    settings: { get: async () => { await refresh(); return browserSettings(data.settings); }, set: async value => mutate(next => { next.settings = browserSettings(value); return next.settings; }), importBackground: async () => { const file = await pickFile(".png,.jpg,.jpeg,.webp,.gif,.avif,.bmp"); return file ? dataUrl(file) : null; } },
    secrets: { set: unavailable, has: async () => false },
    vocab: {
      list: async () => { await refresh(); return { notebooks: data.notebooks, items: data.vocab }; },
      addNotebook: async name => mutate(next => { const notebook = identified({ name }); next.notebooks.push(notebook); return notebook; }),
      renameNotebook: async (id, name) => mutate(next => { const notebook = next.notebooks.find(n => n.id === id)!; notebook.name = name; return notebook; }),
      deleteNotebook: async id => mutate(next => { next.notebooks = next.notebooks.filter(n => n.id !== id); next.vocab = next.vocab.filter(v => v.notebookId !== id); }),
      addItem: async value => mutate(next => { const item = identified(value); next.vocab.push(item); return item; }),
      deleteItem: async id => mutate(next => { next.vocab = next.vocab.filter(v => v.id !== id); }),
      exportTxt: async id => { await refresh(); return download(renderVocabExport(data.vocab.filter(v => v.notebookId === id), "words", "生词本"), "生词本.txt"); },
      exportCsv: async id => { await refresh(); return download(renderVocabExport(data.vocab.filter(v => v.notebookId === id), "csv", "生词本"), "生词本.csv"); },
      exportItems: async (items, format, name = "生词") => download(renderVocabExport(items, format, name), `${name}.${exportExtension(format)}`)
    },
    notes: {
      list: async id => { await refresh(); return data.notes.filter(n => n.bookId === id); }, listAll: async () => { await refresh(); return data.notes; },
      add: async value => mutate(next => { const note = identified(value); next.notes.push(note); return note; }),
      update: async (id, patch) => mutate(next => { const note = next.notes.find(n => n.id === id); if (!note) throw new Error("笔记不存在"); Object.assign(note, patch); return note; }),
      delete: async id => mutate(next => { next.notes = next.notes.filter(n => n.id !== id); }),
      exportItems: async (notes, titles, format: LearningExportFormat = "md", name = "笔记") => download(renderNotesExport(notes, titles, format, name), `${name}.${exportExtension(format)}`)
    },
    dictionary: { lookup: term => lookupDictionary(term), lookupWithSource: term => lookupDictionary(term), lookupBingBasic: term => lookupDictionary(term), openOfficial: async url => { if (/^https:\/\//i.test(url)) window.open(url, "_blank", "noopener,noreferrer"); }, browserShow: async () => browserState, browserSetBounds: async () => browserState, browserHide: async () => browserState, browserControl: async () => browserState, onBrowserState: () => () => {} },
    ai: { ask: unavailable }, tts: { edgeSpeak: async () => ({ available: false, error: "网页版使用浏览器免费朗读" }) },
    backup: { export: () => exportBackup(), import: importBackup },
    logs: { export: async () => download(JSON.stringify({ version: "web-0.1", secureContext: isSecureContext, userAgent: navigator.userAgent, storage: await navigator.storage?.estimate?.() }, null, 2), "eRead_网页诊断.json") },
    window: { toggleMaximize: async () => { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); return Boolean(document.fullscreenElement); } }
  };
}
