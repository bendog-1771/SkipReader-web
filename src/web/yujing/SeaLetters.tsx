import React, { useEffect, useRef, useState } from "react";
import type { BottleStyle, SeaDelivery, SeaLetter } from "../../shared/types";
import { AtmosphereOverlay } from "./Overlay";
export function BottleIcon({ style = "slender" }: { style?: BottleStyle }) {
  const d = style === "round" ? "M10 7v5c-7 2-8 6-8 10a10 10 0 0020 0c0-4-1-8-8-10V7z" : style === "flask" ? "M10 7v4c-2 2-7 3-7 6v11c0 2 18 2 18 0V17c0-3-5-4-7-6V7z" : "M10 7v8c-1 2-4 4-4 7v9h12v-9c0-3-3-5-4-7V7z";
  return <svg aria-hidden="true" viewBox="0 0 26 38" width="26" height="38" fill="none"><path d={d} stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity=".09" /><path d="M9 4h6v3H9zM11 19v8m3-8v8" stroke="currentColor" strokeWidth="1.2" /></svg>;
}
type API = Window["readerAPI"]["seaLetters"];
export function SeaLetters({ api, signal, cast, picked, reading, lab = false }: { api: API; signal: number; cast: (style: BottleStyle) => void; picked: () => void; reading: boolean; lab?: boolean }) {
  const [tab, setTab] = useState<"write" | "receive" | "history" | null>(null), [text, setText] = useState(""), [style, setStyle] = useState<BottleStyle>("slender"), [source, setSource] = useState<"all" | "past" | "highlight" | "book">("all"), [delivery, setDelivery] = useState<SeaDelivery | null>(null), [letters, setLetters] = useState<SeaLetter[]>([]), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [undo, setUndo] = useState<SeaLetter | null>(null);
  const alive = useRef(true), pending = useRef(false), toast = useRef<number>();
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(toast.current); }; }, []);
  async function receive() {
    if (pending.current) return; pending.current = true; setTab("receive"); setBusy(true); setMessage(""); setDelivery(null); setSaved(false);
    try { const next = await api.receive(source); if (!alive.current) return; setDelivery(next); if (next) picked(); else setMessage(source === "past" ? "旧信还在路上。新投出的信，十分钟后可能漂回来。" : "海里暂时没有回信。写一封信，或导入一本书、保存一些划线。" ); }
    catch (e) { if (alive.current) setMessage((e as Error).message); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  const receiveRef = useRef(receive); receiveRef.current = receive;
  const lastSignal = useRef(signal);
  useEffect(() => { if (signal !== lastSignal.current) { lastSignal.current = signal; void receiveRef.current(); } }, [signal]);
  async function send() {
    if (pending.current) return; pending.current = true; setBusy(true);
    try { await api.cast(text, style); if (!alive.current) return; cast(style); setText(""); setTab(null); setMessage("信已交给海。十分钟后，它可能在某次拾取中回来。"); clearTimeout(toast.current); toast.current = window.setTimeout(() => setMessage(""), 6500); }
    catch (e) { if (alive.current) setMessage((e as Error).message); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  const refresh = async () => { const next = await api.list(); if (alive.current) setLetters(next); };
  const history = () => { setTab("history"); setMessage(""); void refresh().catch(e => setMessage(e.message)); };
  const close = () => { setTab(null); setMessage(""); };
  return <>
    <nav className={`yj-sea-dock ${reading ? "yj-sea-dock-reading" : ""}`} aria-label="漂流信"><button className="yj-sea-open" aria-label="写漂流信" onClick={() => { setTab("write"); setMessage(""); }}><BottleIcon /><span>漂流信<small>写给海，也写给未来</small></span></button><button aria-label="拾取漂流瓶" onClick={() => void receive()}>拾一只 ↗</button></nav>
    {!tab && message && <p className="yj-sea-toast" role="status">{message}</p>}
    {tab && <AtmosphereOverlay title="漂流信" close={close} className="yj-letter-sheet"><nav className="yj-letter-tabs"><button aria-pressed={tab === "write"} onClick={() => { setTab("write"); setMessage(""); }}>写信</button><button aria-pressed={tab === "receive"} onClick={() => void receive()}>拾瓶</button><button aria-pressed={tab === "history"} onClick={history}>我的信</button></nav>
      {tab === "write" && <><p className="yj-sheet-help">随手留一句话，把此刻交给未来。{lab?"实验信独立保存在本机，不写入正式书库。":"信只保存在这台设备，包含在完整书库备份里。"}</p><textarea aria-label="瓶中信" placeholder="今天想留给未来的自己什么？" rows={7} value={text} maxLength={2000} onChange={e => setText(e.target.value)} /><div className="yj-letter-count">{text.length} / 2000</div><fieldset className="yj-bottle-styles"><legend>选一只瓶子</legend>{(["slender", "round", "flask"] as const).map((s, i) => <label key={s}><input type="radio" name="bottle-style" checked={style === s} onChange={() => setStyle(s)} /><BottleIcon style={s} />{["细颈青瓶", "圆腹海蓝", "扁身琥珀"][i]}</label>)}</fieldset><footer><span>十分钟后进入回信池</span><button className="yj-sheet-primary" disabled={!text.trim() || busy} onClick={() => void send()}>{busy ? "正在装瓶…" : "把信交给海 ↗"}</button></footer></>}
      {tab === "receive" && <><label>漂来什么<select aria-label="漂流信来源" value={source} disabled={busy} onChange={e => setSource(e.target.value as typeof source)}><option value="all">随机 · 旧信、划线或书中片段</option><option value="past">过去写的信</option><option value="highlight">我的划线</option><option value="book">书中片段</option></select></label><p className="yj-sheet-help">只取你自己的内容。旧信与划线更常出现，最近拾过的内容会暂时避开；不会改变阅读进度。</p>{busy && <p role="status">海正在送来一封信…</p>}{delivery && <article className="yj-delivery"><small>{delivery.kind === "past" ? "过去的你，寄来的信" : delivery.kind === "highlight" ? "曾经划下的句子" : "书页中漂来的片段"}</small><blockquote>{delivery.text}</blockquote><p>{delivery.bookTitle && <>《{delivery.bookTitle}》{delivery.chapterTitle ? ` · ${delivery.chapterTitle}` : ""}</>}{delivery.createdAt && <time>{new Date(delivery.createdAt).toLocaleDateString()}</time>}</p></article>}<footer><button disabled={!delivery || busy || saved || delivery.kind === "past"} onClick={async () => { if (!delivery || pending.current) return; pending.current = true; setBusy(true); try { await api.cast(delivery.text, style); if (alive.current) { setSaved(true); setMessage("已收进我的信。"); } } catch (e) { if (alive.current) setMessage((e as Error).message); } finally { pending.current = false; if (alive.current) setBusy(false); } }}>{delivery?.kind === "past" ? "已在我的信中" : saved ? "已收好" : "收进我的信"}</button><button className="yj-sheet-primary" disabled={busy} onClick={() => void receive()}>再拾一只 ↗</button></footer></>}
      {tab === "history" && <><p className="yj-sheet-help">{letters.length} 封信 · 删除会移出回信池，可立即撤回。</p><div className="yj-letter-history">{letters.slice(0, 100).map(l => <article key={l.id}><BottleIcon style={l.style} /><div><time>{new Date(l.createdAt).toLocaleString()}</time><p>{l.text}</p></div><button aria-label={`删除信 ${l.id}`} onClick={async () => { try { await api.remove(l.id); if (alive.current) { setUndo(l); await refresh(); } } catch (e) { if (alive.current) setMessage((e as Error).message); } }}>×</button></article>)}{!letters.length && <p>还没有写信。留下一句话，让它在未来漂回来。</p>}{letters.length > 100 && <p>这里显示最近 100 封；其余信件仍在回信池和备份里。</p>}</div>{undo && <button onClick={async () => { try { await api.restore(undo); setUndo(null); await refresh(); } catch (e) { setMessage((e as Error).message); } }}>撤回删除</button>}</>}
      {message && <p className="yj-letter-status" role="status">{message}</p>}
    </AtmosphereOverlay>}
  </>;
}
