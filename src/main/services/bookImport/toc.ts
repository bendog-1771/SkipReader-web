import type { Chapter, TocItem, TocItemKind } from "../../../shared/types";

type TocSourceItem = {
  id?: string;
  parentId?: string;
  title: string;
  href?: string;
  level?: number;
  orderIndex?: number;
};

export function classifyTocTitle(title: string, hasChildren = false): TocItemKind {
  const clean = title.trim().replace(/\s+/g, " ");
  if (isContainerHeadingText(clean) || (hasChildren && !isContentHeadingText(clean))) return "part";
  if (isBackmatterHeadingText(clean)) return "backmatter";
  if (isFrontmatterHeadingText(clean)) return "frontmatter";
  if (isContentHeadingText(clean) || isStandaloneChapterNumber(clean)) return "chapter";
  return "section";
}

export function isChapterHeadingText(line: string): boolean {
  const clean = line.trim().replace(/\s+/g, " ");
  if (!clean || clean.length > 140) return false;
  if (/^第[一二三四五六七八九十百千万\d]+[章节部卷篇]\b/.test(clean)) return true;
  if (isFrontmatterHeadingText(clean)) return true;
  if (/^(?:prologue|序章|楔子)(?:\b|[:.\-—]|$)/i.test(clean)) return true;
  const numberWord = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)";
  const ordinal = "(?:\\d+|[ivxlcdm]+|" + numberWord + ")(?:[-\\s]+" + numberWord + ")*";
  return new RegExp("^(?:part|book|chapter|section)\\s+" + ordinal + "(?:\\b|\\s*[:.\\-—])", "i").test(clean);
}

export function isContainerHeadingText(title: string): boolean {
  return /^(?:part|book)\b/i.test(title.trim()) || /^第[一二三四五六七八九十百千万\d]+[部卷篇]\b/.test(title.trim());
}

export function isContentHeadingText(title: string): boolean {
  return !isContainerHeadingText(title) && isChapterHeadingText(title);
}

export function isLeafTocTitle(title: string): boolean {
  const clean = title.trim();
  return isContentHeadingText(clean) || isStandaloneChapterNumber(clean);
}

export function isStandaloneChapterNumber(title: string): boolean {
  return /^(?:\d+|[ivxlcdm]+)$/i.test(title.trim());
}

export function isWeakTocTitle(title: string): boolean {
  const clean = title.trim();
  return /^第[一二三四五六七八九十百千万\d]+章$/.test(clean);
}

export function hasSubstantialReadingText(text: string, title: string): boolean {
  const withoutTitle = text.replace(title, "").trim();
  return wordCountLike(withoutTitle) >= 20 || withoutTitle.length >= 120;
}

export function buildTocItemsFromChapters(bookId: string, chapters: Chapter[]): TocItem[] {
  const items: TocItem[] = [];
  const parentByTitle = new Map<string, TocItem>();
  for (const chapter of chapters) {
    const titleParts = chapter.title.split(/\s+[·›]\s+/).map((item) => item.trim()).filter(Boolean);
    const parentTitle = titleParts.length > 1 && isContainerHeadingText(titleParts[0]) ? titleParts[0] : "";
    let parent: TocItem | undefined;
    if (parentTitle) {
      parent = parentByTitle.get(parentTitle);
      if (!parent) {
        parent = makeTocItem(bookId, parentTitle, items.length, 0, "part");
        parentByTitle.set(parentTitle, parent);
        items.push(parent);
      }
    }
    const displayTitle = parentTitle ? titleParts.slice(1).join(" · ") || chapter.title : chapter.title;
    items.push({
      id: `toc-${chapter.id}`,
      bookId,
      chapterId: chapter.id,
      title: displayTitle || `Chapter ${chapter.orderIndex + 1}`,
      href: chapter.href,
      orderIndex: items.length,
      level: parent ? parent.level + 1 : 0,
      parentId: parent?.id,
      kind: classifyTocTitle(displayTitle)
    });
  }
  return items.map((item, index) => ({ ...item, orderIndex: index }));
}

export function buildTocItemsFromSource(bookId: string, sourceItems: TocSourceItem[], chapters: Chapter[]): TocItem[] {
  const chapterByExactHref = new Map(chapters.filter((chapter) => chapter.href).map((chapter) => [chapter.href!, chapter]));
  const chapterByBaseHref = new Map<string, Chapter>();
  for (const chapter of chapters) {
    const base = withoutFragment(chapter.href || "");
    if (base && !chapterByBaseHref.has(base)) chapterByBaseHref.set(base, chapter);
  }
  const childCounts = new Map<string, number>();
  for (const item of sourceItems) {
    if (item.parentId) childCounts.set(item.parentId, (childCounts.get(item.parentId) || 0) + 1);
  }
  const idBySourceId = new Map<string, string>();
  const items: TocItem[] = [];
  for (const source of sourceItems) {
    const title = source.title.trim();
    if (!title) continue;
    const sourceId = source.id || `source-${items.length}`;
    const id = `toc-${bookId}-${items.length}`;
    idBySourceId.set(sourceId, id);
    const parentId = source.parentId ? idBySourceId.get(source.parentId) : undefined;
    const hasChildren = Boolean(childCounts.get(sourceId));
    const kind = classifyTocTitle(title, hasChildren);
    const href = source.href || "";
    const exactChapter = href ? chapterByExactHref.get(href) : undefined;
    const chapter = exactChapter || (href && kind !== "part" ? chapterByBaseHref.get(withoutFragment(href)) : undefined);
    items.push({
      id,
      bookId,
      chapterId: chapter?.id,
      title,
      href: href || chapter?.href,
      orderIndex: items.length,
      level: Math.max(0, source.level ?? 0),
      parentId,
      kind
    });
  }
  return items.length ? inferFlatPartHierarchy(items) : buildTocItemsFromChapters(bookId, chapters);
}

function makeTocItem(bookId: string, title: string, orderIndex: number, level: number, kind: TocItemKind): TocItem {
  return {
    id: `toc-${bookId}-${orderIndex}`,
    bookId,
    title,
    orderIndex,
    level,
    kind
  };
}

function withoutFragment(href: string): string {
  return href.split("#")[0];
}

function inferFlatPartHierarchy(items: TocItem[]): TocItem[] {
  if (items.some((item) => item.parentId) || !items.some((item) => item.kind === "part")) return items;
  let currentPart: TocItem | undefined;
  return items.map((item) => {
    if (item.kind === "part") {
      currentPart = item;
      return { ...item, level: 0, parentId: undefined };
    }
    if (item.kind === "frontmatter" || item.kind === "backmatter") {
      currentPart = undefined;
      return { ...item, parentId: undefined, level: 0 };
    }
    if (currentPart) {
      return {
        ...item,
        parentId: currentPart.id,
        level: Math.max(1, currentPart.level + 1)
      };
    }
    return item;
  }).map((item, index) => ({ ...item, orderIndex: index }));
}

function isFrontmatterHeadingText(title: string): boolean {
  return /^(?:cover page|cover|title page|half title|copyright|dedication|preface|foreword|introduction|contents?|table of contents|封面|目录|前言|序言|献词|版权)(?:\b|[:.\-—]|$)/i.test(title.trim());
}

function isBackmatterHeadingText(title: string): boolean {
  return /^(?:epilogue|afterword|about the author|about (?:the )?authors?|appendix|appendices|acknowledg(?:e)?ments|notes?|endnotes?|glossary|bibliography|references|index|后记|作者简介|关于作者|附录|致谢|注释|术语表|参考文献|索引)(?:\b|[:.\-—]|$)/i.test(title.trim());
}

function wordCountLike(text: string): number {
  return (text.match(/[A-Za-z]+(?:['-][A-Za-z]+)?|\p{Script=Han}/gu) || []).length;
}
