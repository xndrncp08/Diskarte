"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from "react";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { confirmAction } from "@/components/ui/ConfirmHost";
import { subscribeDbChanges } from "@/lib/realtime";
import { resourceSchema, resourcesSchema, STROKE_COLORS, whiteboardSchema, type Stroke } from "@/lib/workspace-assets";
import type { Json, Tables } from "@/lib/supabase/database.types";

const field = "min-h-11 w-full rounded-lg border border-white/15 bg-midnight px-3 text-base";
type Kind = Tables<"workspace_assets">["kind"];
type EditorProps = { content: Json; change: Dispatch<SetStateAction<Json>>; editable: boolean };

export function WorkspaceAsset({ channelId, kind, editable, onClose }: { channelId: string; kind: Kind; editable: boolean; onClose: () => void }) {
  const supabase = useSupabase();
  const [content, setContent] = useState<Json>(kind === "resources" ? { items: [] } : { strokes: [] });
  const [revision, setRevision] = useState(0), [ready, setReady] = useState(false), [problem, setProblem] = useState(""), [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Tables<"workspace_assets"> | null>(null);
  const changes = useRef(0), baseline = useRef(0), currentRevision = useRef(0), saving = useRef(false), generation = useRef(0);
  const change: Dispatch<SetStateAction<Json>> = (next) => { changes.current++; setContent(next); };
  const invalidate = useCallback(() => { generation.current++; }, []);
  const load = useCallback(async () => {
    if (saving.current) return;
    const token = ++generation.current;
    try {
      const [asset, channel] = await Promise.all([
        supabase.from("workspace_assets").select("*").eq("channel_id", channelId).eq("kind", kind).maybeSingle(),
        supabase.from("channels").select("id").eq("id", channelId).maybeSingle(),
      ]);
      if (token !== generation.current) return;
      if (asset.error || channel.error) throw asset.error ?? channel.error;
      if (!channel.data) { setReady(false); setContent({}); baseline.current = changes.current; setConflict(null); setProblem("This channel is no longer available to you."); return; }
      const data = asset.data;
      if (data && data.revision > currentRevision.current) {
        if (changes.current !== baseline.current) setConflict(data);
        else { setContent(data.content); setRevision(data.revision); currentRevision.current = data.revision; setConflict(null); }
      }
      setReady(true); setProblem("");
    } catch { if (token === generation.current) setProblem("Couldn’t sync this shared item. Check your connection, channel access and the workspace-assets database migration."); }
  }, [supabase, channelId, kind]);

  useEffect(() => {
    void Promise.resolve().then(load);
    const off = subscribeDbChanges(supabase, `chat:${channelId}:asset:${kind}`, (channel) => channel.on("postgres_changes", { event: "*", schema: "public", table: "workspace_assets", filter: `channel_id=eq.${channelId}` }, () => void load()), (status) => { if (status === "SUBSCRIBED") void load(); });
    const resume = () => { if (document.visibilityState === "visible" && navigator.onLine) void load(); };
    window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
    const timer = setInterval(resume, 15_000);
    return () => { invalidate(); off(); clearInterval(timer); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
  }, [channelId, kind, supabase, load, invalidate]);

  const save = async () => {
    if (saving.current) return;
    const parsed = (kind === "resources" ? resourcesSchema : whiteboardSchema).safeParse(content);
    if (!parsed.success) return setProblem("Check the content and size limits before saving.");
    saving.current = true; setBusy(true); setProblem(""); const version = changes.current, token = ++generation.current;
    try {
      const { data, error } = await supabase.rpc("save_workspace_asset", { p_channel: channelId, p_kind: kind, p_content: parsed.data, p_revision: revision });
      if (token !== generation.current) return;
      if (error?.code === "40001") { saving.current = false; await load(); setProblem("Someone changed this item. Review the latest version before saving your edits."); return; }
      if (error || !data?.[0]) throw error;
      setRevision(data[0].revision); currentRevision.current = data[0].revision; baseline.current = version; setConflict(null);
    } catch { if (token === generation.current) setProblem("Couldn’t save. Your local edits are preserved. Check your connection and channel permissions, then retry."); }
    finally { saving.current = false; setBusy(false); }
  };
  const close = () => {
    if (changes.current === baseline.current) return onClose();
    confirmAction({ title: "Discard unsaved changes?", body: "Your shared changes have not been saved.", confirmLabel: "Discard", onConfirm: onClose });
  };
  return <Modal open title={kind === "resources" ? "Shared resources" : "Collaborative whiteboard"} onClose={close} className="max-h-[90dvh] max-w-4xl overflow-y-auto">
    <div className="space-y-4">
      {!ready && !problem && <p role="status">Loading shared content…</p>}
      {ready && (kind === "resources" ? <ResourceEditor content={content} change={change} editable={editable && !busy} /> : <Whiteboard content={content} change={change} editable={editable && !busy} />)}
      {conflict && <div className="space-y-2 rounded-xl border border-amber-300/30 p-3">
        <p role="status">Another version is available. Your local changes are preserved.</p>
        <details><summary className="min-h-11 cursor-pointer">Review the latest version</summary><pre className="max-h-60 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(conflict.content, null, 2)}</pre></details>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setRevision(conflict.revision); currentRevision.current = conflict.revision; setConflict(null); }}>Keep my version for the next save</Button><Button variant="secondary" onClick={() => { setContent(conflict.content); setRevision(conflict.revision); currentRevision.current = conflict.revision; baseline.current = changes.current; setConflict(null); }}>Use the shared version</Button></div>
      </div>}
      {problem && <div role="alert" className="space-y-2 text-sm text-amber-200"><p>{problem}</p><Button variant="secondary" onClick={() => void load()}>Retry sync</Button></div>}
      {ready && editable && <Button loading={busy} disabled={!!conflict} onClick={() => void save()}>Save {kind === "resources" ? "resources" : "whiteboard"}</Button>}
      <p className="text-xs text-slate-400">Revision {revision}. Changes are shared when saved; simultaneous edits require an explicit choice of versions.</p>
    </div>
  </Modal>;
}

function ResourceEditor({ content, change, editable }: EditorProps) {
  const items = resourcesSchema.safeParse(content).data?.items ?? [];
  const [title, setTitle] = useState(""), [url, setUrl] = useState(""), [description, setDescription] = useState(""), [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const missing = editing !== null && !items.some((r) => r.id === editing);
  return <>
    <ul className="space-y-3" aria-label="Shared resources">{items.map((item) => <li key={item.id} className="rounded-xl border border-white/10 p-3">
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="break-words font-semibold text-sun underline">{item.title}</a>
      <p className="whitespace-pre-wrap break-words text-sm text-slate-400">{item.description}</p>
      {editable && <div className="flex gap-3"><button type="button" className="min-h-11 text-sm" onClick={() => { setEditing(item.id); setTitle(item.title); setUrl(item.url); setDescription(item.description); }}>Edit {item.title}</button><button type="button" className="min-h-11 text-sm text-red-300" onClick={() => change({ items: items.filter((r) => r.id !== item.id) })}>Remove {item.title}</button></div>}
    </li>)}</ul>
    {!items.length && <p className="text-sm text-slate-400">No resources yet. Add useful links for this channel.</p>}
    {editable && <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
      event.preventDefault(); if (missing) return;
      const parsed = resourceSchema.safeParse({ id: editing ?? crypto.randomUUID(), title, url, description });
      if (!parsed.success) return setError("Use a title and a valid HTTPS link. Descriptions are limited to 300 characters.");
      change({ items: editing ? items.map((item) => item.id === editing ? parsed.data : item) : [...items, parsed.data] });
      setEditing(null); setTitle(""); setUrl(""); setDescription(""); setError("");
    }}>
      <label className="text-sm">Resource title<input className={field} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} /></label>
      <label className="text-sm">HTTPS link<input className={field} type="url" value={url} onChange={(e) => setUrl(e.target.value)} required maxLength={1000} /></label>
      <label className="text-sm sm:col-span-2">Description<input className={field} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} /></label>
      <Button type="submit" variant="secondary" disabled={missing || !editing && items.length >= 30}>{editing ? "Update resource" : "Add resource"}</Button>
      {missing && <Button variant="secondary" onClick={() => setEditing(null)}>Keep as a new resource</Button>}
      {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
    </form>}
  </>;
}

function Whiteboard({ content, change, editable }: EditorProps) {
  const strokes = whiteboardSchema.safeParse(content).data?.strokes ?? [];
  const [color, setColor] = useState<typeof STROKE_COLORS[number]>(STROKE_COLORS[0]);
  const active = useRef<string | null>(null);
  const update = (next: Stroke[] | ((previous: Stroke[]) => Stroke[])) => change((previous) => {
    const list = whiteboardSchema.safeParse(previous).data?.strokes ?? [];
    return { strokes: typeof next === "function" ? next(list) : next };
  });
  const point = (event: PointerEvent<SVGSVGElement>): [number, number] => {
    const box = event.currentTarget.getBoundingClientRect();
    return [Math.round(Math.max(0, Math.min(1200, (event.clientX - box.left) / Math.max(1, box.width) * 1200))), Math.round(Math.max(0, Math.min(800, (event.clientY - box.top) / Math.max(1, box.height) * 800)))];
  };
  const count = strokes.reduce((total, s) => total + s.points.length, 0);
  return <div className="space-y-3">
    {editable && <div className="flex flex-wrap gap-2" role="group" aria-label="Drawing tools">
      {STROKE_COLORS.map((c) => <button type="button" key={c} aria-label={`Pen ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className="size-11 rounded-full border-2" style={{ background: c, borderColor: color === c ? "#ffb800" : "transparent" }} />)}
      <Button variant="secondary" onClick={() => update(strokes.slice(0, -1))} disabled={!strokes.length}>Undo stroke</Button>
      <Button variant="secondary" onClick={() => confirmAction({ title: "Clear this drawing?", body: "Save afterward to clear it for everyone.", confirmLabel: "Clear", onConfirm: () => update([]) })} disabled={!strokes.length}>Clear drawing</Button>
    </div>}
    <svg role="img" aria-label={`Shared drawing, ${strokes.length} strokes. Use a shared note for text-based collaboration.`} viewBox="0 0 1200 800" className="w-full rounded-xl border border-slate-400 bg-white" style={{ touchAction: editable ? "none" : "auto", background: "#fff" }}
      onPointerDown={(event) => {
        if (!editable || event.button !== 0 || strokes.length >= 100 || count >= 2500) return;
        const id = crypto.randomUUID(); active.current = id; event.currentTarget.setPointerCapture?.(event.pointerId);
        const start = point(event); update((previous) => [...previous, { id, color, width: 4, points: [start] }]);
      }}
      onPointerMove={(event) => {
        if (!editable || !active.current) return;
        const next = point(event), id = active.current;
        update((previous) => previous.reduce((sum, s) => sum + s.points.length, 0) >= 2500 ? previous : previous.map((stroke) => stroke.id === id && stroke.points.length < 256 ? { ...stroke, points: [...stroke.points, next] } : stroke));
      }} onPointerUp={() => { active.current = null; }} onPointerCancel={() => { active.current = null; }}>
      {strokes.map((stroke) => stroke.points.length === 1 ? <circle key={stroke.id} cx={stroke.points[0][0]} cy={stroke.points[0][1]} r={stroke.width / 2} fill={stroke.color} /> : <polyline key={stroke.id} points={stroke.points.map((p) => p.join(",")).join(" ")} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
    <p className="text-sm text-slate-400">Draw with a mouse, stylus or finger. Use shared notes for a keyboard-accessible text alternative. {count >= 2500 || strokes.length >= 100 ? "The drawing limit is reached; undo strokes to make room." : ""}</p>
  </div>;
}
