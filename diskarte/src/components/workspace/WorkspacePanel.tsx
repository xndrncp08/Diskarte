"use client";

import { GripHorizontal, Minus, MoveDiagonal2 } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useShellUI } from "@/components/shell/ShellUI";
import { useCoupledResize } from "@/hooks/useCoupledResize";
import { clampRect, fromFraction, PANEL_IDS, settleOnGrid, snapMove, type Edge, type PanelId, type Rect } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { useIsCanvas, useOptionalWorkspaceStore, useWorkspace, useWorkspaceBounds, useWorkspaceStore } from "./WorkspaceProvider";

const STEP = 16;
const EDGES: { edge: Edge; className: string }[] = [
  { edge: "n", className: "inset-x-4 -top-1 h-2 cursor-ns-resize" },
  { edge: "s", className: "inset-x-4 -bottom-1 h-2 cursor-ns-resize" },
  { edge: "w", className: "inset-y-4 -left-1 w-2 cursor-ew-resize" },
  { edge: "e", className: "inset-y-4 -right-1 w-2 cursor-ew-resize" },
  { edge: "nw", className: "-left-1 -top-1 size-4 cursor-nwse-resize" },
  { edge: "ne", className: "-right-1 -top-1 size-4 cursor-nesw-resize" },
  { edge: "sw", className: "-bottom-1 -left-1 size-4 cursor-nesw-resize" },
  { edge: "se", className: "-bottom-1 -right-1 size-4 cursor-nwse-resize" },
];

/** A header drag. Moves are always uncoupled: dragging a panel away is how it leaves a docked block. */
interface Gesture {
  start: Rect;
  pointer: { x: number; y: number };
  others: Rect[];
  last: Rect;
  snapped: { x: boolean; y: boolean };
}

export interface WorkspacePanelProps {
  id: PanelId;
  /** Accessible name and the label on the panel's bar and tray pill. */
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * A glass panel on the floating canvas (tablet and up): drag it by its bar, resize from any edge or
 * corner (min 320 × 240) — panels docked to that edge resize with it (Alt / Option detaches; see
 * useCoupledResize) — and moves snap magnetically to the canvas and its neighbours. Clicking or
 * focusing it raises it — only its frame re-renders, never its content, so chat streams and video
 * keep running. Keyboard: the Move and Resize buttons take the arrow keys (Shift for bigger steps).
 * The main panel is the page's <main> landmark (the skip link's target); the others are labelled regions.
 *
 * On phones it falls back to the stacked layout: the navigator is the slide-in drawer and the main
 * panel fills the screen.
 */
export function WorkspacePanel(props: WorkspacePanelProps) {
  // Outside the app shell (isolated renders, tests) there's no canvas: plain stacked layout.
  return useOptionalWorkspaceStore() ? <CanvasPanel {...props} /> : <StackedPanel {...props} />;
}

function StackedPanel({ id, title, children }: WorkspacePanelProps) {
  const { navOpen } = useShellUI();
  if (id === "voice") return null;
  const Tag = id === "main" ? "main" : "div";
  return (
    <Tag
      role={id === "main" ? undefined : "region"}
      aria-label={title}
      id={id === "main" ? "main-content" : undefined}
      tabIndex={id === "main" ? -1 : undefined}
      data-panel={id}
      className={cn(
        "flex min-w-0 outline-none",
        id === "main" && "relative flex-1",
        id === "nav" && cn("fixed inset-y-0 left-[72px] z-40 transition-transform duration-200 ease-out md:static md:z-auto md:translate-x-0", navOpen ? "translate-x-0" : "-translate-x-[calc(100%+72px)]"),
      )}
    >
      {children}
    </Tag>
  );
}

function CanvasPanel({ id, title, children, className }: WorkspacePanelProps) {
  const store = useWorkspaceStore();
  const panel = useWorkspace((s) => s.panels[id]);
  const bounds = useWorkspaceBounds();
  const { navOpen } = useShellUI();
  const isCanvas = useIsCanvas();
  const frame = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const resize = useCoupledResize();

  useEffect(() => store.mount(id, title), [store, id, title]);

  const rect = bounds ? fromFraction(panel.rect, bounds) : null;
  const hidden = panel.minimized || panel.closed;
  const style = (rect ? { "--px": `${rect.x}px`, "--py": `${rect.y}px`, "--pw": `${rect.w}px`, "--ph": `${rect.h}px`, "--pz": panel.z } : {}) as CSSProperties;

  function visibleOthers(): Rect[] {
    if (!bounds) return [];
    const s = store.getState();
    const mounted = store.getMounted();
    return PANEL_IDS.filter((p) => p !== id && mounted.has(p) && !s.panels[p].minimized && !s.panels[p].closed).map((p) => fromFraction(s.panels[p].rect, bounds));
  }

  function paint(r: Rect, snapped: boolean) {
    const el = frame.current;
    if (!el) return;
    el.style.setProperty("--px", `${r.x}px`);
    el.style.setProperty("--py", `${r.y}px`);
    el.style.setProperty("--pw", `${r.w}px`);
    el.style.setProperty("--ph", `${r.h}px`);
    el.toggleAttribute("data-snapped", snapped);
  }

  function begin(e: ReactPointerEvent<HTMLElement>) {
    if (!rect || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button,a,input") && !target.closest("[data-move]")) return;
    // No text selection while dragging — but a press on the Move button still focuses it for the arrow keys.
    if (!(e.target as HTMLElement).closest("button")) e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    gesture.current = { start: rect, pointer: { x: e.clientX, y: e.clientY }, others: visibleOthers(), last: rect, snapped: { x: false, y: false } };
    frame.current?.setAttribute("data-dragging", "");
  }

  function track(e: ReactPointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g || !bounds) return;
    const dx = e.clientX - g.pointer.x;
    const dy = e.clientY - g.pointer.y;
    const { rect: next, snapped } = snapMove({ ...g.start, x: g.start.x + dx, y: g.start.y + dy }, g.others, bounds);
    g.last = next;
    g.snapped = snapped;
    paint(next, snapped.x || snapped.y);
  }

  function end() {
    const g = gesture.current;
    if (!g || !bounds) return;
    gesture.current = null;
    frame.current?.removeAttribute("data-dragging");
    frame.current?.removeAttribute("data-snapped");
    const settled = settleOnGrid(g.last, g.snapped, bounds);
    paint(settled, false);
    store.commitRect(id, settled);
  }

  function nudge(e: ReactKeyboardEvent<HTMLButtonElement>, kind: "move" | "resize") {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!delta || !rect || !bounds) return;
    e.preventDefault();
    const step = e.shiftKey ? STEP * 4 : STEP;
    if (kind === "resize") {
      // Grows or shrinks the right / bottom edge, carrying docked neighbours along (Alt detaches).
      resize.nudge(id, "se", delta[0] * step, delta[1] * step, e.altKey);
      return;
    }
    store.commitRect(id, clampRect({ ...rect, x: rect.x + delta[0] * step, y: rect.y + delta[1] * step }, bounds));
  }

  const Tag = id === "main" ? "main" : "div";
  const raise = (e: { currentTarget: HTMLElement; target: EventTarget }) => {
    // React events bubble through portals: a menu or dialog opened from this panel isn't "inside" it.
    if (e.currentTarget.contains(e.target as Node)) store.raise(id);
  };

  return (
    <Tag
      ref={frame}
      id={id === "main" ? "main-content" : undefined}
      tabIndex={id === "main" ? -1 : undefined}
      role={id === "main" ? undefined : "region"}
      aria-label={title}
      data-panel={id}
      data-minimized={panel.minimized || undefined}
      aria-hidden={(isCanvas && hidden) || undefined}
      onPointerDownCapture={raise}
      onFocusCapture={raise}
      style={style}
      className={cn(
        "flex min-w-0 outline-none",
        // Phones: the stacked layout.
        id === "nav" && cn("max-md:fixed max-md:inset-y-0 max-md:left-[72px] max-md:z-40 max-md:transition-transform max-md:duration-200 max-md:ease-out", navOpen ? "max-md:translate-x-0" : "max-md:-translate-x-[calc(100%+72px)]"),
        id === "main" && "max-md:relative max-md:flex-1",
        id === "voice" && "max-md:hidden",
        // Tablet and up: a glass panel on the canvas.
        "md:absolute md:left-0 md:top-0 md:z-[var(--pz)] md:h-[var(--ph)] md:w-[var(--pw)] md:flex-col md:overflow-hidden md:rounded-3xl md:border md:border-white/10 md:bg-slate-900/60 md:shadow-2xl md:shadow-black/50 md:backdrop-blur-2xl md:[transform:translate3d(var(--px),var(--py),0)]",
        "md:transition-[opacity,transform,scale,border-color] md:duration-300 md:ease-[cubic-bezier(0.23,1,0.32,1)] md:data-[dragging]:transition-none md:group-data-[resizing]/ws:transition-none md:data-[coupled]:border-sun/40 md:data-[snapped]:border-sun/50",
        !rect && "md:invisible",
        hidden && "md:pointer-events-none md:invisible md:scale-95 md:opacity-0",
        className,
      )}
    >
      <div
        className="flex h-8 shrink-0 cursor-grab items-center gap-1 border-b border-white/[0.06] bg-white/[0.03] pl-1.5 pr-1 active:cursor-grabbing max-md:hidden"
        onPointerDown={begin}
        onPointerMove={track}
        onPointerUp={end}
        onPointerCancel={end}
        data-panel-bar=""
      >
        <button
          type="button"
          data-move=""
          aria-label={`Move ${title} panel`}
          title="Drag to move, or use the arrow keys. F6 moves between panels."
          onKeyDown={(e) => nudge(e, "move")}
          className="flex size-6 shrink-0 cursor-[inherit] items-center justify-center rounded-md text-slate-500 hover:text-slate-200"
        >
          <GripHorizontal className="size-3.5" aria-hidden />
        </button>
        <span className="min-w-0 flex-1 truncate font-silk text-[10px] uppercase tracking-widest text-slate-400">{title}</span>
        <button
          type="button"
          aria-label={`Resize ${title} panel`}
          title="Use the arrow keys to resize, or drag any edge or corner. Docked panels follow; hold Alt (Option) to resize this one alone."
          onKeyDown={(e) => nudge(e, "resize")}
          className="flex size-6 items-center justify-center rounded-md text-slate-500 hover:bg-white/10 hover:text-slate-200"
        >
          <MoveDiagonal2 className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Minimize ${title}`}
          onClick={() => store.setMinimized(id, true)}
          className="flex size-6 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <Minus className="size-3.5" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 max-md:h-full">{children}</div>

      {EDGES.map(({ edge, className: pos }) => (
        <div
          key={edge}
          aria-hidden
          data-resize={edge}
          className={cn("absolute z-10 touch-none max-md:hidden", pos)}
          onPointerDown={(e) => resize.begin(id, edge, e)}
          onPointerMove={resize.move}
          onPointerUp={resize.end}
          onPointerCancel={resize.end}
        />
      ))}
    </Tag>
  );
}
