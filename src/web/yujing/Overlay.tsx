import React, { useEffect, useRef } from "react";
export function AtmosphereOverlay({ title, close, children, className = "" }: { title: string; close: () => void; children: React.ReactNode; className?: string }) {
  const card = useRef<HTMLDivElement>(null), closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    card.current?.focus();
    const key = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); }
      if (e.key === "Tab") {
        const nodes = [...(card.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select,[tabindex="0"]') || [])].filter(n => n.getClientRects().length);
        const first = nodes[0], last = nodes.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === card.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === card.current)) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="yj-overlay" onPointerDown={e => { if (e.target === e.currentTarget) close(); }}><div className={`yj-sheet ${className}`} role="dialog" aria-modal="true" aria-label={title} ref={card} tabIndex={-1}><header><h2>{title}</h2><button onClick={close} aria-label={`关闭${title}`}>×</button></header>{children}</div></div>;
}
