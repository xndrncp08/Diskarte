"use client";

import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { Button } from "@/components/ui/Button";
import { confirmAction } from "@/components/ui/ConfirmHost";
import { Switch } from "@/components/ui/Switch";
import type { Tables } from "@/lib/supabase/database.types";

type Announcement = Tables<"server_announcements">;

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const field = "mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-base font-normal text-white outline-none focus:border-sun/70";

/** "Every Monday at 9:00 AM" from a stored schedule. */
export function describeSchedule(weekday: number | null, atTime: string) {
  const [h, m] = atTime.split(":").map(Number);
  const time = new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `Every ${weekday === null ? "day" : DAYS[weekday]} at ${time}`;
}

/** Admins: messages Diskarte posts on a schedule (deterministic automation, run by the platform job). */
export function AnnouncementsPanel() {
  const supabase = useSupabase();
  const { server, channels } = useServer();
  const text = channels.filter((c) => c.type === "text");
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [channelId, setChannelId] = useState(text[0]?.id ?? "");
  const [content, setContent] = useState("");
  const [repeat, setRepeat] = useState("daily");
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("server_announcements").select("*").eq("server_id", server.id).order("created_at");
    setItems(data ?? []);
  }, [supabase, server.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("server_announcements").insert({
      server_id: server.id,
      channel_id: channelId,
      content: content.trim(),
      weekday: repeat === "daily" ? null : Number(repeat),
      at_time: time,
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setBusy(false);
    if (error) return void toast.error(error.message.includes("ANNOUNCEMENT_LIMIT") ? "A server can have up to 10 announcements." : "Couldn't save the announcement.");
    setContent("");
    await load();
  }

  async function toggle(a: Announcement, enabled: boolean) {
    const { error } = await supabase.from("server_announcements").update({ enabled }).eq("id", a.id);
    if (error) return void toast.error("Couldn't update it.");
    await load();
  }

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? "deleted-channel";

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Diskarte posts these for you on a schedule — a weekly game night reminder, a daily check-in. Times use your time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
      </p>
      <form onSubmit={create} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <label className="block text-sm font-semibold text-white">
          Message
          <textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} rows={2} required placeholder="Game night mamaya, 9 PM sa #tambayan-1!" className={`${field} py-2`} />
        </label>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block text-sm font-semibold text-white">
            Channel
            <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className={field}>
              {text.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-white">
            Repeat
            <select value={repeat} onChange={(e) => setRepeat(e.target.value)} className={field}>
              <option value="daily">Every day</option>
              {DAYS.map((d, i) => (
                <option key={d} value={String(i)}>
                  Every {d}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-white">
            Time
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className={field} />
          </label>
        </div>
        <Button type="submit" loading={busy} disabled={!content.trim() || !channelId}>
          Add announcement
        </Button>
      </form>

      {items === null ? (
        <div className="h-16 animate-pulse rounded-xl bg-white/5" />
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">No scheduled announcements yet.</p>
      ) : (
        <ul aria-label="Announcements" className="divide-y divide-white/5 rounded-xl border border-white/10">
          {items.map((a) => (
            <li key={a.id} className="space-y-1 px-3 py-2">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 truncate text-sm text-white">{a.content}</p>
                <button
                  type="button"
                  aria-label="Delete announcement"
                  onClick={() =>
                    confirmAction({
                      title: "Delete this announcement?",
                      confirmLabel: "Delete",
                      danger: true,
                      onConfirm: async () => {
                        const { error } = await supabase.from("server_announcements").delete().eq("id", a.id);
                        if (error) {
                          toast.error("Couldn't delete it.");
                          return false;
                        }
                        await load();
                      },
                    })
                  }
                  className="flex size-9 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-red-300 pointer-coarse:size-11"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
              <p className="text-xs text-slate-400">
                #{channelName(a.channel_id)} · {describeSchedule(a.weekday, a.at_time)} ({a.time_zone})
                {a.enabled && ` · next ${new Date(a.next_run_at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}`}
              </p>
              {a.last_error && <p className="text-xs text-red-300">Last run failed: {a.last_error.replace(/_/g, " ").toLowerCase()}</p>}
              <Switch checked={a.enabled} onChange={(on) => void toggle(a, on)} label="On" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
