import React, { useMemo, useState } from "react";
import type { Notebook, VocabItem } from "../../shared/types";
import { AtmosphereOverlay } from "./Overlay";
import { sampleWords, wordCandidates, type PracticeWord } from "./word-selection";
export type WordSelection = { kind: "random" | "custom"; count: number; ids: string[] };
export function WordPicker({ items, notebooks, bookId, scope, selection, close, start }: {
  items: VocabItem[]; notebooks: Notebook[]; bookId?: string; scope: string; selection: WordSelection;
  close: () => void; start: (words: PracticeWord[], scope: string, selection: WordSelection) => void;
}) {
  const [source, setSource] = useState(scope), [kind, setKind] = useState(selection.kind), [count, setCount] = useState(selection.count), [ids, setIds] = useState(new Set(selection.ids)), [search, setSearch] = useState(""), [limit, setLimit] = useState(150);
  const pool = useMemo(() => wordCandidates(items, source, bookId), [items, source, bookId]);
  const filtered = useMemo(() => { const q = search.trim().toLocaleLowerCase(); return pool.filter(w => !q || `${w.word} ${w.meaning} ${w.item.bookTitle || ""}`.toLocaleLowerCase().includes(q)); }, [pool, search]);
  const chosen = pool.filter(w => ids.has(w.item.id)), size = kind === "random" ? Math.min(count, pool.length) : chosen.length;
  return <AtmosphereOverlay title="选择本轮词语" close={close} className="yj-word-picker">
    <p className="yj-sheet-help">每轮最多 48 个词，候选词库没有这个上限。去重并跳过暂无释义的词。</p>
    <label>词语来源<select aria-label="选词来源" value={source} onChange={e => { setSource(e.target.value); setLimit(150); }}><option value="all">全部生词</option>{bookId && <option value="book">当前书籍</option>}{notebooks.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
    <fieldset className="yj-selection-kind"><legend>选词方式</legend><label><input type="radio" name="selection-kind" checked={kind === "random"} onChange={() => setKind("random")} />随机抽取</label><label><input type="radio" name="selection-kind" checked={kind === "custom"} onChange={() => setKind("custom")} />自选词单</label></fieldset>
    <div className="yj-picker-meta"><label>{kind === "random" ? "本轮数量" : "批量选入数"}<input aria-label={kind === "random" ? "本轮数量" : "随机选入数量"} type="number" min="1" max="48" value={count} onChange={e => setCount(Math.max(1, Math.min(48, Number(e.target.value) || 1)))} /></label><span>候选 <b>{pool.length}</b> · 本轮 <b>{size}</b></span></div>
    <p className="yj-sheet-help">{kind === "random" ? "从完整候选池等概率抽取，不重复；每次开始都会重新抽取。下方可预览所有候选词。" : "勾选你想练的词，最多 48 个；开始后只练选中的词。"}</p>
    <input className="yj-word-search" type="search" aria-label="搜索候选词" placeholder="搜索单词、释义或书名" value={search} onChange={e => { setSearch(e.target.value); setLimit(150); }} />
    {kind === "custom" && <div className="yj-picker-tools"><button onClick={() => setIds(new Set(sampleWords(filtered, count).map(w => w.item.id)))}>随机选入 {Math.min(count, filtered.length)} 个</button><button onClick={() => setIds(new Set())}>清空选择</button><span>已选 {chosen.length} / 48</span></div>}
    <div className="yj-word-list">{filtered.slice(0, limit).map(w => <label key={w.item.id} className="yj-word-row">{kind === "custom" && <input aria-label={`选入 ${w.word}`} type="checkbox" checked={ids.has(w.item.id)} disabled={!ids.has(w.item.id) && chosen.length >= 48} onChange={e => setIds(old => { const next = new Set(old); if (e.target.checked) next.add(w.item.id); else next.delete(w.item.id); return next; })} />}<span><b>{w.word}</b><small>{w.meaning}</small>{w.item.bookTitle && <em>{w.item.bookTitle}</em>}</span></label>)}{!filtered.length && <p>没有符合条件的词。可以调整来源或搜索。</p>}{filtered.length > limit && <button onClick={() => setLimit(n => n + 150)}>显示更多 · 还有 {filtered.length - limit} 个</button>}</div>
    <footer><span>{kind === "custom" ? "自选词单" : "随机抽取"} · {size} 个词</span><button className="yj-sheet-primary" disabled={!size} onClick={() => start(kind === "random" ? sampleWords(pool, count) : chosen, source, { kind, count, ids: chosen.map(w => w.item.id) })}>开始这一轮 ↗</button></footer>
  </AtmosphereOverlay>;
}
