import type { VocabItem } from "../../shared/types";
export type PracticeWord = { word: string; meaning: string; example: string; item: VocabItem };
export function wordCandidates(items: VocabItem[], scope: string, bookId?: string): PracticeWord[] {
  const seen = new Set<string>();
  return items.filter(v => scope === "book" ? v.bookId === bookId : scope === "all" || v.notebookId === scope).flatMap(item => {
    const key = item.word.trim().toLocaleLowerCase(), meaning = (item.chineseDef || item.englishDef || "").trim();
    if (!key || !meaning || seen.has(key)) return []; seen.add(key);
    return [{ word: item.word, meaning: meaning.slice(0, 200), example: (item.sourceSentence || item.example || "").slice(0, 600), item }];
  });
}
export function sampleWords<T>(items: T[], count: number): T[] {
  const pool = [...items]; const n = Math.max(0, Math.min(48, Math.floor(count), pool.length));
  for (let i = 0; i < n; i++) { const j = i + Math.floor(Math.random() * (pool.length - i)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n);
}
