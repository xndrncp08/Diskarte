"use client";

import { Copy, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { Button } from "@/components/ui/Button";
import { confirmAction } from "@/components/ui/ConfirmHost";
import type { Tables } from "@/lib/supabase/database.types";

type Hook = Tables<"channel_webhooks">;

const field = "mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-base font-normal text-white outline-none focus:border-sun/70";

/** Admins: secret URLs that let other services post plain messages into a text channel. */
export function WebhooksPanel() {
  const supabase = useSupabase();
  const { server, channels } = useServer();
  const textChannels = channels.filter((c) => c.type === "text");
  const [hooks, setHooks] = useState<Hook[] | null>(null);
  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState(textChannels[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  // The secret URL is only ever shown right after creating or rotating.
  const [revealed, setRevealed] = useState<{ id: string; url: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("channel_webhooks").select("id, server_id, channel_id, name, created_by, created_at, last_used_at").eq("server_id", server.id).order("created_at");
    setHooks(data ?? []);
  }, [supabase, server.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  async function save(channel: string, hookName: string, id?: string) {
    setBusy(true);
    const { data, error } = await supabase.rpc("save_channel_webhook", { p_channel: channel, p_name: hookName, ...(id ? { p_id: id } : {}) });
    setBusy(false);
    if (error) return void toast.error(error.message.includes("WEBHOOK_LIMIT") ? "A server can have up to 15 webhooks." : "Couldn't save the webhook.");
    const saved = data as { id: string; token: string };
    setRevealed({ id: saved.id, url: `${window.location.origin}/api/webhooks/${saved.id}/${saved.token}` });
    await load();
  }

  function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !channelId) return;
    void save(channelId, name.trim()).then(() => setName(""));
  }

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? "deleted-channel";

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Anything that can send an HTTP POST — a build server, a form, your own script — can post into a channel with a webhook URL. Send JSON like{" "}
        <code className="rounded bg-black/40 px-1">{'{"content": "Build passed"}'}</code> (optional <code className="rounded bg-black/40 px-1">username</code>). Up to 30 messages a minute; they can&apos;t ping @everyone.
      </p>
      <form onSubmit={create} className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block text-sm font-semibold text-white">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} required placeholder="Build bot" className={field} />
        </label>
        <label className="block text-sm font-semibold text-white">
          Channel
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className={field}>
            {textChannels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" loading={busy} disabled={!name.trim() || !channelId}>
          Create webhook
        </Button>
      </form>

      {revealed && (
        <div className="space-y-2 rounded-xl border border-sun/40 bg-sun/10 p-3" role="status">
          <p className="text-sm font-semibold text-sun">Copy this URL now — it won&apos;t be shown again. Anyone with it can post as the webhook.</p>
          <div className="flex gap-2">
            <input readOnly value={revealed.url} aria-label="Webhook URL" onFocus={(e) => e.currentTarget.select()} className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 font-mono text-xs text-white" />
            <Button
              type="button"
              variant="ghost"
              onClick={() => void navigator.clipboard?.writeText(revealed.url).then(() => toast.success("Copied."), () => toast.error("Couldn't copy — select it instead."))}
            >
              <Copy className="size-4" aria-hidden /> Copy
            </Button>
          </div>
        </div>
      )}

      {hooks === null ? (
        <div className="h-16 animate-pulse rounded-xl bg-white/5" />
      ) : hooks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">No webhooks yet.</p>
      ) : (
        <ul aria-label="Webhooks" className="divide-y divide-white/5 rounded-xl border border-white/10">
          {hooks.map((h) => (
            <li key={h.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white">{h.name}</p>
                <p className="truncate text-xs text-slate-400">
                  #{channelName(h.channel_id)} · {h.last_used_at ? `last used ${new Date(h.last_used_at).toLocaleString()}` : "never used"}
                </p>
              </div>
              <button
                type="button"
                aria-label={`New URL for ${h.name}`}
                title="New URL (the old one stops working)"
                disabled={busy}
                onClick={() => void save(h.channel_id, h.name, h.id)}
                className="flex size-10 items-center justify-center rounded-md text-slate-300 hover:bg-white/10 pointer-coarse:size-11"
              >
                <RefreshCw className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={`Delete ${h.name}`}
                onClick={() =>
                  confirmAction({
                    title: `Delete ${h.name}?`,
                    body: "Its URL stops working. Messages it already posted stay.",
                    confirmLabel: "Delete",
                    danger: true,
                    onConfirm: async () => {
                      const { error } = await supabase.from("channel_webhooks").delete().eq("id", h.id);
                      if (error) {
                        toast.error("Couldn't delete it.");
                        return false;
                      }
                      if (revealed?.id === h.id) setRevealed(null);
                      await load();
                    },
                  })
                }
                className="flex size-10 items-center justify-center rounded-md text-slate-300 hover:bg-white/10 hover:text-red-300 pointer-coarse:size-11"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
