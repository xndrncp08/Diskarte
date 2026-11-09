"use client";

import { Clock, Hourglass, LayoutGrid, Pin, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createServerAction } from "@/actions/servers";
import { createHangoutAction, endHangoutAction, extendHangoutAction, sendDirectMessageAction } from "@/actions/social";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { useSupabase, useRuntimeConfig } from "@/components/providers/RuntimeConfig";
import { useSocial } from "@/components/providers/SocialProvider";
import { Button } from "@/components/ui/Button";
import { confirmAction } from "@/components/ui/ConfirmHost";
import { InputField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { useCall } from "@/components/voice/CallProvider";
import { useRinger } from "@/components/voice/IncomingCalls";
import { activityStatus, useFriendsActivity } from "@/hooks/useFriendsActivity";
import { HANGOUT_DURATIONS, HANGOUT_TOPICS, hangoutTimeLeft, topicLabel } from "@/lib/hangouts";
import { inviteUrl } from "@/lib/servers";
import type { HangoutTopic } from "@/lib/supabase/database.types";
import { conversationTitle, type ConversationSummary } from "@/lib/social";
import { cn } from "@/lib/utils";

/** Re-renders every `ms` so countdowns stay current. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/**
 * One-click spontaneous get-together: pick friends (who's online first), what it's for and how
 * long, and optionally drop straight into voice — everyone picked gets a ring.
 */
export function StartHangoutDialog({ open, onClose, preselect = [] }: { open: boolean; onClose: () => void; preselect?: string[] }) {
  return (
    <Modal open={open} onClose={onClose} title="Start a Hangout" description="A temporary space for right now. It disappears when the time is up unless you keep it.">
      {open && <StartHangoutForm preselect={preselect} onDone={onClose} />}
    </Modal>
  );
}

function StartHangoutForm({ preselect, onDone }: { preselect: string[]; onDone: () => void }) {
  const router = useRouter();
  const { friends, profiles, reloadConversations } = useSocial();
  const activity = useFriendsActivity();
  const call = useCall();
  const ringer = useRinger();
  const [picked, setPicked] = useState<string[]>(preselect);
  const [topic, setTopic] = useState<HangoutTopic>("hangout");
  const [hours, setHours] = useState<number>(3);
  const [name, setName] = useState("");
  const [voice, setVoice] = useState(true);
  const [pending, startTransition] = useTransition();
  const online = (id: string) => activityStatus(activity?.get(id)) !== "offline";
  const people = (friends ?? [])
    .filter((f) => f.status === "accepted")
    .flatMap((f) => profiles.get(f.userId) ?? [])
    .sort((a, b) => Number(online(b.id)) - Number(online(a.id)) || a.display_name.localeCompare(b.display_name));

  if (friends && people.length === 0) return <p className="text-sm text-slate-400">Add a friend first. Hangouts are for people you know.</p>;

  function start() {
    startTransition(async () => {
      const result = await createHangoutAction({ userIds: picked, name, topic, hours });
      if (!result.ok || !result.data) return void toast.error(result.error ?? "Couldn't start the hangout.");
      const id = result.data.conversationId;
      await reloadConversations();
      onDone();
      router.push(`/tambayan/dm/${id}`);
      if (voice) {
        const others = picked.flatMap((p) => profiles.get(p) ?? []);
        const title = name.trim() || conversationTitle({ kind: "group", name: null, others });
        void call.join({ kind: "dm", serverId: "", serverName: "Hangout", channelId: id, channelName: title });
        void ringer?.ringDm(id);
      }
    });
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-1.5 font-silk text-[11px] uppercase tracking-wider text-slate-300">What&apos;s the plan?</legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {HANGOUT_TOPICS.map((t) => (
            <label key={t.id} className={cn("flex min-h-11 cursor-pointer flex-col rounded-lg border px-2.5 py-1.5 text-left transition-colors", topic === t.id ? "border-sun/60 bg-sun/10 text-white" : "border-white/10 text-slate-300 hover:bg-white/5")}>
              <input type="radio" name="hangout-topic" value={t.id} checked={topic === t.id} onChange={() => setTopic(t.id)} className="sr-only" />
              <span className="text-sm font-semibold">{t.label}</span>
              <span className="text-[11px] text-slate-400">{t.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 font-silk text-[11px] uppercase tracking-wider text-slate-300">
          Who&apos;s coming ({picked.length}/9)
        </legend>
        <ul className="scrollbar-thin max-h-56 space-y-1 overflow-y-auto">
          {friends === null ? (
            <li className="h-10 animate-pulse rounded-lg bg-white/5" />
          ) : (
            people.map((p) => {
              const checked = picked.includes(p.id);
              const status = activityStatus(activity?.get(p.id));
              return (
                <li key={p.id}>
                  <label className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5", checked && "bg-sun/10")}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && picked.length >= 9}
                      onChange={() => setPicked((prev) => (checked ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
                      className="size-4 accent-[#FFB800]"
                    />
                    <UserAvatar profile={p} size={28} status={status} />
                    <span className="truncate text-sm text-slate-200">{p.display_name}</span>
                    <span className="ml-auto shrink-0 text-xs text-slate-500">{status === "offline" ? "Offline" : status === "dnd" ? "Busy" : "Around"}</span>
                  </label>
                </li>
              );
            })
          )}
        </ul>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <InputField label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder={topicLabel(topic)} />
        <label className="block">
          <span className="mb-1.5 block font-silk text-[11px] uppercase tracking-wider text-slate-300">Lasts</span>
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="h-11 w-full rounded-lg border border-white/10 bg-abyss px-3 text-sm text-white">
            {HANGOUT_DURATIONS.map((h) => (
              <option key={h} value={h}>
                {h} hour{h === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Switch checked={voice} onChange={setVoice} label="Jump into voice" hint="Join the call now and ring everyone you picked." />
      <Button onClick={start} loading={pending} disabled={picked.length < 1} className="w-full">
        <Sparkles className="size-4" aria-hidden /> Start hangout
      </Button>
    </div>
  );
}

const TEMPLATE: Record<HangoutTopic, string> = { hangout: "friends", gaming: "gaming", study: "study", project: "team", watch: "friends", create: "creator" };

/**
 * Shown at the top of a live hangout: what it's for, the countdown, and the ways out — extend it,
 * keep it as a group conversation, turn it into a Tambayan (host), or end it for everyone (host).
 */
export function HangoutBar({ conversation, title, isHost }: { conversation: Pick<ConversationSummary, "id"> & { hangoutUntil: string; hangoutTopic: HangoutTopic | null }; title: string; isHost: boolean }) {
  const now = useNow();
  const router = useRouter();
  const supabase = useSupabase();
  const { siteUrl } = useRuntimeConfig();
  const { reloadConversations } = useSocial();
  const call = useCall();
  const [pending, startTransition] = useTransition();
  const left = hangoutTimeLeft(conversation.hangoutUntil, now);
  const soon = Date.parse(conversation.hangoutUntil) - now < 15 * 60_000;

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, done?: string) =>
    startTransition(async () => {
      const result = await work();
      if (!result.ok) return void toast.error(result.error ?? "Something went wrong.");
      if (done) toast.success(done);
      await reloadConversations();
      router.refresh();
    });

  function toTambayan() {
    run(async () => {
      const made = await createServerAction({ name: title.slice(0, 32), template: TEMPLATE[conversation.hangoutTopic ?? "hangout"] });
      if (!made.ok || !made.data) return { ok: false, error: made.error ?? "Couldn't create the Tambayan." };
      const { data } = await supabase.from("servers").select("invite_code").eq("id", made.data.serverId).maybeSingle();
      if (data?.invite_code) {
        await sendDirectMessageAction({ id: crypto.randomUUID(), conversationId: conversation.id, content: `This hangout is now a Tambayan: **${title}**. Join here: ${inviteUrl(siteUrl, data.invite_code)}`, inviteServerId: made.data.serverId });
      }
      return { ok: true };
    }, "Tambayan created. Everyone here got an invite.");
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/5 bg-sun/5 px-4 py-2 text-sm" data-testid="hangout-bar">
      <Hourglass className="size-4 shrink-0 text-sun" aria-hidden />
      <span className="font-semibold text-white">{topicLabel(conversation.hangoutTopic)}</span>
      <span className={cn("tabular-nums", soon ? "text-amber-300" : "text-slate-400")} role="timer" aria-live="off">
        {left}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1">
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => extendHangoutAction({ conversationId: conversation.id, hours: 1 }), "Added an hour.")}>
          <Clock className="size-4" aria-hidden /> +1 hour
        </Button>
        {isHost && (
          <>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => extendHangoutAction({ conversationId: conversation.id, keep: true }), "Kept. It's a group conversation now.")}>
              <Pin className="size-4" aria-hidden /> Keep
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={toTambayan}>
              <LayoutGrid className="size-4" aria-hidden /> Make it a Tambayan
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                confirmAction({
                  title: "End this hangout?",
                  body: "The conversation and its messages are deleted for everyone.",
                  confirmLabel: "End hangout",
                  onConfirm: async () => {
                    const result = await endHangoutAction({ conversationId: conversation.id });
                    if (!result.ok) {
                      toast.error(result.error ?? "Couldn't end it.");
                      return false;
                    }
                    if (call.target?.channelId === conversation.id) call.leave();
                    await reloadConversations();
                    router.replace("/tambayan");
                  },
                })
              }
            >
              <X className="size-4" aria-hidden /> End
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
