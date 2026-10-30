"use client";

import { AlertTriangle, CalendarClock, Clock, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useOptionalSupabase } from "@/components/providers/RuntimeConfig";
import { Modal } from "@/components/ui/Modal";
import { Tooltip } from "@/components/ui/Tooltip";

/** Fired after scheduling, cancelling or publishing, so lists and the publisher reload. */
export const SCHEDULED_CHANGED = "diskarte:scheduled-changed";
const changed = () => window.dispatchEvent(new Event(SCHEDULED_CHANGED));

type Scheduled = { id: string; content: string; send_at: string; failed_reason: string | null };

/** A Date as a `datetime-local` value in the device's time zone. */
function toLocalInput(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function quickPicks(now: Date) {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return [
    { label: "In 30 minutes", at: new Date(now.getTime() + 30 * 60_000) },
    { label: "In 1 hour", at: new Date(now.getTime() + 60 * 60_000) },
    { label: "Tomorrow, 9:00 AM", at: tomorrow },
  ];
}

const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Composer button: pick a time (up to 30 days ahead) and the current text goes out then. */
export function ScheduleButton({ channelId, content, disabled, onScheduled }: { channelId: string; content: string; disabled: boolean; onScheduled: () => void }) {
  const supabase = useOptionalSupabase();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date(0));
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function schedule(at: Date) {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.from("scheduled_messages").insert({ channel_id: channelId, content, send_at: at.toISOString() });
    setBusy(false);
    // The database rejects past times and channels you can't post in.
    if (error) return void toast.error(error.message.includes("SCHEDULED_LIMIT") ? "You can have up to 25 scheduled messages." : "Couldn't schedule that — pick a future time.");
    setOpen(false);
    onScheduled();
    changed();
    toast.success(`Scheduled for ${when(at.toISOString())}.`);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (value) void schedule(new Date(value));
  }

  return (
    <>
      <Tooltip label="Schedule message" side="top">
        <button
          type="button"
          disabled={disabled || !supabase}
          aria-label="Schedule message"
          onClick={() => {
            const at = new Date();
            setNow(at);
            setValue(toLocalInput(new Date(at.getTime() + 60 * 60_000)));
            setOpen(true);
          }}
          className="touch-target relative rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30 pointer-coarse:p-3.5"
        >
          <CalendarClock className="size-5" aria-hidden />
        </button>
      </Tooltip>
      <Modal open={open} onClose={() => setOpen(false)} title="Schedule message" description="It posts as you at that time, as long as you can still send messages here." className="max-w-md">
        <blockquote className="mb-4 line-clamp-3 rounded-lg border-l-2 border-sun/60 bg-black/30 px-3 py-2 text-sm text-slate-200">{content}</blockquote>
        <div className="mb-4 grid gap-2" role="group" aria-label="Quick times">
          {quickPicks(now).map((pick) => (
            <button key={pick.label} type="button" disabled={busy} onClick={() => void schedule(pick.at)} className="min-h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-left text-sm font-semibold text-white hover:bg-white/10">
              {pick.label}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm font-semibold text-white">
            Custom time
            <input
              type="datetime-local"
              required
              value={value}
              min={toLocalInput(now)}
              max={toLocalInput(new Date(now.getTime() + 30 * 86_400_000))}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-base font-normal text-white outline-none focus:border-sun/70"
            />
          </label>
          <button type="submit" disabled={busy || !value} className="min-h-11 w-full rounded-lg bg-sun font-semibold text-[#0b1020] disabled:opacity-50">
            Schedule
          </button>
        </form>
      </Modal>
    </>
  );
}

function useMyScheduled(channelId: string) {
  const supabase = useOptionalSupabase();
  const [items, setItems] = useState<Scheduled[]>([]);
  const load = useCallback(async () => {
    if (!supabase) return;
    // A missing table (migration not applied yet) just means nothing is scheduled.
    const { data } = await supabase.from("scheduled_messages").select("id, content, send_at, failed_reason").eq("channel_id", channelId).order("send_at");
    setItems(data ?? []);
  }, [supabase, channelId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the network, then sets state.
    void load();
    window.addEventListener(SCHEDULED_CHANGED, load);
    return () => window.removeEventListener(SCHEDULED_CHANGED, load);
  }, [load]);
  return { items, load };
}

/** "N scheduled" above the composer: my pending messages in this channel, with cancel. */
export function ScheduledBar({ channelId }: { channelId: string }) {
  const supabase = useOptionalSupabase();
  const { items } = useMyScheduled(channelId);
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const failed = items.filter((i) => i.failed_reason).length;

  async function cancel(id: string) {
    const { error } = await supabase!.from("scheduled_messages").delete().eq("id", id);
    if (error) return void toast.error("Couldn't cancel it.");
    changed();
  }

  return (
    <div className="mx-2 mb-1 rounded-xl border border-white/10 bg-black/30 text-sm" data-testid="scheduled-bar">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-h-9 w-full items-center gap-2 px-3 text-left text-slate-300 hover:text-white">
        <Clock className="size-4 text-sun" aria-hidden />
        {items.length} scheduled {items.length === 1 ? "message" : "messages"}
        {failed > 0 && <span className="text-red-300">· {failed} couldn&apos;t send</span>}
      </button>
      {open && (
        <ul className="max-h-48 overflow-y-auto border-t border-white/10" aria-label="Scheduled messages">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2 border-t border-white/5 px-3 py-2 first:border-t-0">
              <div className="min-w-0 flex-1">
                <p className={item.failed_reason ? "flex items-center gap-1 text-xs text-red-300" : "text-xs text-slate-400"}>
                  {item.failed_reason && <AlertTriangle className="size-3" aria-hidden />}
                  {item.failed_reason ? `Couldn't send (${item.failed_reason.replace(/_/g, " ").toLowerCase()})` : when(item.send_at)}
                </p>
                <p className="truncate text-slate-100">{item.content}</p>
              </div>
              <button type="button" onClick={() => void cancel(item.id)} aria-label={item.failed_reason ? "Delete scheduled message" : "Cancel scheduled message"} className="flex size-9 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-red-300 pointer-coarse:size-11">
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** While the app is open, publishes my due scheduled messages on time (the platform job covers closed apps). */
export function ScheduledPublisher() {
  const supabase = useOptionalSupabase();
  useEffect(() => {
    if (!supabase) return;
    let timer: number | undefined;
    let live = true;
    let lastRun = 0;
    async function plan() {
      window.clearTimeout(timer);
      const { data } = await supabase!.from("scheduled_messages").select("send_at").is("failed_reason", null).order("send_at").limit(1);
      const next = data?.[0];
      if (!live || !next) return;
      // Never more than one publish every 15 s, even if a row stays due (e.g. locked by the platform job);
      // setTimeout overflows past ~24.8 days, so re-plan at least daily.
      const due = Math.max(new Date(next.send_at).getTime() + 500, lastRun + 15_000);
      timer = window.setTimeout(async () => {
        lastRun = Date.now();
        const { error } = await supabase!.rpc("publish_scheduled_messages");
        if (!error) changed();
        else timer = window.setTimeout(() => void plan(), 60_000);
      }, Math.min(Math.max(0, due - Date.now()), 86_400_000));
    }
    void plan();
    const onChange = () => void plan();
    window.addEventListener(SCHEDULED_CHANGED, onChange);
    window.addEventListener("online", onChange);
    return () => {
      live = false;
      window.clearTimeout(timer);
      window.removeEventListener(SCHEDULED_CHANGED, onChange);
      window.removeEventListener("online", onChange);
    };
  }, [supabase]);
  return null;
}
