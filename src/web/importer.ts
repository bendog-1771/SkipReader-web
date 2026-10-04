import JSZip from "jszip";
import { marked } from "marked";
import { buildTocItemsFromChapters, buildTocItemsFromSource, isChapterHeadingText, isContainerHeadingText } from "../main/services/bookImport/toc";
import { escapeHtml, htmlToPlainText, wordCount } from "../main/services/bookImport/html";
import type { Book, Chapter, TocItem, BookAssociationCandidate } from "../shared/types";

export type WebImport = { book: Book; chapters: Chapter[]; tocItems: TocItem[]; html: Record<string, string>; associationCandidate?: BookAssociationCandidate };
const safeTags = new Set("p div section article h1 h2 h3 h4 h5 h6 blockquote ul ol li pre code table thead tbody tfoot tr th td figure figcaption img br hr span strong em b i u s small sub sup a dl dt dd ruby rt rp".split(" "));

// Books are untrusted input. Keep readable markup and internal links, never executable content.
export function cleanBookHtml(value: string): string {
  const doc = new DOMParser().parseFromString(value, "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,form,input,button,textarea,select,link,meta,base,svg,math").forEach(el => el.remove());
  for (const el of Array.from(doc.body.querySelectorAll("*"))) {
    if (!safeTags.has(el.localName)) { el.replaceWith(...Array.from(el.childNodes)); continue; }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const text = attr.value.trim();
      const allowed = ["id", "title", "alt", "colspan", "rowspan", "href", "src"].includes(name);
      const safeLink = name !== "href" || (!/^(?:[a-z][\w+.-]*:|\/\/)/i.test(text) && !text.includes("\\"));
      const safeImage = name !== "src" || /^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,/i.test(text);
      if (!allowed || !safeLink || !safeImage) el.removeAttribute(attr.name);
    }
  }
  return doc.body.innerHTML;
}

function xml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("电子书 XML 格式无效");
  return doc;
}
const all = (node: Document | Element, tag: string) => Array.from(node.getElementsByTagNameNS("*", tag));
const localPath = (base: string, href: string) => {
  const parts: string[] = [];
  for (const part of (base + "/" + href.split("#")[0]).split("/")) {
    if (part === "..") parts.pop(); else if (part && part !== ".") parts.push(part);
  }
  return decodeURIComponent(parts.join("/"));
};
const dirname = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));

export async function importWebBook(file: File): Promise<WebImport> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (!["epub", "txt", "md", "markdown", "docx"].includes(ext)) throw new Error("请选择 EPUB、TXT、Markdown 或 DOCX 文件");
  const bytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const contentKey = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
  const now = new Date().toISOString();
  const book: Book = { id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ""), filePath: file.name, fileType: ext, contentKey, importedAt: now, updatedAt: now, missing: false };
  const result: WebImport = { book, chapters: [], tocItems: [], html: {} };
  function add(title: string, source: string, href?: string) {
    const html = cleanBookHtml(source);
    const plainText = htmlToPlainText(html);
    if (!plainText && !html.includes("<img")) return;
    const chapter: Chapter = { id: crypto.randomUUID(), bookId: book.id, title, href, orderIndex: result.chapters.length, plainText, wordCount: wordCount(plainText) };
    result.chapters.push(chapter); result.html[chapter.id] = html;
  }
  if (ext === "epub") {
    const zip = await JSZip.loadAsync(bytes);
    const read = async (path: string) => { const entry = zip.file(path); if (!entry) throw new Error(`电子书缺少文件：${path}`); return entry.async("string"); };
    const container = xml(await read("META-INF/container.xml"));
    const opfPath = all(container, "rootfile")[0]?.getAttribute("full-path");
    if (!opfPath) throw new Error("无法找到 EPUB 正文目录");
    const base = dirname(opfPath), opf = xml(await read(opfPath));
    book.title = all(opf, "title")[0]?.textContent?.trim() || book.title;
    book.author = all(opf, "creator")[0]?.textContent?.trim();
    const manifest = all(opf, "item");
    const imageData = new Map<string, string>();
    async function image(path: string, mime?: string) {
      if (imageData.has(path)) return imageData.get(path)!;
      const entry = zip.file(path); if (!entry) return "";
      const type = mime || manifest.find(i => localPath(base, i.getAttribute("href") || "") === path)?.getAttribute("media-type") || "";
      if (!/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(type)) return "";
      const data = `data:${type};base64,${await entry.async("base64")}`; imageData.set(path, data); return data;
    }
    const coverId = all(opf, "meta").find(m => m.getAttribute("name") === "cover")?.getAttribute("content");
    const cover = manifest.find(i => i.getAttribute("properties")?.split(/\s+/).includes("cover-image") || i.getAttribute("id") === coverId);
    if (cover) book.coverPath = await image(localPath(base, cover.getAttribute("href") || ""), cover.getAttribute("media-type") || undefined);
    for (const ref of all(opf, "itemref")) {
      const item = manifest.find(i => i.getAttribute("id") === ref.getAttribute("idref"));
      if (!item || !/html/.test(item.getAttribute("media-type") || "")) continue;
      const path = localPath(base, item.getAttribute("href") || "");
      const doc = new DOMParser().parseFromString(await read(path), "text/html");
      for (const img of Array.from(doc.querySelectorAll("img"))) img.setAttribute("src", await image(localPath(dirname(path), img.getAttribute("src") || "")));
      for (const svg of Array.from(doc.querySelectorAll("svg"))) {
        const href = svg.querySelector("image")?.getAttribute("xlink:href") || svg.querySelector("image")?.getAttribute("href");
        if (href) { const img = doc.createElement("img"); img.src = await image(localPath(dirname(path), href)); svg.replaceWith(img); }
      }
      for (const link of Array.from(doc.querySelectorAll("a[href]"))) {
        const href = link.getAttribute("href") || "";
        // The shared reader resolves these links relative to chapter.href.
        if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(href)) link.removeAttribute("href");
      }
      const title = doc.querySelector("h1,h2,h3")?.textContent?.trim() || doc.title || `第 ${result.chapters.length + 1} 章`;
      add(title, doc.body.innerHTML, path);
    }
    const nav = manifest.find(i => i.getAttribute("properties")?.split(/\s+/).includes("nav"));
    const ncx = manifest.find(i => i.getAttribute("media-type") === "application/x-dtbncx+xml");
    const source: Array<{ id?: string; parentId?: string; title: string; href: string; level: number }> = [];
    if (nav) {
      const path = localPath(base, nav.getAttribute("href") || "");
      const doc = new DOMParser().parseFromString(await read(path), "text/html");
      const root = Array.from(doc.querySelectorAll("nav")).find(n => /toc/.test(n.getAttribute("epub:type") || n.getAttribute("role") || "")) || doc.querySelector("nav");
      for (const a of Array.from(root?.querySelectorAll("a[href]") || [])) {
        let level = -1; for (let p = a.parentElement; p && p !== root; p = p.parentElement) if (p.localName === "ol") level++;
        const href = a.getAttribute("href")!;
        source.push({ title: a.textContent?.trim() || "目录", href: localPath(dirname(path), href) + (href.includes("#") ? "#" + href.split("#")[1] : ""), level: Math.max(0, level) });
      }
    } else if (ncx) {
      const path = localPath(base, ncx.getAttribute("href") || ""); const doc = xml(await read(path));
      for (const point of all(doc, "navPoint")) {
        let level = 0; for (let p = point.parentElement; p; p = p.parentElement) if (p.localName === "navPoint") level++;
        const href = all(point, "content")[0]?.getAttribute("src") || "";
        source.push({ title: all(point, "text")[0]?.textContent || "目录", href: localPath(dirname(path), href) + (href.includes("#") ? "#" + href.split("#")[1] : ""), level });
      }
    }
    if (source.length) {
      const stack: string[] = [];
      source.forEach((item, index) => { item.id = `source-${index}`; item.parentId = item.level > 0 ? stack[item.level - 1] : undefined; stack[item.level] = item.id; stack.length = item.level + 1; });
      result.tocItems = buildTocItemsFromSource(book.id, source, result.chapters);
    }
  } else {
    let source: string;
    if (ext === "docx") {
      const mammoth = await import("mammoth/mammoth.browser");
      source = (await ((mammoth as any).default || mammoth).convertToHtml({ arrayBuffer: bytes })).value;
    } else {
      const b = new Uint8Array(bytes);
      const encoding = b[0] === 255 && b[1] === 254 ? "utf-16le" : b[0] === 254 && b[1] === 255 ? "utf-16be" : "utf-8";
      const text = new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/, "");
      source = ext === "txt" ? text.split(/\r?\n/).map(line => isChapterHeadingText(line) ? `<h2>${escapeHtml(line)}</h2>` : line.trim() ? `<p>${escapeHtml(line)}</p>` : "").join("\n") : await marked.parse(text);
    }
    const doc = new DOMParser().parseFromString(cleanBookHtml(source), "text/html");
    let title = "正文", content = "", parent = "";
    const flush = () => { if (content.trim()) add(parent && title !== parent ? `${parent} · ${title}` : title, content); content = ""; };
    for (const el of Array.from(doc.body.childNodes)) {
      if (el instanceof HTMLElement && (/^H[1-3]$/.test(el.tagName) || (el.tagName === "P" && isChapterHeadingText(el.textContent || "")))) {
        flush(); title = el.textContent?.trim() || "正文";
        if (isContainerHeadingText(title)) { parent = title; continue; }
      }
      content += el instanceof HTMLElement ? el.outerHTML : escapeHtml(el.textContent || "");
    }
    flush();
  }
  if (!result.chapters.length) throw new Error("这本书没有可读取的正文");
  if (!result.tocItems.length) result.tocItems = buildTocItemsFromChapters(book.id, result.chapters);
  return result;
}
