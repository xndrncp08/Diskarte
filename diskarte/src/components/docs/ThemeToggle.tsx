"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { setDisplayPrefs } from "@/lib/display-prefs";
import { cn } from "@/lib/utils";

const MODES = [
  { mode: "dark", label: "Dark", Icon: Moon },
  { mode: "light", label: "Light", Icon: Sun },
  { mode: "system", label: "System", Icon: Monitor },
] as const;
type Mode = (typeof MODES)[number]["mode"];

const media = () => window.matchMedia("(prefers-color-scheme: light)");
const apply = (mode: Mode) => { document.documentElement.dataset.colorMode = mode === "system" ? (media().matches ? "light" : "dark") : mode; };

/**
 * Dark / light / system for the docs. The root layout already rendered the saved mode from the
 * `diskarte-mode` cookie, so this only reads it and writes a new choice (the same preference the app uses).
 */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode | null>(null);
  useEffect(() => {
    const saved = /(?:^|;\s*)diskarte-mode=(light|system|dark)/.exec(document.cookie)?.[1] as Mode | undefined;
    // Reading the cookie is the external sync; the server render can't know it for static markup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(saved ?? "dark");
  }, []);
  useEffect(() => {
    if (mode !== "system") return;
    const query = media();
    const follow = () => apply("system");
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, [mode]);
  const choose = (next: Mode) => {
    setMode(next);
    setDisplayPrefs({ colorMode: next });
    apply(next);
  };
  return (
    <div role="radiogroup" aria-label="Colour mode" className="docs-theme">
      {MODES.map(({ mode: value, label, Icon }) => (
        <button key={value} type="button" role="radio" aria-checked={mode === value} aria-label={label} title={label} onClick={() => choose(value)} className={cn(mode === value && "docs-theme-on")}>
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
