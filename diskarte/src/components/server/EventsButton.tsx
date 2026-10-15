"use client";

import { CalendarDays, Check, Download, MapPin, Pencil, Plus, Star, Trash2, Volume2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Timestamp } from "@/components/chat/Timestamp";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { confirmAction } from "@/components/ui/ConfirmHost";
import { activeEvents, downloadEventCalendar, eventStatus, toLocalInput, weeklyEventDates, type ServerEvent } from "@/lib/events";
import { subscribeDbChanges } from "@/lib/realtime";
import { hasRole } from "@/lib/servers";
import { cn } from "@/lib/utils";

const field = "mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-base font-normal text-white outline-none focus:border-sun/70";

/** Discord's Events: the sidebar row (with a count, or LIVE) and the dialog to browse, RSVP and schedule. */
export function EventsButton() {
  const supabase = useSupabase();
  const { me } = useMe();
  const { server, channels, myRole } = useServer();
  const canSchedule = hasRole(myRole, "moderator");
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const [rsvps, setRsvps] = useState<{ event_id: string; user_id: string }[]>([]);
  const [open, setOpen] = useState(false);
  const eventTarget = useSearchParams().get("event");
  useEffect(() => {
    if (!eventTarget) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a notification deep link opens the existing event dialog
    setOpen(true);
  }, [eventTarget]);
  useEffect(() => {
    if (!open || !eventTarget) return;
    const frame = requestAnimationFrame(() => document.getElementById(`event-${eventTarget}`)?.scrollIntoView({ block: "nearest" }));
    return () => cancelAnimationFrame(frame);
  }, [open, eventTarget, events]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ServerEvent | null>(null);
  const [problem, setProblem] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string[]>([]);
  const pendingIds = useRef(new Set<string>());
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  // Re-evaluated each minute so "LIVE" and the list follow the clock.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const token = ++generation.current;
    try {
      const summary = await supabase.rpc("list_server_events", { p_server: server.id });
      if (token !== generation.current) return;
      if (!summary.error && summary.data) {
        setEvents(summary.data); setRsvps(summary.data.filter((event) => event.interested).map((event) => ({ event_id: event.id, user_id: me.id }))); setProblem(""); return;
      }
      if (summary.error && !["PGRST202", "42883"].includes(summary.error.code)) throw summary.error;
      const [e, r] = await Promise.all([
        supabase.from("server_events").select("*").eq("server_id", server.id).order("starts_at"),
        supabase.from("event_rsvps").select("event_id, user_id").eq("server_id", server.id),
      ]);
      if (token !== generation.current) return;
      if (e.error || r.error) throw e.error ?? r.error;
      setEvents(e.data ?? []); setRsvps(r.data ?? []); setProblem("");
    } catch {
      if (token === generation.current) { setEvents([]); setRsvps([]); setProblem("Couldn’t load events. Check your connection and channel access, then retry."); }
    } finally { if (token === generation.current) setLoading(false); }
  }, [supabase, server.id, me.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; realtime keeps it current
    void load();
    const off = subscribeDbChanges(supabase, `server:${server.id}:events`, (channel) =>
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "server_events", filter: `server_id=eq.${server.id}` }, () => void load())
        .on("postgres_changes", { event: "*", schema: "public", table: "event_rsvps", filter: `server_id=eq.${server.id}` }, () => void load()),
      (status) => { if (status === "SUBSCRIBED") void load(); },
    );
    const resume = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
    return () => { invalidate(); off(); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
  }, [supabase, server.id, load, invalidate]);

  useEffect(() => {
    if (!open) return;
    // RLS-protected DELETE payloads omit server_id, so the filtered subscription can miss them.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void load();
    }, 10_000);
    return () => clearInterval(timer);
  }, [open, load]);

  const active = activeEvents(events, now);
  const live = active.some((e) => eventStatus(e, now) === "live");

  async function toggleInterest(event: ServerEvent, interested: boolean) {
    if (pendingIds.current.has(event.id)) return;
    pendingIds.current.add(event.id); setPending([...pendingIds.current]);
    try {
      const { error } = interested
        ? await supabase.from("event_rsvps").delete().eq("event_id", event.id).eq("user_id", me.id)
        : await supabase.from("event_rsvps").insert({ event_id: event.id, server_id: server.id });
      if (error && !(error.code === "23505" && !interested)) throw error;
      await load();
    } catch (error) {
      const full = error && typeof error === "object" && "message" in error && String(error.message).includes("EVENT_FULL");
      toast.error(full ? "This event just filled up. Try another date." : "Couldn’t update your interest. Try again.");
      if (full) await load();
    }
    finally { pendingIds.current.delete(event.id); setPending([...pendingIds.current]); }
  }

  function cancel(event: ServerEvent) {
    confirmAction({ title: `Cancel ${event.name}?`, body: "This removes the event and everyone’s RSVPs.", confirmLabel: "Cancel event", onConfirm: async () => {
      try {
        const { data, error } = await supabase.from("server_events").delete().eq("id", event.id).select("id").maybeSingle();
        if (error || !data) throw error ?? new Error("Not found");
        toast.success(`Cancelled ${event.name}.`); await load();
      } catch { toast.error("Couldn’t cancel the event. Check your permissions and retry."); return false; }
    } });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); void load(); }}
        className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white pointer-coarse:min-h-11"
        data-testid="events-button"
      >
        <CalendarDays className="size-4" aria-hidden />
        <span className="flex-1 text-left">Events</span>
        {live ? (
          <span className="rounded bg-emerald-500 px-1.5 text-[10px] font-bold text-white">LIVE</span>
        ) : (
          active.length > 0 && <span className="rounded-full bg-white/10 px-1.5 text-xs tabular-nums">{active.length}</span>
        )}
      </button>
      <Modal open={open} onClose={() => { setOpen(false); setCreating(false); setEditing(null); }} title={editing ? "Edit event" : creating ? "Create an event" : `${active.length} Event${active.length === 1 ? "" : "s"}`} className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        {creating || editing ? (
          <EventForm key={editing?.id ?? "new"} initial={editing} onDone={() => { setCreating(false); setEditing(null); void load(); }} />
        ) : (
          <>
            {canSchedule && (
              <Button size="sm" className="mb-3" onClick={() => setCreating(true)}>
                <Plus className="size-4" aria-hidden /> Create Event
              </Button>
            )}
            {loading && <p role="status" className="py-4 text-sm text-slate-400">Loading events…</p>}
            {problem && <div role="alert" className="space-y-2 py-4 text-sm text-amber-200"><p>{problem}</p><Button variant="secondary" onClick={() => void load()}>Retry events</Button></div>}
            {!loading && !problem && active.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No upcoming events{canSchedule ? ". Schedule one so people know when to show up." : "."}</p>}
            <ul className="scrollbar-thin max-h-[60vh] space-y-2 overflow-y-auto" data-testid="events-list">
              {active.map((e) => {
                const status = eventStatus(e, now);
                const count = e.rsvp_count ?? rsvps.filter((r) => r.event_id === e.id).length;
                const full = e.capacity != null && count >= e.capacity;
                const interested = rsvps.some((r) => r.event_id === e.id && r.user_id === me.id);
                const channel = e.channel_id ? channels.find((c) => c.id === e.channel_id) : null;
                return (
                  <li key={e.id} id={`event-${e.id}`} className={cn("rounded-xl border bg-white/[0.03] p-3", eventTarget === e.id ? "border-sun/60" : "border-white/10")}>
                    <p className={cn("text-xs font-semibold", status === "live" ? "text-emerald-300" : "text-slate-400")}>
                      {status === "live" ? "Happening now" : <Timestamp iso={e.starts_at} />}
                    </p>
                    <p className="mt-0.5 text-base font-bold text-white">{e.name}</p>
                    {e.description && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-300">{e.description}</p>}
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
                      {channel ? <Volume2 className="size-3.5" aria-hidden /> : <MapPin className="size-3.5" aria-hidden />}
                      {channel?.name ?? e.location ?? "Somewhere"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button size="sm" loading={pending.includes(e.id)} disabled={full && !interested} variant={interested ? "primary" : "secondary"} onClick={() => void toggleInterest(e, interested)} aria-pressed={interested}>
                        {interested ? <Check className="size-4" aria-hidden /> : <Star className="size-4" aria-hidden />} {full && !interested ? "Full" : "Interested"} · {count}{e.capacity != null ? ` / ${e.capacity}` : ""}
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={`Add ${e.name} to calendar`} onClick={() => { try { downloadEventCalendar(e, channel?.name); } catch { toast.error("Couldn’t export the event."); } }}><Download className="size-4" aria-hidden />Calendar</Button>
                      {status === "live" && channel && (
                        <Link href={`/tambayan/${server.id}/${channel.id}`} onClick={() => setOpen(false)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500">
                          Join
                        </Link>
                      )}
                      {canSchedule && <button type="button" onClick={() => setEditing(e)} aria-label={`Edit ${e.name}`} className="ml-auto flex size-11 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"><Pencil className="size-4" aria-hidden /></button>}
                      {canSchedule && (
                        <button type="button" onClick={() => cancel(e)} aria-label={`Cancel ${e.name}`} className="flex size-11 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-red-300">
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Modal>
    </>
  );
}

function EventForm({ initial, onDone }: { initial: ServerEvent | null; onDone: () => void }) {
  const supabase = useSupabase();
  const { me } = useMe();
  const { server, channels } = useServer();
  const voice = channels.filter((c) => c.type === "voice");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [where, setWhere] = useState(initial ? initial.channel_id ?? "elsewhere" : voice[0]?.id ?? "elsewhere");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [starts, setStarts] = useState(() => toLocalInput(new Date(initial?.starts_at ?? Date.now() + 60 * 60 * 1000)));
  const [ends, setEnds] = useState(() => initial?.ends_at ? toLocalInput(new Date(initial.ends_at)) : "");
  const [capacity, setCapacity] = useState(initial?.capacity?.toString() ?? "");
  const [repeat, setRepeat] = useState(1);
  const batchIds = useRef<string[]>([]);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [problem, setProblem] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    const startsAt = new Date(starts);
    const endsAt = ends ? new Date(ends) : null;
    if (!name.trim()) return void setProblem("Enter an event topic.");
    if (Number.isNaN(startsAt.getTime()) || (!initial && startsAt.getTime() < Date.now() - 60_000)) return void setProblem("Pick a valid start time in the future.");
    if (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt)) return void setProblem("The end has to be after the start.");
    const capacityValue = capacity ? Number(capacity) : null;
    if (capacityValue !== null && (!Number.isInteger(capacityValue) || capacityValue < 1 || capacityValue > 10000)) return void setProblem("Attendance limits must be between 1 and 10,000.");
    saving.current = true; setBusy(true); setProblem("");
    const values = {
      ...(capacityValue !== null || initial?.capacity != null ? { capacity: capacityValue } : {}),
      name: name.trim(),
      description: description.trim(),
      channel_id: where === "elsewhere" ? null : where,
      location: where === "elsewhere" ? location.trim() || null : null,
      starts_at: initial && starts === toLocalInput(new Date(initial.starts_at)) ? initial.starts_at : startsAt.toISOString(),
      ends_at: initial?.ends_at && ends === toLocalInput(new Date(initial.ends_at)) ? initial.ends_at : endsAt?.toISOString() ?? null,
    };
    try {
      if (initial) {
        let update = supabase.from("server_events").update(values).eq("id", initial.id);
        // Compare the editable fields so a stale form cannot overwrite another moderator’s changes.
        for (const key of ["name", "description", "channel_id", "location", "starts_at", "ends_at"] as const) update = initial[key] === null ? update.is(key, null) : update.eq(key, initial[key]!);
        if (initial.capacity !== undefined) update = initial.capacity === null ? update.is("capacity", null) : update.eq("capacity", initial.capacity);
        const { data, error } = await update.select("id").maybeSingle();
        if (error) throw error;
        if (!data) { setProblem("This event changed or you no longer have access. Your edits are preserved; go back and reopen the event to review it."); return; }
      } else {
        const dates = weeklyEventDates(startsAt, endsAt, repeat);
        while (batchIds.current.length < repeat) batchIds.current.push(crypto.randomUUID());
        const batch = dates.map((date, index) => ({ ...values, ...date, id: batchIds.current[index], server_id: server.id, created_by: me.id }));
        const { error } = await supabase.from("server_events").insert(batch);
        if (error?.code === "23505") {
          const existing = await supabase.from("server_events").select("*").in("id", batch.map((row) => row.id));
          if (existing.error || existing.data?.length !== batch.length || !batch.every((row) => existing.data.some((event) => event.id === row.id && Object.entries(row).every(([key, value]) => event[key as keyof ServerEvent] === value)))) throw error;
        } else if (error) throw error;
      }
      toast.success(`${initial ? "Updated" : "Scheduled"} ${name.trim()}.`); onDone();
    } catch { setProblem("Couldn’t save the event. Your edits are preserved. Check your connection and moderator permissions, then retry."); }
    finally { saving.current = false; setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm font-semibold text-white">
        Event topic
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} data-autofocus placeholder="Game night" className={field} />
      </label>
      <label className="block text-sm font-semibold text-white">
        Where
        <select value={where} onChange={(e) => setWhere(e.target.value)} className={field}>
          {voice.map((c) => (
            <option key={c.id} value={c.id}>
              🔊 {c.name}
            </option>
          ))}
          <option value="elsewhere">Somewhere else</option>
        </select>
      </label>
      {where === "elsewhere" && (
        <label className="block text-sm font-semibold text-white">
          Location
          <input value={location} onChange={(e) => setLocation(e.target.value)} required maxLength={100} placeholder="SM North, Valorant lobby, a link…" className={field} />
        </label>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-white">
          Starts
          <input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} required className={field} />
        </label>
        <label className="block text-sm font-semibold text-white">
          Ends (optional)
          <input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} className={field} />
        </label>
      </div>
      <label className="block text-sm font-semibold text-white">
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} className={cn(field, "h-auto py-2")} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-white">Attendance limit (optional)<input type="number" min={1} max={10000} step={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Unlimited" className={field} /></label>
        {!initial && <label className="block text-sm font-semibold text-white">Repeat<select value={repeat} onChange={(e) => setRepeat(Number(e.target.value))} className={field}><option value={1}>One event</option>{[4, 8, 12].map((count) => <option key={count} value={count}>Weekly · {count} occurrences</option>)}</select></label>}
      </div>
      {!initial && repeat > 1 && <p className="text-xs text-slate-400">Creates {repeat} separate weekly events in your device’s time zone. Edit or cancel individual occurrences afterward.</p>}
      {problem && <p role="alert" className="text-sm text-amber-200">{problem}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Back
        </Button>
        <Button type="submit" loading={busy}>
          {initial ? "Save event" : "Create Event"}
        </Button>
      </div>
    </form>
  );
}
