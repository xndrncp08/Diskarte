"use client";

import { BookOpen, Columns3, Menu, Plus, Timer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { deleteWorkspaceAction, saveWorkspaceAction } from "@/actions/workspace";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { useShellUI } from "@/components/shell/ShellUI";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { confirmAction } from "@/components/ui/ConfirmHost";
import { MessageMarkdown } from "@/components/chat/MessageMarkdown";
import { subscribeDbChanges } from "@/lib/realtime";
import { hasRole } from "@/lib/servers";
import { boardSchema, focusSchema, noteSchema, workspaceLoadIssue, type BoardCard, type WorkspaceDocument } from "@/lib/workspace-documents";

const field = "min-h-11 w-full rounded-lg border border-white/15 bg-midnight px-3 text-base outline-none focus:border-sun";
const icons = { note: BookOpen, board: Columns3, focus: Timer };
const names = { note: "Shared note", board: "Task board", focus: "Focus session" };
const defaults = { note: { text: "" }, board: { cards: [] }, focus: { goal: "", minutes: 25, endsAt: null } };

export function SharedWorkspaceView() {
  const supabase = useSupabase();
  const { server, channels, myRole } = useServer();
  const { setNavOpen } = useShellUI();
  const options = channels.filter((c) => c.type !== "voice");
  const [channelId, setChannelId] = useState(options[0]?.id ?? "");
  const [documents, setDocuments] = useState<WorkspaceDocument[] | null>(null);
  const [editable, setEditable] = useState(false);
  const [problem, setProblem] = useState("");
  const [problemKind, setProblemKind] = useState<ReturnType<typeof workspaceLoadIssue>["kind"]>("connection");
  const [selected, setSelected] = useState<WorkspaceDocument | null>(null);
  const [creating, setCreating] = useState<WorkspaceDocument["kind"] | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const load = useCallback(async () => {
    if (!channelId) return;
    const token = ++generation.current;
    try {
      const [docs, permission] = await Promise.all([
        supabase.from("workspace_documents").select("*").eq("channel_id", channelId).order("updated_at", { ascending: false }).limit(50),
        supabase.rpc("can_edit_workspace", { p_channel: channelId }),
      ]);
      if (generation.current !== token) return;
      if (docs.error || permission.error) throw docs.error ?? permission.error;
      setDocuments(docs.data ?? []); setEditable(permission.data === true); setProblem("");
    } catch (error) {
      if (generation.current !== token) return;
      const issue = workspaceLoadIssue(error);
      setProblem(issue.message); setProblemKind(issue.kind); setEditable(false);
      if (issue.kind !== "connection") { setDocuments(null); setSelected(null); }
    }
  }, [channelId, supabase, setSelected]);
  useEffect(() => {
    if (!channelId) return;
    void Promise.resolve().then(load);
    const resume = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
    const off = subscribeDbChanges(supabase, `chat:${channelId}:workspace`, (c) => c.on("postgres_changes", { event: "*", schema: "public", table: "workspace_documents", filter: `channel_id=eq.${channelId}` }, () => void load()), (status) => { if (status === "SUBSCRIBED") void load(); });
    return () => { invalidate(); off(); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
  }, [channelId, load, supabase, invalidate]);
  const create = async () => {
    if (!creating || busy) return;
    setBusy(true);
    try {
      const result = await saveWorkspaceAction({ channelId, title, kind: creating, content: defaults[creating] });
      if (!result.ok || !result.data) return void toast.error(result.error ?? "Couldn’t create the item.");
      setCreating(null); setTitle(""); setSelected(result.data); await load();
    } catch { toast.error("Couldn’t create the item. Try again."); }
    finally { setBusy(false); }
  };
  return <section className="flex min-h-0 min-w-0 flex-1 flex-col">
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 px-3"><button type="button" aria-label="Open navigation" onClick={() => setNavOpen(true)} className="flex size-11 items-center justify-center md:hidden"><Menu className="size-5" /></button><Columns3 className="size-5 text-sun" aria-hidden /><h1 className="truncate font-semibold">Shared workspace</h1></header>
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <p className="text-sm text-slate-400">Plan, study and keep resources together in {server.name}. Each item follows its channel’s permissions.</p>
        <label className="block max-w-sm text-sm">Channel<select value={channelId} onChange={(e) => { setChannelId(e.target.value); setDocuments(null); setEditable(false); }} className={`${field} mt-1`}>{options.map((c) => <option value={c.id} key={c.id}>#{c.name}</option>)}</select></label>
        {editable && <div className="flex flex-wrap gap-2">{(["note", "board", "focus"] as const).map((kind) => <Button key={kind} variant="secondary" onClick={() => { setCreating(kind); setTitle(names[kind]); }}><Plus className="size-4" aria-hidden />{names[kind]}</Button>)}</div>}
        {problem && <div role="status" className="space-y-3 rounded-xl border border-amber-300/25 p-4 text-amber-200">
          <p>{problem}</p>
          {problemKind === "setup" && hasRole(myRole, "admin") && <details><summary className="cursor-pointer text-sm">Server setup instructions</summary><p className="mt-2 text-sm">Apply <code className="break-all">supabase/migrations/20261014010000_shared_workspace.sql</code> to the app’s Supabase project using its SQL Editor or the linked Supabase CLI. Then check again.</p></details>}
          {problemKind === "setup" && !hasRole(myRole, "admin") && <p className="text-sm">Ask a server administrator to enable this feature.</p>}
          {problemKind === "session" ? <a href="/login" className="inline-flex min-h-11 items-center rounded-lg bg-white/10 px-3">Sign in again</a> : <Button variant="secondary" onClick={() => void load()}>{problemKind === "setup" ? "Check setup again" : "Try again"}</Button>}
        </div>}
        {!channelId ? <p>No text channels are available.</p> : documents === null && !problem ? <p role="status">Loading workspace…</p> : documents?.length === 0 ? <p className="py-8 text-slate-400">No shared items here yet.{editable ? " Create a note, task board or focus session." : " Channel editors can add shared items."}</p> : <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Shared items">{documents?.map((doc) => { const Icon = icons[doc.kind]; return <li key={doc.id}><button type="button" onClick={() => setSelected(doc)} className="glass flex min-h-32 w-full flex-col rounded-2xl p-4 text-left hover:border-sun/40"><Icon className="mb-3 size-5 text-sun" aria-hidden /><span className="font-semibold">{doc.title}</span><span className="mt-1 text-xs text-slate-400">{names[doc.kind]} · Revision {doc.revision}</span></button></li>; })}</ul>}
      </div>
    </div>
    <Modal open={creating !== null} onClose={() => setCreating(null)} title={creating ? `Create ${names[creating].toLowerCase()}` : "Create item"}><form onSubmit={(e) => { e.preventDefault(); void create(); }} className="space-y-4"><label className="block text-sm">Name<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={100} className={`${field} mt-1`} /></label><Button type="submit" loading={busy}>Create</Button></form></Modal>
    {selected && <WorkspaceEditor key={selected.id} initial={selected} latest={documents?.find((doc) => doc.id === selected.id) ?? selected} editable={editable} onClose={() => setSelected(null)} onSaved={() => void load()} />}
  </section>;
}

function WorkspaceEditor({ initial, latest, editable, onClose, onSaved }: { initial: WorkspaceDocument; latest: WorkspaceDocument; editable: boolean; onClose: () => void; onSaved: () => void }) {
  const { me } = useMe();
  const { myRole } = useServer();
  const [doc, setDoc] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [text, setText] = useState(noteSchema.safeParse(initial.content).data?.text ?? "");
  const [cardTitle, setCardTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const saving = useRef(false);
  useEffect(() => { if (doc.kind !== "focus") return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [doc.kind]);
  const board = boardSchema.safeParse(doc.content).data ?? { cards: [] };
  const focus = focusSchema.safeParse(doc.content).data ?? { goal: "", minutes: 25, endsAt: null };
  const [goal, setGoal] = useState(focus.goal);
  const [minutes, setMinutes] = useState(focus.minutes);
  const dirty = title !== doc.title || (doc.kind === "note" && text !== (noteSchema.safeParse(doc.content).data?.text ?? "")) || (doc.kind === "focus" && (goal !== focus.goal || minutes !== focus.minutes));
  useEffect(() => {
    if (latest.revision <= doc.revision || dirty || busy) return;
    // Synchronise a clean editor with an externally updated collaborative document.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDoc(latest); setTitle(latest.title);
    setText(noteSchema.safeParse(latest.content).data?.text ?? "");
    const next = focusSchema.safeParse(latest.content).data;
    if (next) { setGoal(next.goal); setMinutes(next.minutes); }
  }, [latest, doc.revision, dirty, busy]);
  const seconds = focus.endsAt ? Math.max(0, Math.ceil((Date.parse(focus.endsAt) - now) / 1000)) : 0;
  async function save(content: unknown, timer?: "start" | "reset") {
    if (saving.current) return false;
    saving.current = true; setBusy(true); setProblem("");
    try {
      const result = await saveWorkspaceAction({ id: doc.id, revision: doc.revision, channelId: doc.channel_id, kind: doc.kind, title, content, timer });
      if (!result.ok || !result.data) { setProblem(result.error ?? "Couldn’t save."); return false; }
      setDoc(result.data); onSaved(); return true;
    } catch { setProblem("Couldn’t save. Your changes are still here."); return false; }
    finally { saving.current = false; setBusy(false); }
  }
  function remove() {
    void confirmAction({ title: `Delete ${doc.title}?`, body: "This shared item will be removed for everyone.", confirmLabel: "Delete", onConfirm: async () => {
      const result = await deleteWorkspaceAction({ id: doc.id, revision: doc.revision });
      if (!result.ok) { setProblem(result.error ?? "Couldn’t delete."); return false; }
      onSaved(); onClose();
    } });
  }
  const move = (id: string, status: BoardCard["status"]) => void save({ cards: board.cards.map((card) => card.id === id ? { ...card, status } : card) });
  return <Modal open onClose={onClose} title={doc.title} className="max-h-[90dvh] max-w-3xl overflow-y-auto">
    <div className="space-y-4">
      {editable && <label className="block text-sm">Name<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className={`${field} mt-1`} /></label>}
      {doc.kind === "note" ? editable ? <><label className="block text-sm">Note (Markdown supported)<textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} rows={12} className={`${field} mt-1 py-3`} /></label><Button loading={busy} onClick={() => void save({ text })}>Save note</Button></> : <MessageMarkdown content={text || "This note is empty."} /> : doc.kind === "board" ? <>
        <div className="grid gap-3 sm:grid-cols-3">{(["todo", "doing", "done"] as const).map((status) => <section key={status} className="rounded-xl border border-white/10 p-3"><h2 className="mb-3 text-sm font-semibold">{{ todo: "To do", doing: "In progress", done: "Done" }[status]}</h2><ul className="space-y-2">{board.cards.filter((card) => card.status === status).map((card) => <li key={card.id} className="rounded-lg bg-white/5 p-2"><p className="break-words text-sm">{card.title}</p>{editable && <div className="mt-2 space-y-2"><select aria-label={`Move ${card.title}`} value={card.status} disabled={busy} onChange={(e) => move(card.id, e.target.value as BoardCard["status"])} className={`${field} text-sm`}><option value="todo">To do</option><option value="doing">In progress</option><option value="done">Done</option></select><button type="button" disabled={busy} aria-label={`Remove ${card.title}`} onClick={() => void save({ cards: board.cards.filter((c) => c.id !== card.id) })} className="min-h-11 text-xs text-red-300">Remove task</button></div>}</li>)}</ul></section>)}</div>
        {editable && <form onSubmit={(e) => { e.preventDefault(); if (cardTitle.trim()) void save({ cards: [...board.cards, { id: crypto.randomUUID(), title: cardTitle.trim(), status: "todo" }] }).then((ok) => { if (ok) setCardTitle(""); }); }} className="flex flex-wrap gap-2"><input aria-label="New task" value={cardTitle} onChange={(e) => setCardTitle(e.target.value)} required maxLength={160} className={`${field} flex-1`} placeholder="Add a task…" /><Button type="submit" loading={busy} disabled={board.cards.length >= 200}>Add task</Button><Button variant="secondary" loading={busy} onClick={() => void save(board)}>Save board name</Button></form>}
      </> : <>
        <label className="block text-sm">Session goal<input value={goal} disabled={!editable} onChange={(e) => setGoal(e.target.value)} maxLength={200} className={`${field} mt-1`} /></label>
        <label className="block text-sm">Duration in minutes<input type="number" min={1} max={120} value={minutes} disabled={!editable} onChange={(e) => setMinutes(Number(e.target.value))} className={`${field} mt-1`} /></label>
        <p className="py-6 text-center font-mono text-5xl tabular-nums" aria-label="Time remaining">{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</p>
        <p role="status" className="text-center text-sm text-slate-400">{focus.endsAt ? seconds ? "Focus session running" : "Session complete — take a break." : "Ready when everyone is."}</p>
        {editable && <div className="flex gap-2"><Button loading={busy} onClick={() => void save({ goal, minutes }, "start")}>Start together</Button><Button variant="secondary" loading={busy} onClick={() => void save({ goal, minutes }, "reset")}>Reset</Button></div>}
      </>}
      {latest.revision > doc.revision && <div className="space-y-3 rounded-xl border border-amber-300/30 p-3"><p role="status" className="text-sm text-amber-200">Revision {latest.revision} is available. Your local edits are still here.</p><details><summary className="min-h-11 cursor-pointer text-sm">Review latest content</summary>{doc.kind === "note" ? <MessageMarkdown content={noteSchema.safeParse(latest.content).data?.text ?? "Empty note"} /> : <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(latest.content, null, 2)}</pre>}</details><Button variant="secondary" onClick={() => { setDoc(latest); setProblem(""); }}>Keep my edits against revision {latest.revision}</Button></div>}
      {problem && <p role="alert" className="text-sm text-amber-200">{problem}</p>}
      {editable && (doc.created_by === me.id || hasRole(myRole, "moderator")) && <Button variant="danger" disabled={busy} onClick={remove}><Trash2 className="size-4" aria-hidden />Delete shared item</Button>}
    </div>
  </Modal>;
}
