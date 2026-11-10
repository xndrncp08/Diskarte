"use client";

import { Check, ClipboardCheck, Loader2, Plus, Trash2, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { decideJoinRequestAction, requestToJoinAction, setJoinScreeningAction } from "@/actions/servers";
import { Timestamp } from "@/components/chat/Timestamp";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { Button } from "@/components/ui/Button";
import { InputField, TextareaField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { useProfileNames } from "@/hooks/useProfileNames";
import { subscribeDbChanges } from "@/lib/realtime";
import { parseInviteInput } from "@/lib/servers";
import type { Tables } from "@/lib/supabase/database.types";

/** A join that the Tambayan screens: an invite (code or link) or a server listed in Explore. */
export type JoinTarget = { invite: string } | { serverId: string };

interface Screening {
  server_id: string;
  name: string;
  rules: string | null;
  questions: string[];
  approval: boolean;
  request_status: "pending" | "approved" | "rejected" | null;
  member: boolean;
}

/**
 * Shown when joining hits SCREENING_REQUIRED: the Tambayan's rules and joining questions. Answers
 * either join you straight away or send a request moderators approve.
 */
export function JoinScreeningDialog({ target, onClose, onJoined }: { target: JoinTarget | null; onClose: () => void; onJoined: (serverId: string) => void }) {
  return (
    <Modal open={target !== null} onClose={onClose} title="Before you join" description="This Tambayan asks a few things first.">
      {target && <ScreeningForm key={JSON.stringify(target)} target={target} onClose={onClose} onJoined={onJoined} />}
    </Modal>
  );
}

function ScreeningForm({ target, onClose, onJoined }: { target: JoinTarget; onClose: () => void; onJoined: (serverId: string) => void }) {
  const supabase = useSupabase();
  const [screening, setScreening] = useState<Screening | null>(null);
  const [failed, setFailed] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const code = "invite" in target ? parseInviteInput(target.invite) : null;
  const serverId = "serverId" in target ? target.serverId : null;

  useEffect(() => {
    void supabase
      .rpc("join_screening", { p_code: code, p_server: serverId })
      .then(({ data, error }) => {
        if (error || !data) return setFailed(true);
        const next = data as unknown as Screening;
        setScreening(next);
        setAnswers(next.questions.map(() => ""));
      });
  }, [supabase, code, serverId]);

  if (failed) return <p className="text-sm text-slate-400">That invite is invalid or has expired.</p>;
  if (!screening) return <Loader2 className="mx-auto size-5 animate-spin text-slate-500" aria-label="Loading" />;
  if (screening.request_status === "pending") {
    return <p className="text-sm text-slate-300">Your request to join <strong className="text-white">{screening.name}</strong> is waiting for a moderator. You&apos;ll find it in your server list once it&apos;s approved.</p>;
  }

  function submit() {
    startTransition(async () => {
      const result = await requestToJoinAction({ ...target, answers });
      if (!result.ok || !result.data) return void toast.error(result.error ?? "Couldn't send that.");
      if (result.data.status === "joined") {
        toast.success(`Welcome to ${screening!.name}!`);
        onJoined(screening!.server_id);
      } else {
        toast.success("Request sent. A moderator will review it.");
      }
      onClose();
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-sm text-slate-300">
        <strong className="text-white">{screening.name}</strong>
        {screening.approval ? " reviews new members. A moderator will look at your answers." : " would like to know a bit about you."}
      </p>
      {screening.rules && (
        <details className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
          <summary className="cursor-pointer font-semibold text-white">Rules</summary>
          <p className="mt-2 whitespace-pre-wrap">{screening.rules}</p>
        </details>
      )}
      {screening.questions.map((question, i) => (
        <TextareaField
          key={i}
          label={question}
          required
          maxLength={500}
          rows={2}
          value={answers[i] ?? ""}
          onChange={(e) => setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
        />
      ))}
      <Button type="submit" loading={pending} disabled={answers.some((a) => !a.trim())} className="w-full">
        <UserPlus className="size-4" aria-hidden /> {screening.approval ? "Request to join" : "Join"}
      </Button>
    </form>
  );
}

/** Moderators: pending join requests with the applicant's answers. Admins also set up screening here. */
export function MembershipPanel() {
  const supabase = useSupabase();
  const { server, myRole } = useServer();
  const [requests, setRequests] = useState<Tables<"join_requests">[] | null>(null);
  const [pending, startTransition] = useTransition();
  const questions = (Array.isArray(server.join_questions) ? server.join_questions : []) as string[];

  const load = useCallback(async () => {
    const { data } = await supabase.from("join_requests").select("*").eq("server_id", server.id).eq("status", "pending").order("created_at");
    setRequests(data ?? []);
  }, [supabase, server.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; realtime keeps it current
    void load();
    return subscribeDbChanges(supabase, `join-requests:${server.id}`, (channel) =>
      channel.on("postgres_changes", { event: "*", schema: "public", table: "join_requests", filter: `server_id=eq.${server.id}` }, () => void load()),
    );
  }, [supabase, server.id, load]);

  const name = useProfileNames((requests ?? []).map((r) => r.user_id));

  function decide(userId: string, approve: boolean) {
    startTransition(async () => {
      const result = await decideJoinRequestAction({ serverId: server.id, userId, approve });
      if (!result.ok) return void toast.error(result.error ?? "Couldn't update the request.");
      toast.success(approve ? `${name(userId)} joined.` : `Declined ${name(userId)}.`);
      setRequests((prev) => prev?.filter((r) => r.user_id !== userId) ?? null);
    });
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="join-requests-title">
        <h3 id="join-requests-title" className="mb-2 text-sm font-semibold text-white">
          Join requests
        </h3>
        {requests === null ? (
          <Loader2 className="size-5 animate-spin text-slate-500" aria-label="Loading join requests" />
        ) : requests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">
            {server.join_approval ? "Nobody's waiting. New requests show up here." : "Approval is off, so people join straight away."}
          </p>
        ) : (
          <ul className="space-y-2" data-testid="join-requests">
            {requests.map((r) => (
              <li key={r.user_id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-semibold text-white">
                    {name(r.user_id)} <span className="text-xs font-normal text-slate-400">· <Timestamp iso={r.created_at} /></span>
                  </p>
                  <Button size="sm" onClick={() => decide(r.user_id, true)} disabled={pending} aria-label={`Approve ${name(r.user_id)}`}>
                    <Check className="size-4" aria-hidden /> Approve
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => decide(r.user_id, false)} disabled={pending} aria-label={`Decline ${name(r.user_id)}`}>
                    <X className="size-4" aria-hidden /> Decline
                  </Button>
                </div>
                <dl className="mt-2 space-y-1.5 text-sm">
                  {(r.answers as string[]).map((answer, i) => (
                    <div key={i}>
                      <dt className="text-xs text-slate-400">{questions[i] ?? `Question ${i + 1}`}</dt>
                      <dd className="whitespace-pre-wrap text-slate-200">{answer}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
      {myRole === "admin" && !server.is_system && <ScreeningSetup questions={questions} approval={server.join_approval ?? false} />}
    </div>
  );
}

function ScreeningSetup({ questions: initial, approval: initialApproval }: { questions: string[]; approval: boolean }) {
  const { server } = useServer();
  const [questions, setQuestions] = useState(initial);
  const [approval, setApproval] = useState(initialApproval);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await setJoinScreeningAction({ serverId: server.id, questions, approval });
      if (!result.ok) return void toast.error(result.error ?? "Couldn't save.");
      toast.success(approval || questions.some((q) => q.trim()) ? "Screening is on." : "Screening is off. Anyone with an invite joins straight away.");
    });
  }

  return (
    <section aria-labelledby="screening-title" className="space-y-3 border-t border-white/10 pt-5">
      <h3 id="screening-title" className="flex items-center gap-2 text-sm font-semibold text-white">
        <ClipboardCheck className="size-4" aria-hidden /> Membership screening
      </h3>
      <p className="text-xs text-slate-400">New members see your rules and these questions before they join. Their answers stay visible to moderators.</p>
      <Switch checked={approval} onChange={setApproval} label="Moderators approve new members" hint="Off: answering the questions is enough to join." />
      <ol className="space-y-2">
        {questions.map((q, i) => (
          <li key={i} className="flex items-end gap-2">
            <InputField
              label={`Question ${i + 1}`}
              value={q}
              maxLength={200}
              className="flex-1"
              onChange={(e) => setQuestions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              type="button"
              aria-label={`Remove question ${i + 1}`}
              onClick={() => setQuestions((prev) => prev.filter((_, j) => j !== i))}
              className="flex size-11 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-red-300"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        {questions.length < 5 && (
          <Button variant="secondary" size="sm" onClick={() => setQuestions((prev) => [...prev, ""])}>
            <Plus className="size-4" aria-hidden /> Add question
          </Button>
        )}
        <Button size="sm" onClick={save} loading={pending}>
          Save screening
        </Button>
      </div>
    </section>
  );
}

/** Pending join requests for this server (0 when approval is off), checked on load and on focus. Moderators only: RLS hides the rest. */
export function useJoinRequestCount() {
  const supabase = useSupabase();
  const { server } = useServer();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!server.join_approval) return;
    const load = () =>
      void supabase
        .from("join_requests")
        .select("user_id", { count: "exact", head: true })
        .eq("server_id", server.id)
        .eq("status", "pending")
        .then(({ count: n }) => setCount(n ?? 0));
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [supabase, server.id, server.join_approval]);
  return server.join_approval ? count : 0;
}

/** Sidebar nudge for moderators when people are waiting to be let in. */
export function JoinRequestsNotice({ onOpen }: { onOpen: () => void }) {
  const count = useJoinRequestCount();
  if (count === 0) return null;
  return (
    <button type="button" onClick={onOpen} className="mb-2 flex min-h-11 w-full items-center gap-2 rounded-lg border border-sun/30 bg-sun/10 px-2 text-left text-sm font-semibold text-sun hover:bg-sun/15">
      <UserPlus className="size-4" aria-hidden />
      {count} {count === 1 ? "person wants" : "people want"} to join
    </button>
  );
}
