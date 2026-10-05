"use client";

import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useCoupledResize } from "@/hooks/useCoupledResize";
import { coupledResize, findSeams, MIN_H, MIN_W, visibleRectsOf, type Seam } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { useMountedPanels, useWorkspace, useWorkspaceBounds } from "./WorkspaceProvider";

const STEP = 16;

/**
 * Joints between docked panels. Each seam is a WAI-ARIA window splitter: drag it (or focus it and use
 * the arrow keys) to resize both panels at once — one grows exactly as much as the other shrinks.
 * Alt / Option + arrows (or dragging with Alt held) moves only the first panel's edge.
 */
export function WorkspaceSeams() {
  const panels = useWorkspace((s) => s.panels);
  const bounds = useWorkspaceBounds();
  const mounted = useMountedPanels();
  const resize = useCoupledResize();
  if (!bounds) return null;
  const rects = visibleRectsOf(panels, bounds, mounted);

  return (
    <>
      {findSeams(rects).map((seam) => {
        const vertical = seam.orientation === "vertical";
        const edge = vertical ? "e" : "s";
        const size = vertical ? rects[seam.a]!.w : rects[seam.a]!.h;
        const max = vertical ? coupledResize(rects, seam.a, "e", 1e5, 0, bounds)[seam.a]!.w : coupledResize(rects, seam.a, "s", 0, 1e5, bounds)[seam.a]!.h;
        const label = `Resize ${mounted.get(seam.a) ?? seam.a} and ${mounted.get(seam.b) ?? seam.b}`;

        const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
          const dir = (vertical ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 })[e.key as "ArrowLeft"];
          if (!dir) return;
          e.preventDefault();
          const step = dir * (e.shiftKey ? STEP * 4 : STEP);
          resize.nudge(seam.a, edge, vertical ? step : 0, vertical ? 0 : step, e.altKey);
        };
        const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
          e.currentTarget.setAttribute("data-active", "");
          resize.begin(seam.a, edge, e);
        };
        const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
          e.currentTarget.removeAttribute("data-active");
          resize.end();
        };

        return (
          <div
            key={`${seam.a}:${seam.b}`}
            data-seam={`${seam.a}:${seam.b}`}
            role="separator"
            tabIndex={0}
            aria-label={label}
            aria-orientation={vertical ? "vertical" : "horizontal"}
            aria-valuenow={Math.round(size)}
            aria-valuemin={vertical ? MIN_W : MIN_H}
            aria-valuemax={Math.round(max)}
            title={`${label} together. Hold Alt (Option) to move only one edge.`}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={resize.move}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={seamStyle(seam)}
            className={cn(
              "group/seam absolute z-[800] flex touch-none items-center justify-center outline-none max-md:hidden",
              vertical ? "cursor-col-resize" : "cursor-row-resize",
              // While anything is being resized, only the seam in use stays visible.
              "group-data-[resizing]/ws:opacity-0 data-[active]:!opacity-100",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "rounded-full bg-white/15 transition-[background-color,scale] duration-150 group-hover/seam:bg-sun group-focus-visible/seam:bg-sun group-data-[active]/seam:bg-sun group-focus-visible/seam:ring-2 group-focus-visible/seam:ring-sun group-focus-visible/seam:ring-offset-2 group-focus-visible/seam:ring-offset-abyss",
                vertical ? "h-10 w-1 group-hover/seam:scale-y-150 group-data-[active]/seam:scale-y-150" : "h-1 w-10 group-hover/seam:scale-x-150 group-data-[active]/seam:scale-x-150",
              )}
            />
          </div>
        );
      })}
    </>
  );
}

function seamStyle(seam: Seam) {
  return { left: seam.rect.x, top: seam.rect.y, width: seam.rect.w, height: seam.rect.h };
}
