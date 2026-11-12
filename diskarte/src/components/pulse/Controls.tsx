"use client";

import { useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const PREV = ["ArrowLeft", "ArrowUp"];
const NEXT = ["ArrowRight", "ArrowDown"];

/** Roving-focus index for arrow keys (wrapping), Home and End; -1 for any other key. */
export function rovingIndex(key: string, index: number, length: number) {
  if (NEXT.includes(key)) return (index + 1) % length;
  if (PREV.includes(key)) return (index - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return -1;
}

export interface Segment<T extends string> {
  value: T;
  label: string;
  /** Decorative leading icon. */
  icon?: ReactNode;
}

/**
 * Segmented control (APG radio group): pick one of a few views or filters ("All / Unread / Mentions").
 * One tab stop on the checked segment; arrow keys move and select (wrapping), Home/End jump. The checked
 * segment is a raised, shadowed, bold block (shape and weight, not colour). 36 px tall, 44 px on touch.
 */
export function SegmentedControl<T extends string>({ label, options, value, onChange, className }: { label: string; options: Segment<T>[]; value: T; onChange: (value: T) => void; className?: string }) {
  const group = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = rovingIndex(e.key, options.findIndex((o) => o.value === value), options.length);
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].value);
    group.current?.querySelectorAll<HTMLElement>("[role=radio]")[next]?.focus();
  };
  return (
    <div ref={group} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={cn("inline-flex max-w-full gap-0.5 overflow-x-auto rounded-pulse-control bg-pulse-pressed p-0.5 font-pulse-text", className)}>
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-pulse-control px-3 text-pulse-label transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11 justify-center [&_svg]:size-4",
              checked ? "bg-pulse-surface font-semibold text-pulse-text shadow-pulse-1" : "text-pulse-muted hover:text-pulse-text",
            )}
          >
            {o.icon && <span className="inline-flex" aria-hidden>{o.icon}</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const TOOL = "button:not(:disabled), a[href]";

/**
 * APG toolbar: a labelled group of controls (Pulse IconButtons, Buttons) that is one Tab stop. Arrow keys move
 * focus between them (wrapping; Left/Right, or Up/Down when vertical), Home/End jump, and the last focused
 * control is where Tab returns. Disabled buttons are skipped. Children keep their own names and actions.
 */
export function Toolbar({ label, children, orientation = "horizontal", className }: { label: string; children: ReactNode; orientation?: "horizontal" | "vertical"; className?: string }) {
  const bar = useRef<HTMLDivElement>(null);
  const active = useRef(0);
  const tools = () => Array.from(bar.current?.querySelectorAll<HTMLElement>(TOOL) ?? []);
  // Every render: children may have changed, so re-apply the single tab stop (no state, so no loop).
  useLayoutEffect(() => {
    const all = tools();
    active.current = Math.min(active.current, Math.max(0, all.length - 1));
    all.forEach((el, i) => (el.tabIndex = i === active.current ? 0 : -1));
  });
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((orientation === "horizontal" ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"]).includes(e.key)) return;
    const all = tools();
    const next = rovingIndex(e.key, all.indexOf(document.activeElement as HTMLElement), all.length);
    if (next < 0 || all.length === 0) return;
    e.preventDefault();
    all[next].focus();
  };
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const all = tools();
    const i = all.indexOf(e.target as HTMLElement);
    if (i < 0) return;
    active.current = i;
    all.forEach((el, j) => (el.tabIndex = j === i ? 0 : -1));
  };
  return (
    <div ref={bar} role="toolbar" aria-label={label} aria-orientation={orientation} onKeyDown={onKeyDown} onFocus={onFocus} className={cn("flex gap-1", orientation === "vertical" && "flex-col", className)}>
      {children}
    </div>
  );
}

/**
 * Keyboard key hint ("Ctrl", "K", "Esc"). A <kbd> in a small raised keycap. For a symbol (⌘, ⇧, ↵) pass `label`
 * ("Command") so screen readers hear the key's name instead of the glyph. Combine as <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>.
 */
export function Kbd({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-pulse-control border border-b-2 border-pulse-line-strong bg-pulse-raised px-1 font-pulse-text text-pulse-caption font-semibold text-pulse-muted", className)}>
      {label ? (
        <>
          <span aria-hidden>{children}</span>
          <span className="sr-only">{label}</span>
        </>
      ) : (
        children
      )}
    </kbd>
  );
}
