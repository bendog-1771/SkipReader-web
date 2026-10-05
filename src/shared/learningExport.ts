import type { ReaderNote, VocabItem } from "./types";

export type LearningExportFormat = "html" | "txt" | "md" | "csv" | "words";
export const EXPORT_STYLES: Array<{ value: LearningExportFormat; label: string; description: string }> = [
  { value: "html", label: "精排卡片 · HTML", description: "释义、原文例句和来源分区排版，可用浏览器打开或打印" },
  { value: "txt", label: "复习讲义 · TXT", description: "分条展示完整内容，适合阅读与复制" },
  { value: "md", label: "结构化笔记 · Markdown", description: "保留标题、引用与分隔，适合笔记软件" },
  { value: "csv", label: "数据表格 · CSV", description: "各项内容独立成列，适合电子表格" },
  { value: "words", label: "词书导入 · TXT", description: "仅导出单词，每行一个，自动去重" }
];

export function exportExtension(format: LearningExportFormat): string {
  return format === "words" ? "txt" : format;
}

export function learningExportName(parts: string[]): string {
  // Limit each filter separately so a long title cannot discard later filters
  return parts.filter(Boolean).map((part) => part.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/g, "").slice(0, 22) || "未命名").join("_");
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
const escapeMd = (value: string) => value.replace(/[\\`*_{}\[\]<>()#+.!|~-]/g, "\\$&");
const csvCell = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replace(/"/g, '""')}"`;
type Entry = { title: string; fields: Array<[string, string]> };

function renderEntries(entries: Entry[], format: LearningExportFormat, title: string): string {
  if (format === "csv") {
    const labels = Array.from(new Set(entries.flatMap((entry) => entry.fields.map(([label]) => label))));
    return "\ufeff" + [["条目", ...labels], ...entries.map((entry) => [entry.title, ...labels.map((label) => entry.fields.find(([key]) => key === label)?.[1] || "")])].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }
  if (format === "html") {
    const body = entries.map((entry, index) => `<article><header><span>${String(index + 1).padStart(2, "0")}</span><h2>${escapeHtml(entry.title)}</h2></header>${entry.fields.filter(([, value]) => value).map(([label, value]) => `<section><h3>${escapeHtml(label)}</h3><p>${escapeHtml(value)}</p></section>`).join("")}</article>`).join("\n");
    return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;background:#f4f1eb;color:#25342e;font:16px/1.8 "Segoe UI","Microsoft YaHei",sans-serif}main{max-width:860px;margin:48px auto;padding:0 24px}h1{font-size:28px;overflow-wrap:anywhere}small,h3{color:#6c776f}article{background:white;border:1px solid #dedfd6;border-radius:16px;padding:28px 32px;margin:24px 0;break-inside:avoid}header{display:flex;gap:20px;align-items:baseline;border-bottom:1px solid #e8e9e2;padding-bottom:14px}header span{color:#8b9e8e}h2{margin:0;font-size:26px}h3{font-size:12px;margin:18px 0 4px;font-weight:500}p{white-space:pre-wrap;margin:0;overflow-wrap:anywhere}@media print{body{background:white}main{margin:0;max-width:none}article{box-shadow:none;border-radius:0;padding:18px}h1{font-size:20px}}@media(max-width:600px){main{padding:0 14px}article{padding:20px}}</style><main><small>SkipReader · 阅读积累 · ${entries.length} 条</small><h1>${escapeHtml(title)}</h1>${body}</main></html>`;
  }
  const md = format === "md";
  const body = entries.map((entry, index) => [
    `${md ? "## " : ""}${index + 1}. ${md ? escapeMd(entry.title) : entry.title}`,
    ...entry.fields.filter(([, value]) => value).map(([label, value]) => md
      ? `**${label}**\n\n${escapeMd(value).split(/\r?\n/).map((line) => label.includes("原文") ? `> ${line}` : line).join("\n")}`
      : `${label}\n${value}`)
  ].join("\n\n")).join("\n\n---\n\n");
  return `${md ? "# " : ""}${md ? escapeMd(title) : title}\n共 ${entries.length} 条\n\n${body}\n`;
}

export function renderVocabExport(items: VocabItem[], format: LearningExportFormat, title: string): string {
  if (format === "words") return Array.from(new Map(items.filter((item) => item.word.trim()).map((item) => [item.word.trim().toLowerCase(), item.word.trim()])).values()).join("\n") + "\n";
  return renderEntries(items.map((item) => ({ title: item.word, fields: [
    ["音标", item.phonetic || ""], ["中文释义", item.chineseDef || ""], ["英文释义", item.englishDef || ""],
    ["原文例句", item.sourceSentence || ""], ["词典例句", item.example && item.example !== item.sourceSentence ? item.example : ""],
    ["来源", [item.bookTitle, item.chapterTitle].filter(Boolean).join(" · ") || "未记录来源"],
    ["释义来源与许可", [item.definitionSource, ...(item.attributions || []).map(source => `${source.label}: ${source.url}`)].filter(Boolean).join("\n")]
  ] })), format, title);
}

export function renderNotesExport(notes: ReaderNote[], bookTitles: Record<string, string>, format: LearningExportFormat, title: string): string {
  return renderEntries(notes.map((note) => ({ title: note.chapterTitle || "阅读笔记", fields: [
    ["原文摘录", note.selectedText], ["我的想法", note.noteText || ""],
    ["来源", [bookTitles[note.bookId] || note.bookTitle, note.chapterTitle].filter(Boolean).join(" · ") || "未记录来源"],
    ["线型", note.lineStyle === "wavy" ? "波浪线" : "直线"],
    ["标记颜色", ({ "#f2c94c": "黄色", "#6fcf97": "绿色", "#56ccf2": "蓝色", "#eb5757": "红色", "#bb6bd9": "紫色" } as Record<string, string>)[note.color] || note.color]
  ] })), format, title);
}
