"use client";

import { GripHorizontal, Maximize2 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { useIsCanvas, useLayout, type PanelRect } from "./WorkspaceProvider";

export function constrainPanel(rect: PanelRect, width: number, height: number): PanelRect {
  const w = Math.min(Math.max(232, rect.width), width);
  const h = Math.min(Math.max(240, rect.height), height);
  return { x: Math.max(0, Math.min(width - w, rect.x)), y: Math.max(0, Math.min(height - h, rect.y)), width: w, height: h };
}

export function useFloatingPanel(id: "nav" | "main", ref: RefObject<HTMLElement | null>) {
  const [layout, setLayout] = useLayout();
  const desktop = useIsCanvas();
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const drag = useRef<{ rect: PanelRect; x: number; y: number; resize: boolean; pointer: number } | null>(null);
  const draft = useRef<PanelRect | null>(null);
  useEffect(() => {
    const parent = ref.current?.closest<HTMLElement>("[data-workspace]");
    if (!parent) return;
    const roster = parent.querySelector<HTMLElement>("[data-roster]");
    const update = () => setBounds({ width: parent.clientWidth - (roster?.offsetWidth ?? 0), height: parent.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    if (roster) observer.observe(roster);
    return () => observer.disconnect();
  }, [ref, layout.roster, layout.membersOpen]);
  const floating = desktop && layout.mode === "floating" && bounds.width >= 700;
  const initial = id === "nav" ? { x: 12, y: 12, width: 260, height: bounds.height - 24 } : { x: 284, y: 12, width: bounds.width - 296, height: bounds.height - 24 };
  const rect = constrainPanel(layout.panels[id] ?? initial, bounds.width, bounds.height);
  const save = (next: PanelRect) => setLayout({ panels: { ...layout.panels, [id]: constrainPanel(next, bounds.width, bounds.height) } });
  const apply = (r: PanelRect) => {
    const el = ref.current;
    if (!el) return;
    Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
  };
  const move = (e: PointerEvent) => {
    const g = drag.current;
    if (!g || e.pointerId !== g.pointer) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    draft.current = constrainPanel(g.resize ? { ...g.rect, width: g.rect.width + dx, height: g.rect.height + dy } : { ...g.rect, x: g.rect.x + dx, y: g.rect.y + dy }, bounds.width, bounds.height);
    apply(draft.current);
  };
  const stop = () => {
    if (draft.current) {
      const r = draft.current;
      save({ ...r, x: Math.round(r.x / 16) * 16, y: Math.round(r.y / 16) * 16 });
    }
    drag.current = null; draft.current = null;
  };
  const handlers = (resize: boolean) => ({
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0 || drag.current) return;
      e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { rect, x: e.clientX, y: e.clientY, resize, pointer: e.pointerId };
    }, onPointerMove: move, onPointerUp: stop, onPointerCancel() { apply(rect); drag.current = null; draft.current = null; },
    onKeyDown(e: KeyboardEvent) {
      const delta = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[e.key];
      if (!delta) return;
      e.preventDefault();
      save(resize ? { ...rect, width: rect.width + delta[0], height: rect.height + delta[1] } : { ...rect, x: rect.x + delta[0], y: rect.y + delta[1] });
    },
  });
  const style: CSSProperties = floating ? { position: "absolute", left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex: id === "main" ? 2 : 3 } : {};
  const raise = () => {
    const parent = ref.current?.closest("[data-workspace]");
    parent?.querySelectorAll<HTMLElement>("[data-floating-panel]").forEach((el) => { el.style.zIndex = el === ref.current ? "4" : "2"; });
  };
  return { floating, style, handlers, raise, reset: () => save(initial) };
}

export function FloatingPanelControls({ title, panel }: { title: string; panel: ReturnType<typeof useFloatingPanel> }) {
  return <>
    <div className="flex h-9 shrink-0 items-center border-b border-white/10 bg-white/[0.04] px-1">
      <button type="button" aria-label={`Move ${title}`} title="Drag or use arrow keys to move" {...panel.handlers(false)} className="flex h-full min-w-0 flex-1 cursor-grab touch-none items-center gap-2 px-2 text-left text-xs text-slate-300"><GripHorizontal className="size-4" aria-hidden /><span className="truncate">{title}</span></button>
      <button type="button" onClick={panel.reset} aria-label={`Reset ${title} position`} className="flex size-8 items-center justify-center rounded hover:bg-white/10"><Maximize2 className="size-3.5" aria-hidden /></button>
    </div>
    <button type="button" aria-label={`Resize ${title} window`} title="Drag or use arrow keys to resize" {...panel.handlers(true)} className="absolute bottom-0 right-0 z-20 size-5 cursor-nwse-resize touch-none rounded-tl-lg border-b-2 border-r-2 border-sun/50" />
  </>;
}
