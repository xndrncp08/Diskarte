"use client";

import { AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { useCallback, useEffect, useEffectEvent, useId, useRef, useState, type ReactNode, type RefObject } from "react";
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
  /** Consecutive items sharing a group render as one labelled section (e.g. "Status", "Custom status"). */
  group?: string;
}

export const ITEM_SELECTOR = "[role=menuitem],[role=menuitemradio]";

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

  useMenuDismiss(open, [root, panel], () => close(false));
  useMenuKeyboard(open, panel, () => close(true), () => close(false));

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
              className="glass-strong z-50 min-w-52 max-w-[calc(100vw-1rem)] rounded-xl bg-slate-950! p-1.5 shadow-xl shadow-black/50"
            >
              <MenuItems items={visible} onPick={() => close(true)} />
            </InertWhenExiting>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </div>
  );
}

/**
 * Closes the menu on a press outside every element in `inside` (the trigger and the panel).
 * `mousedown` rather than click, so pressing another control closes the menu before it acts.
 */
export function useMenuDismiss(open: boolean, inside: readonly RefObject<HTMLElement | null>[], onDismiss: () => void) {
  const dismiss = useEffectEvent(onDismiss);
  const refs = useRef(inside);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!refs.current.some((r) => r.current?.contains(target))) dismiss();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
}

/**
 * Menu keyboard: arrows move, Home/End jump, Tab leaves, Escape closes. Focus lands on the checked
 * item (a status switcher opens on the current choice) or else the first one.
 */
export function useMenuKeyboard(open: boolean, panel: RefObject<HTMLElement | null>, onEscape: () => void, onTab: () => void = onEscape) {
  const escape = useEffectEvent(onEscape);
  const tab = useEffectEvent(onTab);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        escape();
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
      else if (e.key === "Tab") tab();
      if (next >= 0) {
        e.preventDefault();
        nodes[next].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const frame = requestAnimationFrame(() =>
      (panel.current?.querySelector<HTMLElement>("[aria-checked=true]") ?? panel.current?.querySelector<HTMLElement>(ITEM_SELECTOR))?.focus(),
    );
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, panel]);
}

/** The rows of a menu panel, split into labelled sections; shared by <Menu> and <ContextMenu>. */
export function MenuItems({ items, onPick }: { items: MenuItem[]; onPick: () => void }) {
  return sections(items.filter((i) => !i.hidden)).map((section, i) =>
    section.group ? (
      <div key={section.group} role="group" aria-label={section.group} className={cn(i > 0 && "mt-1 border-t border-white/10 pt-1")}>
        <p className="px-2.5 pb-0.5 pt-1 font-silk text-[10px] uppercase tracking-wider text-slate-500" aria-hidden>
          {section.group}
        </p>
        {section.items.map((item) => (
          <MenuRow key={item.label} item={item} onPick={onPick} />
        ))}
      </div>
    ) : (
      <div key={`plain-${i}`} className={cn(i > 0 && "mt-1 border-t border-white/10 pt-1")}>
        {section.items.map((item) => (
          <MenuRow key={item.label} item={item} onPick={onPick} />
        ))}
      </div>
    ),
  );
}

/** Splits items into runs that share a `group` (ungrouped runs stay plain). */
function sections(items: MenuItem[]) {
  const out: { group?: string; items: MenuItem[] }[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else out.push({ group: item.group, items: [item] });
  }
  return out;
}

function MenuRow({ item, onPick }: { item: MenuItem; onPick: () => void }) {
  return (
    <button
      type="button"
      role={item.checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={item.checked}
      onClick={() => {
        onPick();
        item.onSelect();
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm outline-none transition-colors pointer-coarse:py-3",
        // Gold is the *keyboard* highlight only, so a mouse-opened menu never looks like row one is picked.
        item.danger
          ? "text-red-300 hover:bg-red-500/20 focus-visible:bg-red-500/20"
          : "text-slate-200 hover:bg-white/10 hover:text-white focus-visible:bg-sun/90 focus-visible:text-abyss",
        item.checked && "bg-white/10 font-semibold text-white",
      )}
    >
      {item.icon}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.checked && <Check className="size-4 shrink-0 text-sun" aria-hidden />}
    </button>
  );
}
