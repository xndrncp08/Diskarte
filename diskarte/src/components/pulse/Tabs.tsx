"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  /** Trailing content such as a <CountBadge> (it must name itself; the label stays the tab's main name). */
  badge?: ReactNode;
  disabled?: boolean;
}

/**
 * Pulse tabs (APG tabs, automatic activation). One tab stop: the selected tab has tabIndex 0, the rest -1;
 * ArrowLeft/ArrowRight move and select (wrapping), Home/End jump, disabled tabs are skipped. Each tab sets
 * aria-selected and aria-controls; the active panel (`children`) renders in role="tabpanel", labelled by its tab.
 * The selected tab gets a solar underline (accent-mark) plus bold text, so selection never rests on colour.
 * The strip scrolls sideways on narrow screens instead of overflowing the page.
 */
export function Tabs({
  label,
  items,
  value,
  onChange,
  children,
  className,
}: {
  /** Accessible name of the tablist ("Community sections"). */
  label: string;
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  children?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  const enabled = items.filter((t) => !t.disabled);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = enabled.findIndex((t) => t.id === value);
    const next =
      e.key === "ArrowRight" ? enabled[(index + 1) % enabled.length]
      : e.key === "ArrowLeft" ? enabled[(index - 1 + enabled.length) % enabled.length]
      : e.key === "Home" ? enabled[0]
      : e.key === "End" ? enabled[enabled.length - 1]
      : undefined;
    if (!next) return;
    e.preventDefault();
    onChange(next.id);
    list.current?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(next.id)}"]`)?.focus();
  };

  return (
    <div className={className}>
      <div ref={list} role="tablist" aria-label={label} onKeyDown={onKeyDown} className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-pulse-line">
        {items.map((t) => {
          const selected = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${id}-tab-${t.id}`}
              data-tab={t.id}
              aria-selected={selected}
              aria-controls={selected && children !== undefined ? `${id}-panel` : undefined}
              tabIndex={selected ? 0 : -1}
              disabled={t.disabled}
              onClick={() => onChange(t.id)}
              className={cn(
                "relative inline-flex min-h-11 shrink-0 items-center gap-2 px-3 font-pulse-text text-pulse-body transition-colors disabled:text-pulse-disabled",
                "after:absolute after:inset-x-2 after:-bottom-px after:h-[3px] after:rounded-t-full after:transition-colors after:duration-(--pulse-dur-ui)",
                selected ? "font-semibold text-pulse-text after:bg-pulse-accent-mark" : "text-pulse-muted hover:text-pulse-text after:bg-transparent",
              )}
            >
              {t.label}
              {t.badge}
            </button>
          );
        })}
      </div>
      {children !== undefined && (
        <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${value}`} tabIndex={0} className="pt-4">
          {children}
        </div>
      )}
    </div>
  );
}
