"use client";

import { Check } from "lucide-react";
import { useSyncExternalStore } from "react";
import { getTheme, setTheme, subscribeTheme, THEMES } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { setDisplayPrefs, useDisplayPrefs } from "@/lib/display-prefs";
import { useLocale } from "@/lib/locale";

/** Theme swatches (saved per browser). */
export function ThemePicker({ className }: { className?: string }) {
  const current = useSyncExternalStore(subscribeTheme, getTheme, () => "solar");
  const { colorMode } = useDisplayPrefs(), { t } = useLocale();
  return (
    <div className="space-y-4">
      <fieldset><legend className="mb-2 text-sm font-semibold">{t("Color mode")}</legend><div role="radiogroup" aria-label={t("Color mode")} className="flex gap-2">{(["dark", "light", "system"] as const).map((mode) => <button key={mode} type="button" role="radio" aria-checked={mode === colorMode} onClick={() => setDisplayPrefs({ colorMode: mode })} className={cn("min-h-11 rounded-lg border px-4 text-sm", mode === colorMode ? "border-sun bg-sun/10" : "border-white/15")}>{t({ dark: "Dark", light: "Light", system: "System" }[mode])}</button>)}</div></fieldset>
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
    </div>
  );
}
