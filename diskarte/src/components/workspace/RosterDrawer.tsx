"use client";

import { Pin, PinOff, Users, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { useWorkspace, useWorkspaceStore } from "./WorkspaceProvider";

export const ROSTER_WIDTH = 272;

/**
 * Micro-roster: the member list slides out over the canvas on demand, or docks to the right edge —
 * then the canvas shrinks so panels tile beside it instead of underneath. Closed, it takes no space.
 * (Phones never showed a roster column; they still don't.)
 */
export function RosterDrawer({ children, count }: { children: ReactNode; count?: number }) {
  const store = useWorkspaceStore();
  const mode = useWorkspace((s) => s.roster);
  useEffect(() => store.mount("roster"), [store]);
  const open = mode !== "closed";

  return (
    <div
      role="complementary"
      aria-label="Member roster"
      aria-hidden={!open || undefined}
      data-roster={mode}
      style={{ width: ROSTER_WIDTH }}
      className={cn(
        "absolute bottom-[var(--tray,0px)] right-0 top-0 z-[900] flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 shadow-2xl shadow-black/50 backdrop-blur-2xl max-md:hidden",
        "transition-[translate,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
        open ? "translate-x-0 opacity-100" : "pointer-events-none invisible translate-x-[calc(100%+1rem)] opacity-0",
      )}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3">
        <Users className="size-4 text-sun" aria-hidden />
        <span className="flex-1 font-silk text-[10px] uppercase tracking-widest text-slate-300">
          Members{count !== undefined && <span className="ml-1.5 tabular-nums text-slate-500">{count}</span>}
        </span>
        <Tooltip label={mode === "docked" ? "Undock (float over panels)" : "Dock beside panels"} side="bottom">
          <button
            type="button"
            aria-label="Dock roster"
            aria-pressed={mode === "docked"}
            onClick={() => store.setRoster(mode === "docked" ? "open" : "docked")}
            className="flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/10 hover:text-white aria-pressed:text-sun"
          >
            {mode === "docked" ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}
          </button>
        </Tooltip>
        <button
          type="button"
          aria-label="Close roster"
          onClick={() => store.setRoster("closed")}
          className="flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1">{children}</div>
    </div>
  );
}
