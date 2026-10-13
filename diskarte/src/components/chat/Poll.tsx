"use client";

import { BarChart3, Check, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { Tooltip } from "@/components/ui/Tooltip";
import { subscribeDbChanges } from "@/lib/realtime";
import { cn } from "@/lib/utils";

export const POLL_DURATIONS = [
  { hours: 1, label: "1 hour" },
  { hours: 4, label: "4 hours" },
  { hours: 8, label: "8 hours" },
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "1 week" },
] as const;

const POLL_ERRORS: Record<string, string> = {
  INVALID_POLL_OPTIONS: "Give it 2 to 10 answers (55 characters each at most).",
  INVALID_POLL_QUESTION: "Ask a question (up to 300 characters).",
  CANNOT_POST: "You can't post in this channel.",
  SLOWMODE: "Slow mode is on. Try again in a moment.",
};
const errorText = (message: string | undefined, fallback: string) => Object.entries(POLL_ERRORS).find(([k]) => message?.includes(k))?.[1] ?? fallback;

/** The composer's "Create poll" button and dialog. */
export function CreatePollButton({ channelId, disabled = false }: { channelId: string; disabled?: boolean }) {
  const supabase = useSupabase();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("create_poll", { p_channel: channelId, p_question: question, p_options: options, p_multi: multi, p_hours: hours });
    setBusy(false);
    if (error) return void toast.error(errorText(error.message, "Couldn't post the poll."));
    setOpen(false);
    setQuestion("");
    setOptions(["", ""]);
    setMulti(false);
  }

  return (
    <>
      <Tooltip label="Create poll" side="top">
        <button type="button" onClick={() => setOpen(true)} disabled={disabled} aria-label="Create poll" className="touch-target relative rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30 pointer-coarse:p-3.5">
          <BarChart3 className="size-5" aria-hidden />
        </button>
      </Tooltip>
      <Modal open={open} onClose={() => setOpen(false)} title="Create a poll" className="max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-semibold text-white">
            Question
            <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} required data-autofocus placeholder="What should we play tonight?" className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm font-normal text-white outline-none focus:border-sun/70" />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-white">Answers</legend>
            {options.map((value, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={value}
                  onChange={(e) => setOptions((o) => o.map((x, j) => (j === i ? e.target.value : x)))}
                  maxLength={55}
                  required={i < 2}
                  aria-label={`Answer ${i + 1}`}
                  placeholder={`Answer ${i + 1}`}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-sun/70"
                />
                {options.length > 2 && (
                  <button type="button" onClick={() => setOptions((o) => o.filter((_, j) => j !== i))} aria-label={`Remove answer ${i + 1}`} className="rounded-md p-2 text-slate-400 hover:bg-white/10 hover:text-red-300">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <button type="button" onClick={() => setOptions((o) => [...o, ""])} className="flex items-center gap-1 text-sm font-semibold text-sun hover:underline">
                <Plus className="size-4" aria-hidden /> Add another answer
              </button>
            )}
          </fieldset>
          <label className="block text-sm font-semibold text-white">
            Duration
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm font-normal text-white">
              {POLL_DURATIONS.map((d) => (
                <option key={d.hours} value={d.hours}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <Switch checked={multi} onChange={setMulti} label="Allow multiple answers" />
          <div className="flex justify-end">
            <Button type="submit" loading={busy}>
              Post
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

interface PollRow {
  options: string[];
  multi: boolean;
  ends_at: string;
}

/** Remaining time like Discord's "23h left", or "Poll closed". */
export function pollTimeLeft(endsAt: string, now = Date.now()) {
  const ms = Date.parse(endsAt) - now;
  if (ms <= 0) return "Poll closed";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)}d left`;
  if (h >= 1) return `${h}h left`;
  return `${Math.max(1, Math.ceil(ms / 60_000))}m left`;
}

/** A poll under its question: vote, see results (after voting or when it's closed), change your vote. */
export function PollCard({ messageId, channelId }: { messageId: string; channelId: string }) {
  const supabase = useSupabase();
  const { me } = useMe();
  const [poll, setPoll] = useState<PollRow | null>(null);
  const [votes, setVotes] = useState<{ user_id: string; option: number }[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  // Ticks so "23h left" and closing happen on time without a reload.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const [p, v] = await Promise.all([
      supabase.from("polls").select("options, multi, ends_at").eq("message_id", messageId).maybeSingle(),
      supabase.from("poll_votes").select("user_id, option").eq("message_id", messageId),
    ]);
    if (p.data) setPoll(p.data);
    if (v.data) setVotes(v.data);
  }, [supabase, messageId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; realtime keeps it current
    void load();
    // Live results: new votes arrive on the channel's chat topic.
    return subscribeDbChanges(supabase, `chat:${channelId}:poll-${messageId}`, (channel) =>
      channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "poll_votes", filter: `message_id=eq.${messageId}` }, () => void load()),
    );
  }, [supabase, channelId, messageId, load]);

  if (!poll) return <div className="mt-1 h-24 max-w-md animate-pulse rounded-xl bg-white/[0.04]" aria-hidden />;

  const closed = Date.parse(poll.ends_at) <= now;
  const mine = votes.filter((v) => v.user_id === me.id).map((v) => v.option);
  const showResults = closed || mine.length > 0;
  const voters = new Set(votes.map((v) => v.user_id)).size;
  const counts = poll.options.map((_, i) => votes.filter((v) => v.option === i).length);
  const top = Math.max(...counts);

  async function vote(options: number[]) {
    setBusy(true);
    const { error } = await supabase.rpc("vote_poll", { p_message: messageId, p_options: options });
    setBusy(false);
    if (error) return void toast.error(error.message.includes("POLL_CLOSED") ? "This poll has closed." : "Couldn't vote.");
    setPicked([]);
    void load();
  }

  return (
    <div className="mt-1.5 max-w-md rounded-xl border border-white/10 bg-black/30 p-3" data-testid="poll">
      <p className="mb-2 text-xs text-slate-400">{closed ? "Final results" : poll.multi ? "Select one or more answers" : "Select one answer"}</p>
      <div className="space-y-1.5" role="group" aria-label="Poll answers">
        {poll.options.map((label, i) => {
          const share = voters ? Math.round((counts[i] / voters) * 100) : 0;
          const chosen = showResults ? mine.includes(i) : picked.includes(i);
          return (
            <button
              key={i}
              type="button"
              disabled={busy || closed}
              aria-pressed={chosen}
              onClick={() => {
                if (showResults && !closed) return void vote(poll.multi ? (mine.includes(i) ? mine.filter((o) => o !== i) : [...mine, i]) : [i]);
                if (poll.multi) setPicked((p) => (p.includes(i) ? p.filter((o) => o !== i) : [...p, i]));
                else void vote([i]);
              }}
              className={cn(
                "relative flex w-full items-center gap-2 overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                chosen ? "border-sun/70 text-white" : "border-white/10 text-slate-200 hover:border-white/25",
              )}
            >
              {showResults && <span className={cn("absolute inset-y-0 left-0", counts[i] === top && top > 0 ? "bg-sun/25" : "bg-white/10")} style={{ width: `${share}%` }} aria-hidden />}
              <span className="relative min-w-0 flex-1 truncate">{label}</span>
              {chosen && <Check className="relative size-4 shrink-0 text-sun" aria-hidden />}
              {showResults && (
                <span className="relative shrink-0 text-xs tabular-nums text-slate-300">
                  {counts[i]} · {share}%
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span>
          {voters} vote{voters === 1 ? "" : "s"} · {pollTimeLeft(poll.ends_at, now)}
        </span>
        {!closed && poll.multi && !showResults && picked.length > 0 && (
          <Button size="sm" onClick={() => void vote(picked)} loading={busy}>
            Vote
          </Button>
        )}
        {!closed && mine.length > 0 && (
          <button type="button" onClick={() => void vote([])} className="font-semibold text-slate-300 hover:text-white hover:underline">
            Remove vote
          </button>
        )}
      </div>
    </div>
  );
}
