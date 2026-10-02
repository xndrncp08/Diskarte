"use client";

import { Music4 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { Popover } from "@/components/ui/Popover";
import { Switch } from "@/components/ui/Switch";
import type { SoundboardClip } from "@/lib/community";
import { BUILTIN_CLIPS, createThrottle, setSoundboardMuted, soundboardMuted, SOUNDBOARD_COOLDOWN_MS, type SoundboardMessage } from "@/lib/soundboard";
import { cn } from "@/lib/utils";
import { useCall } from "../CallProvider";
import { playSoundboard } from "../soundboard-player";

/** Call toolbar soundboard: built-in 8-bit memes + the tambayan's uploaded clips, heard by everyone. */
export function SoundboardPanel() {
  const supabase = useSupabase();
  const { sendData, target } = useCall();
  const serverId = target?.kind === "dm" ? null : target?.serverId;
  const [clips, setClips] = useState<SoundboardClip[]>([]);
  const [muted, setMuted] = useState(soundboardMuted);
  const [cooling, setCooling] = useState(false);
  const allow = useRef(createThrottle(SOUNDBOARD_COOLDOWN_MS));

  useEffect(() => {
    if (!serverId) return;
    let cancelled = false;
    void supabase
      .from("soundboard_clips")
      .select("*")
      .eq("server_id", serverId)
      .order("created_at")
      .then(({ data }) => !cancelled && setClips(data ?? []));
    return () => {
      cancelled = true;
    };
  }, [supabase, serverId]);

  function fire(message: SoundboardMessage) {
    if (!allow.current("me")) {
      toast("Hold on — the soundboard is on cooldown. ⏳");
      return;
    }
    setCooling(true);
    setTimeout(() => setCooling(false), SOUNDBOARD_COOLDOWN_MS);
    void playSoundboard(supabase, message, { force: true });
    void sendData("soundboard", message).catch(() => toast.error("Couldn't play the sound."));
  }

  const tile = "flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-1 py-2 text-[11px] font-semibold text-slate-200 transition-[background-color,transform] hover:bg-white/10 active:scale-95 disabled:opacity-40";

  return (
    <Popover
      label="Soundboard"
      testId="soundboard"
      className="w-80"
      trigger={({ ref, toggle, open, ...aria }) => (
        <button
          ref={ref}
          type="button"
          aria-label="Soundboard"
          onClick={toggle}
          {...aria}
          className={cn("flex size-11 items-center justify-center rounded-2xl transition-colors sm:size-12", open ? "bg-white text-abyss" : "bg-white/10 text-slate-200 hover:bg-white/20")}
        >
          <Music4 className="size-5" aria-hidden />
        </button>
      )}
    >
      <div className="space-y-3">
        <p className="font-pixel text-[9px] text-sun">SOUNDBOARD</p>
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="8-bit sounds">
          {BUILTIN_CLIPS.map((clip) => (
            <button key={clip.key} type="button" disabled={cooling} onClick={() => fire({ type: "play", kind: "builtin", key: clip.key })} className={tile}>
              <span className="text-xl" aria-hidden>
                {clip.emoji}
              </span>
              <span className="w-full truncate text-center">{clip.name}</span>
            </button>
          ))}
        </div>
        {clips.length > 0 && (
          <>
            <p className="font-silk text-[11px] uppercase tracking-wider text-slate-400">Server sounds</p>
            <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Server sounds">
              {clips.map((clip) => (
                <button key={clip.id} type="button" disabled={cooling} onClick={() => fire({ type: "play", kind: "clip", clipId: clip.id })} className={tile}>
                  <span className="text-xl" aria-hidden>
                    {clip.emoji}
                  </span>
                  <span className="w-full truncate text-center">{clip.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <Switch
          checked={muted}
          onChange={(value) => {
            setMuted(value);
            setSoundboardMuted(value);
          }}
          label="Mute other people's soundboard"
          hint="Only you won't hear it."
        />
      </div>
    </Popover>
  );
}
