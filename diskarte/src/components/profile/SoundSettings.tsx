"use client";

import { Volume1, Volume2, VolumeX } from "lucide-react";
import { useId } from "react";
import { useSfxSettings } from "@/hooks/useSfxSettings";
import { playSfx, setSfxSettings, type SfxName } from "@/lib/sfx";
import { cn } from "@/lib/utils";

const PREVIEWS: { cue: SfxName; label: string }[] = [
  { cue: "join", label: "Join" },
  { cue: "leave", label: "Leave" },
  { cue: "message", label: "Message" },
  { cue: "mute", label: "Mute" },
  { cue: "unmute", label: "Unmute" },
  { cue: "ring", label: "Ring" },
];

/** On/off switch, master volume and previews for the 8-bit sound effects. */
export function SoundSettings({ className }: { className?: string }) {
  const settings = useSfxSettings();
  const sliderId = useId();
  const percent = Math.round(settings.volume * 100);
  const Icon = !settings.enabled || percent === 0 ? VolumeX : percent < 50 ? Volume1 : Volume2;

  return (
    <div className={cn("space-y-4", className)} data-testid="sound-settings">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <Icon className="size-4 text-sun" aria-hidden /> 8-bit sound effects
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          aria-label="8-bit sound effects"
          onClick={() => {
            setSfxSettings({ enabled: !settings.enabled });
            if (!settings.enabled) playSfx("start");
          }}
          className={cn(
            "touch-target relative h-6 w-11 shrink-0 rounded-full border transition-colors",
            settings.enabled ? "border-sun bg-sun" : "border-white/20 bg-white/10",
          )}
        >
          <span
            className={cn("absolute top-0.5 size-[18px] rounded-sm bg-abyss transition-[left] duration-150", settings.enabled ? "left-[22px]" : "left-0.5")}
            aria-hidden
          />
        </button>
      </div>

      <div className={cn("space-y-1.5", !settings.enabled && "opacity-50")}>
        <div className="flex items-center justify-between">
          <label htmlFor={sliderId} className="font-silk text-[11px] uppercase tracking-wider text-slate-300">
            Volume
          </label>
          <span className="font-pixel text-[9px] tabular-nums text-sun" aria-hidden>
            {percent}%
          </span>
        </div>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={100}
          step={5}
          value={percent}
          disabled={!settings.enabled}
          aria-valuetext={`${percent}%`}
          onChange={(e) => setSfxSettings({ volume: Number(e.target.value) / 100 })}
          onPointerUp={() => playSfx("message")}
          onKeyUp={(e) => (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") && playSfx("message")}
          className="h-2 w-full cursor-pointer accent-[#FFB800] pointer-coarse:h-6"
        />
      </div>

      <div>
        <p className="mb-1.5 font-silk text-[11px] uppercase tracking-wider text-slate-400">Test</p>
        <div className="flex flex-wrap gap-1.5">
          {PREVIEWS.map(({ cue, label }) => (
            <button
              key={cue}
              type="button"
              onClick={() => playSfx(cue, settings.enabled ? settings.volume : 0.6)}
              className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-200 transition-colors hover:bg-white/10 active:scale-95 pointer-coarse:py-2.5"
            >
              ▶ {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
