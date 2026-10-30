"use client";

import { ChevronLeft, ChevronRight, ImagePlus, MoreHorizontal, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useMe } from "@/components/providers/MeProvider";
import { useOptionalSupabase } from "@/components/providers/RuntimeConfig";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import { UserAvatar, type AvatarProfile } from "@/components/profile/UserAvatar";
import { Button } from "@/components/ui/Button";
import { confirmAction } from "@/components/ui/ConfirmHost";
import { Menu } from "@/components/ui/Menu";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

export type Moment = { id: string; author_id: string; body: string | null; image_path: string | null; audience: "friends" | "favourites"; created_at: string; expires_at: string };
type Person = AvatarProfile & { id: string; username: string };

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/** "3h left" for a moment. */
export function timeLeft(expiresAt: string, now: number) {
  const minutes = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h left` : `${minutes}m left`;
}

/** Live moments from me and my friends (RLS decides who sees what), minus the people I muted. */
function useMoments() {
  const supabase = useOptionalSupabase();
  const [moments, setMoments] = useState<Moment[] | null>(null);
  const [muted, setMuted] = useState<ReadonlySet<string>>(() => new Set());
  const load = useCallback(async () => {
    if (!supabase) return;
    const [m, mutes] = await Promise.all([
      supabase.from("moments").select("id, author_id, body, image_path, audience, created_at, expires_at").order("created_at"),
      supabase.from("moment_mutes").select("target_id"),
    ]);
    // A missing table (migration not applied yet) just means no moments.
    setMoments((m.data as Moment[] | null) ?? []);
    setMuted(new Set((mutes.data ?? []).map((r) => r.target_id)));
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the network
    void load();
    const resume = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", resume);
    return () => document.removeEventListener("visibilitychange", resume);
  }, [load]);
  return { moments, muted, setMuted, reload: load };
}

/** Home's row of friends with live moments, plus "Share a moment". Optional and separate from chat. */
export function MomentsStrip() {
  const { me } = useMe();
  const social = useOptionalSocial();
  const { moments, muted, setMuted, reload } = useMoments();
  const [composing, setComposing] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  // Re-read each minute so expired moments drop out while Home stays open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const people = useMemo(() => {
    const map = new Map<string, Person>([[me.id, me]]);
    for (const [id, p] of social?.profiles ?? []) map.set(id, p);
    return map;
  }, [me, social?.profiles]);

  const live = (moments ?? []).filter((m) => (m.author_id === me.id || new Date(m.expires_at).getTime() > now) && !muted.has(m.author_id) && people.has(m.author_id));
  // Authors in order: me first, then whoever posted most recently.
  const authors = [...new Set(live.map((m) => m.author_id))].sort((a, b) => {
    if (a === me.id) return -1;
    if (b === me.id) return 1;
    const latest = (id: string) => live.filter((m) => m.author_id === id).at(-1)!.created_at;
    return latest(b).localeCompare(latest(a));
  });
  if (moments === null) return null;

  return (
    <section aria-label="Moments" className="mb-4" data-testid="moments">
      <ul className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
        <li>
          <button type="button" onClick={() => setComposing(true)} className="flex w-16 flex-col items-center gap-1 text-xs text-slate-300">
            <span className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-sun/60 text-sun">
              <Plus className="size-6" aria-hidden />
            </span>
            Share
          </button>
        </li>
        {authors.map((id) => {
          const person = people.get(id)!;
          return (
            <li key={id}>
              <button type="button" onClick={() => setViewing(id)} aria-label={`${id === me.id ? "Your" : `${person.display_name}'s`} moments`} className="flex w-16 flex-col items-center gap-1 text-xs text-slate-300">
                <span className="rounded-full p-0.5 ring-2 ring-sun">
                  <UserAvatar profile={person} size={52} />
                </span>
                <span className="w-full truncate text-center">{id === me.id ? "You" : person.display_name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {authors.length === 0 && <p className="text-sm text-slate-400">Share a photo or a quick update with your friends — it disappears after 24 hours.</p>}
      <MomentComposer open={composing} onClose={() => setComposing(false)} onShared={() => void reload()} />
      {viewing && (
        <MomentViewer
          key={viewing}
          authors={authors}
          start={viewing}
          moments={live}
          people={people}
          now={now}
          onClose={() => setViewing(null)}
          onChanged={() => void reload()}
          onMute={(id) => setMuted((prev) => new Set(prev).add(id))}
        />
      )}
    </section>
  );
}

function MomentComposer({ open, onClose, onShared }: { open: boolean; onClose: () => void; onShared: () => void }) {
  const supabase = useOptionalSupabase();
  const { me } = useMe();
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [audience, setAudience] = useState<Moment["audience"]>("friends");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function pick(next: File | undefined) {
    if (!next) return;
    if (!PHOTO_TYPES[next.type]) return void toast.error("Use a JPEG, PNG, WebP or GIF photo.");
    if (next.size > 5 * 1024 * 1024) return void toast.error("Photos can be up to 5 MB.");
    setFile(next);
  }

  async function share(event: FormEvent) {
    event.preventDefault();
    if (!supabase || (!body.trim() && !file)) return;
    setBusy(true);
    let path: string | null = null;
    if (file) {
      path = `${me.id}/${crypto.randomUUID()}.${PHOTO_TYPES[file.type]}`;
      const { error } = await supabase.storage.from("moments").upload(path, file, { contentType: file.type });
      if (error) {
        setBusy(false);
        return void toast.error("Couldn't upload the photo.");
      }
    }
    const { error } = await supabase.from("moments").insert({ body: body.trim() || null, image_path: path, audience });
    setBusy(false);
    if (error) {
      if (path) void supabase.storage.from("moments").remove([path]);
      return void toast.error(error.message.includes("MOMENT_LIMIT") ? "You can have 10 live moments at a time." : "Couldn't share that.");
    }
    setBody("");
    setFile(null);
    onClose();
    onShared();
    toast.success("Shared for 24 hours.");
  }

  return (
    <Modal open={open} onClose={onClose} title="Share a moment" description="Visible to your friends for 24 hours." className="max-w-md">
      <form onSubmit={share} className="space-y-3">
        <label className="block text-sm font-semibold text-white">
          What&apos;s up?
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={280} rows={3} placeholder="Nagluto ng adobo 🍲" className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-base font-normal text-white outline-none focus:border-sun/70" />
        </label>
        {preview ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img src={preview} alt="Photo to share" className="max-h-64 w-full rounded-lg object-cover" />
            <button type="button" onClick={() => setFile(null)} aria-label="Remove photo" className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-black/70 text-white">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 text-sm text-slate-300 hover:bg-white/5">
            <ImagePlus className="size-4" aria-hidden /> Add a photo
          </button>
        )}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        <label className="block text-sm font-semibold text-white">
          Who can see it
          <select value={audience} onChange={(e) => setAudience(e.target.value as Moment["audience"])} className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-base font-normal text-white">
            <option value="friends">All friends</option>
            <option value="favourites">Favourite friends only</option>
          </select>
        </label>
        <Button type="submit" loading={busy} disabled={!body.trim() && !file} className="w-full">
          Share
        </Button>
      </form>
    </Modal>
  );
}

function MomentViewer({
  authors,
  start,
  moments,
  people,
  now,
  onClose,
  onChanged,
  onMute,
}: {
  authors: string[];
  start: string;
  moments: Moment[];
  people: Map<string, Person>;
  now: number;
  onClose: () => void;
  onChanged: () => void;
  onMute: (id: string) => void;
}) {
  const supabase = useOptionalSupabase();
  const { me } = useMe();
  // One flat sequence across authors, starting at the chosen person's first moment.
  const sequence = useMemo(() => authors.flatMap((a) => moments.filter((m) => m.author_id === a)), [authors, moments]);
  const [index, setIndex] = useState(() => Math.max(0, sequence.findIndex((m) => m.author_id === start)));
  const [photo, setPhoto] = useState<string | null>(null);
  const moment = sequence[Math.min(index, sequence.length - 1)];
  const author = moment ? people.get(moment.author_id) : undefined;

  useEffect(() => {
    if (!supabase || !moment?.image_path) return;
    let live = true;
    void supabase.storage.from("moments").createSignedUrl(moment.image_path, 600).then(({ data }) => {
      if (live) setPhoto(data?.signedUrl ?? null);
    });
    return () => {
      live = false;
      setPhoto(null);
    };
  }, [supabase, moment?.image_path]);

  if (!moment || !author) return null;
  const mine = moment.author_id === me.id;

  async function remove() {
    const { error } = await supabase!.from("moments").delete().eq("id", moment.id);
    if (error) return void toast.error("Couldn't delete it.");
    if (moment.image_path) void supabase!.storage.from("moments").remove([moment.image_path]);
    onChanged();
    onClose();
  }

  async function mute() {
    const { error } = await supabase!.from("moment_mutes").insert({ target_id: moment.author_id });
    if (error) return void toast.error("Couldn't mute.");
    onMute(moment.author_id);
    onClose();
    toast.success(`Muted ${author!.display_name}'s moments.`);
  }

  function report() {
    confirmAction({
      title: `Report this moment from ${author!.display_name}?`,
      body: "Diskarte's team reviews reports. Say what's wrong.",
      confirmLabel: "Report",
      danger: true,
      reason: { label: "What's wrong?", maxLength: 300 },
      onConfirm: async (reason) => {
        const description = `Moment report: moment ${moment.id} by @${author!.username}. ${reason.trim() || "No details given."}`;
        const { error } = await supabase!.from("problem_reports").insert({ category: "other", description, page_url: window.location.href.slice(0, 500) });
        if (error) {
          toast.error("Couldn't send the report.");
          return false;
        }
        toast.success("Thanks — we'll take a look.");
      },
    });
  }

  return (
    <Modal open onClose={onClose} title={`${author.display_name}'s moment`} className="max-w-md">
      <div className="mb-3 flex gap-1" aria-hidden>
        {sequence.map((m, i) => (
          <span key={m.id} className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-sun" : "bg-white/15")} />
        ))}
      </div>
      <div className="mb-3 flex items-center gap-2">
        <UserAvatar profile={author} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{mine ? "You" : author.display_name}</p>
          <p className="text-xs text-slate-400">
            {new Date(moment.expires_at).getTime() > now ? timeLeft(moment.expires_at, now) : "Expired"}
            {moment.audience === "favourites" && " · Favourites"}
          </p>
        </div>
        <Menu
          label="Moment options"
          align="end"
          items={mine ? [{ label: "Delete moment", danger: true, onSelect: () => void remove() }] : [{ label: `Mute ${author.display_name}`, onSelect: () => void mute() }, { label: "Report", danger: true, onSelect: report }]}
          trigger={({ toggle, open, id }) => (
            <button type="button" onClick={toggle} aria-expanded={open} aria-controls={id} aria-haspopup="menu" aria-label="Moment options" className="flex size-11 items-center justify-center rounded-md text-slate-300 hover:bg-white/10">
              <MoreHorizontal className="size-5" aria-hidden />
            </button>
          )}
        />
      </div>
      {moment.image_path && (photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
        <img src={photo} alt={moment.body ?? `Photo from ${author.display_name}`} className="mb-3 max-h-[60dvh] w-full rounded-xl object-contain" />
      ) : (
        <div className="mb-3 h-64 animate-pulse rounded-xl bg-white/5" />
      ))}
      {moment.body && <p className="whitespace-pre-wrap text-lg text-slate-100">{moment.body}</p>}
      <div className="mt-4 flex justify-between">
        <Button variant="ghost" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
          <ChevronLeft className="size-4" aria-hidden /> Previous
        </Button>
        <Button variant="ghost" onClick={() => (index + 1 < sequence.length ? setIndex((i) => i + 1) : onClose())}>
          {index + 1 < sequence.length ? "Next" : "Done"} <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </Modal>
  );
}
