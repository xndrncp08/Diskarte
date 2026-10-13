"use client";

import { Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { Button } from "@/components/ui/Button";
import { isGlyphCode } from "@/lib/glyphs";
import type { Tables } from "@/lib/supabase/database.types";
import { sniffMatches } from "@/lib/uploads";

export const MAX_EMOJI = 50;
export const MAX_EMOJI_BYTES = 256 * 1024;
const TYPES = { "image/png": "png", "image/gif": "gif", "image/webp": "webp" } as const;

/** "Party Parrot!.gif" → "party_parrot". */
export function emojiNameFrom(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

/** Why this name/file can't be an emoji, or null. */
export async function emojiProblem(name: string, file: File, taken: string[]): Promise<string | null> {
  if (!/^[a-z0-9_]{2,32}$/.test(name)) return "Names are 2–32 lowercase letters, numbers or underscores.";
  if (isGlyphCode(`:${name}:`)) return `:${name}: is a built-in icon. Pick another name.`;
  if (taken.includes(name)) return `There's already a :${name}: here.`;
  if (!(file.type in TYPES)) return "Use a PNG, GIF or WEBP image.";
  if (file.size > MAX_EMOJI_BYTES) return "Emoji can be up to 256 KB.";
  if (!sniffMatches(file.type as keyof typeof TYPES, new Uint8Array(await file.slice(0, 16).arrayBuffer()))) return "That file doesn't look like a real image.";
  return null;
}

/** Admins: upload and remove the server's custom emoji (used as :name: in messages and reactions). */
export function EmojiSettings() {
  const supabase = useSupabase();
  const { server, emojis } = useServer();
  const [rows, setRows] = useState<Tables<"server_emojis">[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("server_emojis").select("*").eq("server_id", server.id).order("created_at");
    setRows(data ?? []);
  }, [supabase, server.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return setProblem("Choose an image.");
    const why = await emojiProblem(name, file, rows.map((r) => r.name));
    if (why) return setProblem(why);
    setBusy(true);
    const path = `${server.id}/${crypto.randomUUID()}.${TYPES[file.type as keyof typeof TYPES]}`;
    const stored = await supabase.storage.from("emoji").upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
    const saved = stored.error ? stored : await supabase.from("server_emojis").insert({ server_id: server.id, name, path });
    setBusy(false);
    if (saved.error) {
      if (!stored.error) await supabase.storage.from("emoji").remove([path]);
      return void toast.error(saved.error.message.includes("TOO_MANY_EMOJI") ? `A server can have ${MAX_EMOJI} emoji.` : "Couldn't add the emoji.");
    }
    toast.success(`Added :${name}:`);
    setFile(null);
    setName("");
    setProblem(null);
    if (input.current) input.current.value = "";
    void load();
  }

  async function remove(row: Tables<"server_emojis">) {
    const { error } = await supabase.from("server_emojis").delete().eq("id", row.id);
    if (error) return void toast.error("Couldn't remove it.");
    await supabase.storage.from("emoji").remove([row.path]);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  }

  return (
    <div className="space-y-5" data-testid="emoji-settings">
      <form onSubmit={upload} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="text-sm text-slate-300">
          Upload up to {MAX_EMOJI} emoji (PNG, GIF or WEBP, 256 KB max). Everyone here can use them as <span className="font-mono">:name:</span> in messages and reactions.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-xs font-semibold text-slate-300">
            Image
            <input
              ref={input}
              type="file"
              accept="image/png,image/gif,image/webp"
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null;
                setFile(next);
                if (next && !name) setName(emojiNameFrom(next.name));
              }}
              className="mt-1 block text-sm text-slate-300 file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-slate-200"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-300">
            Name
            <input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} maxLength={32} placeholder="pogi" className="mt-1 h-9 w-40 rounded-lg border border-white/10 bg-black/40 px-2 font-mono text-sm text-white" />
          </label>
          <Button type="submit" size="sm" loading={busy} disabled={rows.length >= MAX_EMOJI}>
            <Upload className="size-4" aria-hidden /> Upload Emoji
          </Button>
        </div>
        {problem && (
          <p className="text-xs text-amber-200" role="alert">
            {problem}
          </p>
        )}
      </form>
      <p className="text-xs text-slate-400">
        {rows.length} / {MAX_EMOJI} used
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="emoji-list">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- small public emoji */}
            <img src={emojis.get(r.name) ?? supabase.storage.from("emoji").getPublicUrl(r.path).data.publicUrl} alt="" className="size-7 object-contain" />
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-slate-200">:{r.name}:</span>
            <button type="button" onClick={() => void remove(r)} aria-label={`Remove :${r.name}:`} className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-red-300">
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
