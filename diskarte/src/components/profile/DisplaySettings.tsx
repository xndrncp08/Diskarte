"use client";

import { Switch } from "@/components/ui/Switch";
import { FONT_SIZES, setDisplayPrefs, useDisplayPrefs } from "@/lib/display-prefs";
import { cn } from "@/lib/utils";

function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-white">{label}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm transition-colors",
              value === o.value ? "border-sun/70 bg-sun/10 text-white" : "border-white/10 text-slate-300 hover:border-white/25",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Discord's Chat settings (this browser). */
export function ChatSettings() {
  const prefs = useDisplayPrefs();
  return (
    <div className="max-w-md space-y-5" data-testid="chat-settings">
      <Switch checked={prefs.inlineMedia} onChange={(inlineMedia) => setDisplayPrefs({ inlineMedia })} label="Display images and videos" hint="Off: uploads show as links you can click to open." />
      <Switch checked={prefs.reactions} onChange={(reactions) => setDisplayPrefs({ reactions })} label="Show emoji reactions on messages" />
      <Choice
        label="Show spoiler content"
        value={prefs.spoilers}
        options={[
          { value: "click", label: "On click" },
          { value: "always", label: "Always" },
        ]}
        onChange={(spoilers) => setDisplayPrefs({ spoilers })}
      />
      <Switch checked={prefs.hour24} onChange={(hour24) => setDisplayPrefs({ hour24 })} label="Use 24-hour time" />
    </div>
  );
}

/** Discord's Accessibility settings (this browser). */
export function AccessibilitySettings() {
  const prefs = useDisplayPrefs();
  return (
    <div className="max-w-md space-y-5" data-testid="accessibility-settings">
      <Choice label="Chat font size" value={prefs.fontSize} options={FONT_SIZES.map((px) => ({ value: px, label: `${px}px` }))} onChange={(fontSize) => setDisplayPrefs({ fontSize })} />
      <p className="text-[length:var(--chat-font-size,15px)] text-slate-300">Kumusta! This is how messages will look.</p>
      <Choice
        label="Reduced motion"
        value={prefs.reducedMotion}
        options={[
          { value: "system", label: "Sync with computer" },
          { value: "on", label: "Always reduce" },
        ]}
        onChange={(reducedMotion) => setDisplayPrefs({ reducedMotion })}
      />
      <Switch checked={prefs.roleColors} onChange={(roleColors) => setDisplayPrefs({ roleColors })} label="Show role colors in names" />
      <Switch checked={prefs.underlineLinks} onChange={(underlineLinks) => setDisplayPrefs({ underlineLinks })} label="Always underline links" />
    </div>
  );
}
