"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

const STEP = 16;

/**
 * Drag handle on a column's edge: drag to resize, arrow keys (Shift for bigger steps), Home/End for
 * the limits, double-click (or Enter) to go back to the default width.
 */
export function ResizeHandle({
  label,
  side,
  value,
  min,
  max,
  initial,
  onChange,
}: {
  label: string;
  /** Which edge of its column the handle sits on: the column grows away from it. */
  side: "right" | "left";
  value: number;
  min: number;
  max: number;
  initial: number;
  onChange: (width: number) => void;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const dir = side === "right" ? 1 : -1;

  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, width: value };
    document.body.style.cursor = "col-resize";
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    onChange(drag.current.width + (e.clientX - drag.current.x) * dir);
  }
  function up() {
    drag.current = null;
    document.body.style.cursor = "";
  }
  function key(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? STEP * 4 : STEP;
    const next =
      e.key === "ArrowRight" ? value + step * dir : e.key === "ArrowLeft" ? value - step * dir : e.key === "Home" ? min : e.key === "End" ? max : e.key === "Enter" ? initial : null;
    if (next === null) return;
    e.preventDefault();
    onChange(next);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={() => onChange(initial)}
      onKeyDown={key}
      className={cn(
        "group/handle absolute inset-y-0 z-20 flex w-2 cursor-col-resize touch-none justify-center outline-none max-md:hidden",
        side === "right" ? "-right-1" : "-left-1",
      )}
    >
      <span className="h-full w-px bg-transparent transition-colors group-hover/handle:bg-sun/60 group-focus-visible/handle:bg-sun group-active/handle:bg-sun" aria-hidden />
    </div>
  );
}
