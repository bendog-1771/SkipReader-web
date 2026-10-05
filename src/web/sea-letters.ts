import type { BottleStyle, SeaDelivery, SeaLetter } from "../shared/types";
import type { Data } from "./data";

export const SEA_LETTER_DELAY = 10 * 60 * 1000;
export function validSeaLetter(value: unknown): value is SeaLetter {
  const v = value as SeaLetter;
  return !!v && typeof v.id === "string" && !!v.id && typeof v.text === "string" && !!v.text.trim() && v.text.length <= 2000 && ["slender", "round", "flask"].includes(v.style) && typeof v.createdAt === "string" && Number.isFinite(Date.parse(v.createdAt));
}
const pick = <T,>(items: T[]): T | undefined => items[Math.floor(Math.random() * items.length)];
// Sample a bounded window of a chapter, rather than split an entire large book.
export function seaFragment(text: string): string {
  const offset = Math.floor(Math.random() * Math.max(1, text.length - 800));
  const window = text.slice(offset, offset + 1600);
  const sentences = window.split(/(?<=[。！？])|(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length >= 8 && s.length <= 600);
  // The first sentence may begin mid-word when the window is not at the chapter start.
  const complete = sentences.slice(offset > 0 ? 1 : 0, offset + 1600 >= text.length ? undefined : -1);
  const sentence = pick(complete); if (sentence) return sentence;
  const fragment = window.slice(0, 420).replace(/^\S*\s+/, "").replace(/\s+\S*$/, "").trim();
  return fragment.length >= 8 ? `${offset ? "…" : ""}${fragment}${offset + 420 < text.length ? "…" : ""}` : "";
}
export function createSeaLetterAPI(adapters: {
  refresh: () => Promise<void>; current: () => Data;
  mutate: <T>(fn: (next: Data) => T) => Promise<T>; chapterText: (id: string) => Promise<string>;
}): Window["readerAPI"]["seaLetters"] {
  const recent: string[] = [];
  const remember = (id: string) => { recent.push(id); if (recent.length > 16) recent.shift(); };
  const freshChoices = <T extends { id: string }>(values: T[], prefix: string) => {
    const unseen = values.filter(v => !recent.includes(prefix + v.id));
    return unseen.length ? unseen : values;
  };
  const api: Window["readerAPI"]["seaLetters"] = {
    list: async () => { await adapters.refresh(); return [...(adapters.current().seaLetters || [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
    cast: async (input: string, style: BottleStyle) => {
      const text = typeof input === "string" ? input.trim() : "";
      if (!text || text.length > 2000) throw new Error("请写下 1–2000 个字，再把信交给海。" );
      if (!["slender", "round", "flask"].includes(style)) throw new Error("请选择一种瓶子样式。" );
      return adapters.mutate(next => {
        const letter: SeaLetter = { id: crypto.randomUUID(), text, style, createdAt: new Date().toISOString() };
        (next.seaLetters ||= []).push(letter); return letter;
      });
    },
    remove: id => adapters.mutate(next => { next.seaLetters = (next.seaLetters || []).filter(v => v.id !== id); }),
    restore: letter => adapters.mutate(next => {
      if (!validSeaLetter(letter)) throw new Error("这封信无法恢复。" );
      if (!(next.seaLetters || []).some(l => l.id === letter.id)) (next.seaLetters ||= []).push({ id: letter.id, text: letter.text, style: letter.style, createdAt: letter.createdAt, lastReceivedAt: letter.lastReceivedAt });
    }),
    receive: async (source = "all") => {
      if (!["all", "past", "highlight", "book"].includes(source)) throw new Error("请选择回信来源。" );
      await adapters.refresh(); const state = adapters.current();
      const letters = (state.seaLetters || []).filter(l => Date.now() - Date.parse(l.createdAt) >= SEA_LETTER_DELAY);
      const books = state.books.filter(b => !b.deletedAt && state.chapters.some(c => c.bookId === b.id));
      const notes = state.notes.filter(n => n.selectedText?.trim() && state.books.some(b => b.id === n.bookId && !b.deletedAt));
      const kinds: Array<SeaDelivery["kind"]> = [ ...(letters.length ? ["past", "past"] as const : []), ...(notes.length ? ["highlight", "highlight"] as const : []), ...(books.length ? ["book"] as const : []) ];
      const kind = pick(kinds.filter(k => source === "all" || source === k)); if (!kind) return null;
      if (kind === "past") {
        const letter = pick(freshChoices(letters, "past:"))!; remember("past:" + letter.id);
        await adapters.mutate(next => { const saved = next.seaLetters?.find(l => l.id === letter.id); if (saved) saved.lastReceivedAt = new Date().toISOString(); });
        return { id: letter.id, kind, text: letter.text, createdAt: letter.createdAt };
      }
      if (kind === "highlight") {
        const note = pick(freshChoices(notes, "highlight:"))!; remember("highlight:" + note.id);
        return { id: note.id, kind, text: note.selectedText.trim().slice(0, 2000), bookId: note.bookId, chapterId: note.chapterId, bookTitle: state.books.find(b => b.id === note.bookId)?.title, chapterTitle: note.chapterTitle, createdAt: note.createdAt };
      }
      const candidates = [...books]; for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
      for (const book of candidates.slice(0, 6)) {
        const chapters = freshChoices(state.chapters.filter(c => c.bookId === book.id), "book:");
        const shuffled = [...chapters]; for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
        for (const chapter of shuffled.slice(0, 8)) {
          const text = seaFragment(await adapters.chapterText(chapter.id) || chapter.plainText);
          if (!text) continue;
          // A deletion in another tab while fetching must not resurrect its content.
          await adapters.refresh(); if (!adapters.current().books.some(b => b.id === book.id && !b.deletedAt)) break;
          remember("book:" + chapter.id);
          return { id: chapter.id, kind, text, bookId: book.id, chapterId: chapter.id, bookTitle: book.title, chapterTitle: chapter.title };
        }
      }
      if (source === "all" && (notes.length || letters.length)) return api.receive(notes.length ? "highlight" : "past");
      return null;
    }
  }; return api;
}
