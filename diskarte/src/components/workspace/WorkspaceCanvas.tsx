"use client";

import { Compass, MessageSquare, Volume2 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useCall } from "@/components/voice/CallProvider";
import { GAP, PANEL_IDS, PANEL_TITLES, type PanelId } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { CallOverlay } from "./CallOverlay";
import { ROSTER_WIDTH } from "./RosterDrawer";
import { VoicePanel } from "./VoicePanel";
import { WorkspaceSeams } from "./WorkspaceSeams";
import { setCanvasActive, useIsCanvas, useMountedPanels, useWorkspace, useWorkspaceStore } from "./WorkspaceProvider";

const TRAY_HEIGHT = 56;
const PILL_ICONS: Record<PanelId, ReactNode> = {
  nav: <Compass className="size-4" aria-hidden />,
  main: <MessageSquare className="size-4" aria-hidden />,
  voice: <Volume2 className="size-4" aria-hidden />,
};

/** F6 / Shift+F6 cycle focus between the command rail and the visible panels, left to right. */
function useRegionHopping(canvas: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F6" || e.defaultPrevented) return;
      // Floating windows (Settings, the mixer…) own F6 while they're open.
      if (document.querySelector("[data-window]")) return;
      const root = canvas.current;
      if (!root) return;
      const panels = Array.from(root.querySelectorAll<HTMLElement>("[data-panel]:not([data-minimized])")).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      const rail = document.querySelector<HTMLElement>("[data-testid='micro-dock']");
      const regions = [rail, ...panels].filter((r): r is HTMLElement => !!r && r.offsetParent !== null);
      if (regions.length === 0) return;
      e.preventDefault();
      const current = regions.findIndex((r) => r.contains(document.activeElement));
      const next = regions[(current + (e.shiftKey ? -1 : 1) + regions.length) % regions.length];
      const target =
        next.querySelector<HTMLElement>("[data-panel-bar] ~ div a[href], [data-panel-bar] ~ div button:not([disabled]), [data-panel-bar] ~ div textarea, [data-panel-bar] ~ div input") ??
        next.querySelector<HTMLElement>("a[href], button:not([disabled])") ??
        next;
      target.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canvas]);
}

/**
 * The floating workspace canvas: everything right of the command rail. Panels position themselves
 * inside it; a tray along the bottom appears when there are minimized panels or an active call, and
 * a docked roster takes the right edge. Phones get the plain stacked layout instead.
 */
export function WorkspaceCanvas({ children }: { children: ReactNode }) {
  const canvas = useRef<HTMLDivElement>(null);
  const store = useWorkspaceStore();
  const isCanvas = useIsCanvas();
  const call = useCall();
  const mounted = useMountedPanels();
  const minimized = useWorkspace((s) => PANEL_IDS.filter((id) => s.panels[id].minimized && !s.panels[id].closed).join(","));
  const roster = useWorkspace((s) => s.roster);
  const pills = (minimized ? (minimized.split(",") as PanelId[]) : []).filter((id) => mounted.has(id));
  const tray = isCanvas && (pills.length > 0 || call.status !== "idle");
  const docked = isCanvas && roster === "docked" && mounted.has("roster");
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!isCanvas) return;
    setCanvasActive(true);
    return () => setCanvasActive(false);
  }, [isCanvas]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!size || !isCanvas) return;
    store.setBounds({ x: 0, y: 0, w: size.w - (docked ? ROSTER_WIDTH + GAP : 0), h: size.h - (tray ? TRAY_HEIGHT + GAP : 0) });
  }, [size, isCanvas, docked, tray, store]);

  useRegionHopping(canvas);

  return (
    <div
      ref={canvas}
      data-workspace=""
      style={{ "--tray": tray ? `${TRAY_HEIGHT + GAP}px` : "0px" } as CSSProperties}
      className="group/ws relative flex min-w-0 flex-1 md:isolate md:block"
    >
      {children}
      <VoicePanel />
      {isCanvas && <WorkspaceSeams />}
      {isCanvas && (
        <section
          aria-label="Workspace tray"
          className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-[950] flex items-center justify-between gap-3 transition-opacity duration-200", tray ? "opacity-100" : "opacity-0")}
          style={{ height: TRAY_HEIGHT }}
        >
          <div role="toolbar" aria-label="Minimized panels" className="pointer-events-auto flex min-w-0 items-center gap-2 overflow-x-auto scrollbar-none">
            {pills.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => store.setMinimized(id, false)}
                aria-label={`Restore ${mounted.get(id) ?? PANEL_TITLES[id]}`}
                className="flex h-10 shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-3.5 text-sm font-semibold text-slate-200 shadow-xl shadow-black/40 backdrop-blur-2xl transition-[translate,background-color] duration-150 hover:-translate-y-0.5 hover:bg-slate-800/70"
                data-testid="panel-pill"
              >
                <span className="text-sun">{PILL_ICONS[id]}</span>
                <span className="max-w-40 truncate">{mounted.get(id) ?? PANEL_TITLES[id]}</span>
              </button>
            ))}
          </div>
          <CallOverlay />
        </section>
      )}
    </div>
  );
}
