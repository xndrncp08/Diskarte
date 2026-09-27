"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { builtinClip, MAX_CLIP_MS, soundboardMuted, type SoundboardMessage } from "@/lib/soundboard";
import { getSfxSettings, playCue } from "@/lib/sfx";

const urlCache = new Map<string, { url: string; expires: number }>();

async function clipUrl(supabase: SupabaseClient, clipId: string): Promise<string | null> {
  const hit = urlCache.get(clipId);
  if (hit && hit.expires > Date.now() + 60_000) return hit.url;
  // RLS: only members of the clip's tambayan can read the row and sign the object.
  const { data: clip } = await supabase.from("soundboard_clips").select("storage_path").eq("id", clipId).maybeSingle();
  if (!clip) return null;
  const { data } = await supabase.storage.from("soundboard").createSignedUrl(clip.storage_path, 3600);
  if (!data?.signedUrl) return null;
  urlCache.set(clipId, { url: data.signedUrl, expires: Date.now() + 3600_000 });
  return data.signedUrl;
}

/**
 * Plays a soundboard message locally at the 8-bit master volume. Uploaded clips are cut off after
 * MAX_CLIP_MS so nobody can blast a 10-minute MP3 into the call.
 */
export async function playSoundboard(supabase: SupabaseClient, message: SoundboardMessage, opts: { force?: boolean } = {}) {
  if (!opts.force && soundboardMuted()) return;
  const { volume } = getSfxSettings();
  const level = volume > 0 ? volume : 0.5;
  if (message.kind === "builtin") {
    const clip = builtinClip(message.key);
    if (clip) playCue(clip.cue, level);
    return;
  }
  const url = await clipUrl(supabase, message.clipId);
  if (!url) return;
  const audio = new Audio(url);
  audio.volume = Math.min(1, level);
  const stop = setTimeout(() => audio.pause(), MAX_CLIP_MS);
  audio.addEventListener("ended", () => clearTimeout(stop));
  await audio.play().catch(() => clearTimeout(stop));
}
