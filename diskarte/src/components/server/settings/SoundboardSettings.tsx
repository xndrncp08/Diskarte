"use client";

import { Play, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { addSoundboardClipAction, removeSoundboardClipAction } from "@/actions/moderation";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/Field";
import { useSignedUrls } from "@/hooks/useSignedUrls";
import type { SoundboardClip } from "@/lib/community";
import { BUILTIN_CLIPS, MAX_CLIP_BYTES, MAX_CLIP_MS } from "@/lib/soundboard";
import { getSfxSettings, playCue } from "@/lib/sfx";
import { sniffMatches } from "@/lib/uploads";

const MAX_CLIPS = 24;

/** Validates an MP3 before upload: type, size, magic bytes. */
export async function validateClip(file: File): Promise<string | null> {
  if (file.type !== "audio/mpeg" && !file.name.toLowerCase().endsWith(".mp3")) return "Only MP3 files are allowed.";
  if (file.size > MAX_CLIP_BYTES) return "Each sound can be up to 1 MB.";
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!sniffMatches("audio/mpeg", head)) return "That file doesn't look like a real MP3.";
  return null;
}

/** Admins: add/remove the tambayan's custom soundboard clips (built-ins are always available). */
export function SoundboardSettings() {
  const supabase = useSupabase();
  const { server } = useServer();
  const [clips, setClips] = useState<SoundboardClip[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const urls = useSignedUrls(
    clips.map((c) => c.storage_path),
    "soundboard",
  );

  const load = useCallback(async () => {
    const { data } = await supabase.from("soundboard_clips").select("*").eq("server_id", server.id).order("created_at");
    setClips(data ?? []);
  }, [supabase, server.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!file) return setErrors({ file: "Choose an MP3." });
    const problem = await validateClip(file);
    if (problem) return setErrors({ file: problem });
    setUploading(true);
    const path = `${server.id}/${crypto.randomUUID()}.mp3`;
    const { error } = await supabase.storage.from("soundboard").upload(path, file, { contentType: "audio/mpeg", upsert: false });
    if (error) {
      setUploading(false);
      toast.error("Couldn't upload the sound.");
      return;
    }
    const result = await addSoundboardClipAction({ serverId: server.id, name: String(data.get("name") ?? ""), emoji: String(data.get("emoji") ?? ""), path });
    setUploading(false);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast.error(result.error ?? "Couldn't save the sound.");
      return;
    }
    setErrors({});
    setFile(null);
    form.reset();
    toast.success("New sound added to the soundboard! 🔊");
    void load();
  }

  function remove(clip: SoundboardClip) {
    startTransition(async () => {
      const result = await removeSoundboardClipAction({ clipId: clip.id });
      if (!result.ok) return void toast.error(result.error ?? "Couldn't remove.");
      setClips((prev) => prev.filter((c) => c.id !== clip.id));
    });
  }

  function preview(url: string | undefined) {
    if (!url) return;
    const audio = new Audio(url);
    audio.volume = getSfxSettings().volume || 0.5;
    setTimeout(() => audio.pause(), MAX_CLIP_MS);
    void audio.play().catch(() => undefined);
  }

  return (
    <div className="space-y-5" data-testid="soundboard-settings">
      <section>
        <p className="mb-2 font-silk text-[11px] uppercase tracking-wider text-slate-400">Built-in 8-bit sounds</p>
        <div className="flex flex-wrap gap-1.5">
          {BUILTIN_CLIPS.map((clip) => (
            <button
              key={clip.key}
              type="button"
              onClick={() => playCue(clip.cue, getSfxSettings().volume || 0.5)}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10"
            >
              {clip.emoji} {clip.name}
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-2 font-silk text-[11px] uppercase tracking-wider text-slate-400">
          Server sounds ({clips.length}/{MAX_CLIPS})
        </p>
        {clips.length === 0 ? (
          <p className="text-sm text-slate-500">No custom sounds yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {clips.map((clip) => (
              <li key={clip.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5">
                <span className="text-lg" aria-hidden>
                  {clip.emoji}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{clip.name}</span>
                <button type="button" aria-label={`Preview ${clip.name}`} onClick={() => preview(urls[clip.storage_path])} className="touch-target relative rounded p-1.5 text-slate-300 hover:bg-white/10">
                  <Play className="size-4" aria-hidden />
                </button>
                <button type="button" aria-label={`Remove ${clip.name}`} disabled={pending} onClick={() => remove(clip)} className="touch-target relative rounded p-1.5 text-red-300 hover:bg-red-500/15">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {clips.length < MAX_CLIPS && (
        <form onSubmit={upload} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-sm font-semibold text-white">Upload a sound</p>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <InputField label="Name" name="name" maxLength={32} required placeholder="Done!" error={errors.name} />
            <InputField label="Emoji" name="emoji" maxLength={16} placeholder="🔊" />
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="audio/mpeg,.mp3"
            className="sr-only"
            aria-label="Sound file"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setErrors((prev) => ({ ...prev, file: "" }));
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
              <Upload className="size-4" aria-hidden /> {file ? file.name : "Choose an MP3"}
            </Button>
            <span className="text-xs text-slate-500">MP3, up to 1 MB; trimmed to {MAX_CLIP_MS / 1000}s.</span>
          </div>
          {errors.file && (
            <p role="alert" className="text-xs text-red-300">
              {errors.file}
            </p>
          )}
          <Button type="submit" loading={uploading}>
            Upload
          </Button>
        </form>
      )}
    </div>
  );
}
