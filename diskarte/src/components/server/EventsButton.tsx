"use client";

import { CalendarDays, Check, MapPin, Plus, Star, Trash2, Volume2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Timestamp } from "@/components/chat/Timestamp";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { activeEvents, eventStatus, toLocalInput, type ServerEvent } from "@/lib/events";
import { subscribeDbChanges } from "@/lib/realtime";
import { hasRole } from "@/lib/servers";
import { cn } from "@/lib/utils";

const field = "mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm font-normal text-white outline-none focus:border-sun/70";

/** Discord's Events: the sidebar row (with a count, or LIVE) and the dialog to browse, RSVP and schedule. */
export function EventsButton() {
  const supabase = useSupabase();
  const { me } = useMe();
  const { server, channels, myRole } = useServer();
  const canSchedule = hasRole(myRole, "moderator");
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const [rsvps, setRsvps] = useState<{ event_id: string; user_id: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // Re-evaluated each minute so "LIVE" and the list follow the clock.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const [e, r] = await Promise.all([
      supabase.from("server_events").select("*").eq("server_id", server.id).order("starts_at"),
      supabase.from("event_rsvps").select("event_id, user_id").eq("server_id", server.id),
    ]);
    if (e.data) setEvents(e.data);
    if (r.data) setRsvps(r.data);
  }, [supabase, server.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; realtime keeps it current
    void load();
    return subscribeDbChanges(supabase, `server:${server.id}:events`, (channel) =>
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "server_events", filter: `server_id=eq.${server.id}` }, () => void load())
        .on("postgres_changes", { event: "*", schema: "public", table: "event_rsvps", filter: `server_id=eq.${server.id}` }, () => void load()),
    );
  }, [supabase, server.id, load]);

  const active = activeEvents(events, now);
  const live = active.some((e) => eventStatus(e, now) === "live");

  async function toggleInterest(event: ServerEvent, interested: boolean) {
    const { error } = interested
      ? await supabase.from("event_rsvps").delete().eq("event_id", event.id).eq("user_id", me.id)
      : await supabase.from("event_rsvps").insert({ event_id: event.id, server_id: server.id });
    if (error) return void toast.error("Couldn't update that.");
    void load();
  }

  async function cancel(event: ServerEvent) {
    const { error } = await supabase.from("server_events").delete().eq("id", event.id);
    if (error) return void toast.error("Couldn't cancel the event.");
    toast.success(`Cancelled ${event.name}.`);
    void load();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
      <Modal open={open} onClose={() => (setOpen(false), setCreating(false))} title={creating ? "Create an event" : `${active.length} Event${active.length === 1 ? "" : "s"}`} className="max-w-lg">
        {creating ? (
          <CreateEventForm onDone={() => (setCreating(false), void load())} />
        ) : (
          <>
            {canSchedule && (
              <Button size="sm" className="mb-3" onClick={() => setCreating(true)}>
                <Plus className="size-4" aria-hidden /> Create Event
              </Button>
            )}
            {active.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No upcoming events{canSchedule ? ". Schedule one so people know when to show up." : "."}</p>}
            <ul className="scrollbar-thin max-h-[60vh] space-y-2 overflow-y-auto" data-testid="events-list">
              {active.map((e) => {
                const status = eventStatus(e, now);
                const count = rsvps.filter((r) => r.event_id === e.id).length;
                const interested = rsvps.some((r) => r.event_id === e.id && r.user_id === me.id);
                const channel = e.channel_id ? channels.find((c) => c.id === e.channel_id) : null;
                return (
                  <li key={e.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
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
                      <Button size="sm" variant={interested ? "primary" : "secondary"} onClick={() => void toggleInterest(e, interested)} aria-pressed={interested}>
                        {interested ? <Check className="size-4" aria-hidden /> : <Star className="size-4" aria-hidden />} Interested · {count}
                      </Button>
                      {status === "live" && channel && (
                        <Link href={`/tambayan/${server.id}/${channel.id}`} onClick={() => setOpen(false)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500">
                          Join
                        </Link>
                      )}
                      {canSchedule && (
                        <button type="button" onClick={() => void cancel(e)} aria-label={`Cancel ${e.name}`} className="ml-auto rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-red-300">
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

function CreateEventForm({ onDone }: { onDone: () => void }) {
  const supabase = useSupabase();
  const { me } = useMe();
  const { server, channels } = useServer();
  const voice = channels.filter((c) => c.type === "voice");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [where, setWhere] = useState(voice[0]?.id ?? "elsewhere");
  const [location, setLocation] = useState("");
  const [starts, setStarts] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [ends, setEnds] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const startsAt = new Date(starts);
    const endsAt = ends ? new Date(ends) : null;
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now() - 60_000) return void toast.error("Pick a start time in the future.");
    if (endsAt && endsAt <= startsAt) return void toast.error("The end has to be after the start.");
    setBusy(true);
    const { error } = await supabase.from("server_events").insert({
      server_id: server.id,
      created_by: me.id,
      name: name.trim(),
      description: description.trim(),
      channel_id: where === "elsewhere" ? null : where,
      location: where === "elsewhere" ? location.trim() || null : null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt?.toISOString() ?? null,
    });
    setBusy(false);
    if (error) return void toast.error("Couldn't schedule it. Only moderators can create events.");
    toast.success(`Scheduled ${name.trim()}.`);
    onDone();
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
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Back
        </Button>
        <Button type="submit" loading={busy}>
          Create Event
        </Button>
      </div>
    </form>
  );
}
