"use client";

import { useEffect, useRef } from "react";
import { useOptionalSupabase } from "@/components/providers/RuntimeConfig";
import { createThrottle, parseSoundboardMessage, SOUNDBOARD_COOLDOWN_MS } from "@/lib/soundboard";
import { useCall } from "./CallProvider";
import { playSoundboard } from "./soundboard-player";

/** Plays clips other people fire from the soundboard (skipped while deafened or muted by you). */
export function SoundboardReceiver() {
  const supabase = useOptionalSupabase();
  const { onData, deafened } = useCall();
  const deafenedRef = useRef(deafened);
  useEffect(() => {
    deafenedRef.current = deafened;
  }, [deafened]);

  useEffect(() => {
    if (!supabase) return;
    // Per-sender cooldown on the receiving side too, in case a modified client spams.
    const allow = createThrottle(SOUNDBOARD_COOLDOWN_MS - 250);
    return onData("soundboard", (payload, from) => {
      const message = parseSoundboardMessage(payload);
      if (!message || deafenedRef.current || !allow(from ?? "unknown")) return;
      void playSoundboard(supabase, message);
    });
  }, [onData, supabase]);

  return null;
}
