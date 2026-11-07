"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { Button } from "@/components/ui/Button";
import { confirmAction } from "@/components/ui/ConfirmHost";
import { RELEASES } from "@/lib/releases";
import { SectionLabel } from "./primitives";

type Status = { release_id: string; published_at: string; withdrawn_at: string | null; message_id: string | null };

/** Official release posts: which releases are announced, and retry / withdraw / republish. */
export function ReleaseAnnouncements() {
  const supabase = useSupabase();
  const [status, setStatus] = useState<Map<string, Status> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("release_announcements").select("release_id, published_at, withdrawn_at, message_id");
    setStatus(error ? new Map() : new Map((data ?? []).map((r) => [r.release_id, r as Status])));
  }, [supabase]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of external state
  useEffect(() => { void load(); }, [load]);

  const run = async (id: string, action: "publish" | "withdraw" | "reset") => {
    setBusy(id);
    const res = await fetch("/api/admin/releases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { result?: string; error?: string } | null;
    setBusy(null);
    if (!res?.ok) toast.error(body?.error ?? "Couldn't reach the server.");
    else toast.success(body?.result === "published" ? "Posted to #announcements." : body?.result === "withdrawn" ? "Post withdrawn." : `Not posted: ${body?.result}.`);
    void load();
    return res?.ok ?? false;
  };
  const act = (id: string, action: "publish" | "withdraw" | "reset") =>
    action === "publish"
      ? void run(id, action)
      : confirmAction({
          title: action === "withdraw" ? "Withdraw this update post?" : "Republish with the current notes?",
          body: action === "withdraw" ? "The post is removed from #announcements and won't be published again automatically." : "The current post is removed and the notes in releases.json are posted again.",
          confirmLabel: action === "withdraw" ? "Withdraw" : "Republish",
          danger: action === "withdraw",
          onConfirm: () => run(id, action),
        });

  return (
    <section aria-labelledby="release-posts" className="mt-8 space-y-3">
      <SectionLabel id="release-posts">Release announcements</SectionLabel>
      <p className="text-xs text-slate-400">Posted automatically to #announcements when a production deployment starts (RELEASE_ANNOUNCEMENTS=on). Notes come from src/content/releases.json.</p>
      <ul className="space-y-2">
        {RELEASES.slice(0, 5).map((r) => {
          const s = status?.get(r.id);
          const label = !status ? "Checking…" : !s ? "Not posted" : s.withdrawn_at ? "Withdrawn" : "Posted";
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 p-3 text-sm">
              <span className="min-w-0 flex-1"><span className="font-semibold text-white">{r.title}</span> <span className="text-slate-400">· {r.date} · {label}</span></span>
              {!s && <Button size="sm" variant="secondary" loading={busy === r.id} onClick={() => act(r.id, "publish")}>Publish now</Button>}
              {s && !s.withdrawn_at && <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => act(r.id, "withdraw")}>Withdraw</Button>}
              {s && <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => act(r.id, "reset")}>Republish</Button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
