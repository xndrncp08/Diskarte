"use client";

import { AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FloatingPortal, useFloating, type Side } from "./floating";
import { InertWhenExiting } from "./InertWhenExiting";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
  /** Set for choice items (a status switcher): rendered as a checked/unchecked radio menu item. */
  checked?: boolean;
}

const ITEM_SELECTOR = "[role=menuitem],[role=menuitemradio]";

/**
 * Popover menu (server menu, status switcher…). The panel is portalled to <body> with fixed
 * positioning, so sidebars with `overflow` can't clip it and opening it never reflows the columns.
 * It flips above the trigger when there's no room below. Keyboard: arrows move, Home/End jump,
 * Escape closes and returns focus to the trigger; clicking outside closes it.
 */
export function Menu({
  trigger,
  items,
  align = "start",
  side = "bottom",
  className,
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  side?: Side;
  className?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const visible = items.filter((i) => !i.hidden);
  const { style, side: resolvedSide } = useFloating(open, root, panel, { side, align, offset: 4 });

  // Focus goes back to the trigger synchronously, so a dialog opened by the selected item records
  // the trigger as the element to restore focus to when it closes.
  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) root.current?.querySelector<HTMLElement>("button, [href], [tabindex]")?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent | MouseEvent) => {
      const target = e.target as Node;
      if (!root.current?.contains(target) && !panel.current?.contains(target)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
        return;
      }
      const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
      if (nodes.length === 0) return;
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      let next = -1;
      if (e.key === "ArrowDown") next = (index + 1) % nodes.length;
      else if (e.key === "ArrowUp") next = (index - 1 + nodes.length) % nodes.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = nodes.length - 1;
      else if (e.key === "Tab") close(false);
      if (next >= 0) {
        e.preventDefault();
        nodes[next].focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    const frame = requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <div ref={root} className={cn("relative", className)}>
      {trigger({ open, toggle: () => setOpen((o) => !o), id })}
      <FloatingPortal>
        <AnimatePresence>
          {open && visible.length > 0 && (
            <InertWhenExiting
              ref={panel}
              id={id}
              role="menu"
              aria-label={label}
              data-side={resolvedSide}
              data-floating="menu"
              style={style}
              initial={{ opacity: 0, y: resolvedSide === "top" ? 4 : -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              className="glass-strong z-50 min-w-52 max-w-[calc(100vw-1rem)] rounded-xl p-1.5 shadow-xl shadow-black/50"
            >
              {visible.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role={item.checked === undefined ? "menuitem" : "menuitemradio"}
                  aria-checked={item.checked}
                  onClick={() => {
                    close(true);
                    item.onSelect();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm outline-none transition-colors pointer-coarse:py-3",
                    item.danger ? "text-red-300 hover:bg-red-500/20 focus:bg-red-500/20" : "text-slate-200 hover:bg-sun/90 hover:text-abyss focus:bg-sun/90 focus:text-abyss",
                    item.checked && "bg-white/10 font-semibold text-white",
                  )}
                >
                  {item.icon}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.checked && <Check className="size-4 shrink-0" aria-hidden />}
                </button>
              ))}
            </InertWhenExiting>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </div>
  );
}
