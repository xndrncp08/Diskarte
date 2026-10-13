"use client";

import { Check } from "lucide-react";
import { useSyncExternalStore } from "react";
import { getTheme, setTheme, subscribeTheme, THEMES } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Theme swatches (saved per browser). */
export function ThemePicker({ className }: { className?: string }) {
  const current = useSyncExternalStore(subscribeTheme, getTheme, () => "solar");
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("grid grid-cols-3 gap-2 sm:grid-cols-6", className)}>
      {THEMES.map((t) => {
        const selected = t.id === current;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(t.id)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border p-2 text-xs transition-colors pointer-coarse:min-h-11",
              selected ? "border-white/40 text-white" : "border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-200",
            )}
          >
            <span className="relative flex size-9 items-center justify-center rounded-full" style={{ background: `linear-gradient(135deg, ${t.accent} 0 45%, ${t.base} 55%)` }}>
              {selected && <Check className="size-4 text-white drop-shadow" aria-hidden />}
            </span>
            {t.name}
          </button>
        );
      })}
    </div>
  );
}
