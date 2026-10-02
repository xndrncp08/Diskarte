"use client";

import { motion } from "framer-motion";
import { Clock, Menu as MenuIcon, Plus, Radio, Users, Volume2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { closeLfgAction, createLfgAction, joinLfgAction, leaveLfgAction } from "@/actions/lfg";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { useShellUI } from "@/components/shell/ShellUI";
import { Button } from "@/components/ui/Button";
import { InputField, TextareaField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useCall } from "@/components/voice/CallProvider";
import { isBeaconLive, LFG_GAMES, minutesLeft, type LfgBeacon } from "@/lib/community";
import { subscribeDbChanges } from "@/lib/realtime";
import { hasRole } from "@/lib/servers";
import type { Tables } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type PartyRow = Tables<"lfg_party_members">;

const DURATIONS = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1 oras" },
  { value: 120, label: "2 oras" },
  { value: 240, label: "4 oras" },
];

/** Live beacons + party rosters for this tambayan (initial fetch, then Realtime). */
function useBeacons(serverId: string) {
  const supabase = useSupabase();
  const [beacons, setBeacons] = useState<LfgBeacon[] | null>(null);
  const [party, setParty] = useState<PartyRow[]>([]);

  const load = useCallback(async () => {
    const since = new Date().toISOString();
    const { data } = await supabase.from("lfg_beacons").select("*").eq("server_id", serverId).neq("status", "closed").gt("expires_at", since).order("created_at", { ascending: false }).limit(50);
    const rows = data ?? [];
    const { data: members } = rows.length ? await supabase.from("lfg_party_members").select("*").in("beacon_id", rows.map((b) => b.id)) : { data: [] as PartyRow[] };
    setBeacons(rows);
    setParty(members ?? []);
  }, [supabase, serverId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
    return subscribeDbChanges(supabase, `lfg:${serverId}`, (channel) =>
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "lfg_beacons", filter: `server_id=eq.${serverId}` }, ({ eventType, new: row }) => {
          const beacon = row as LfgBeacon;
          if (eventType === "INSERT") setBeacons((prev) => (prev && !prev.some((b) => b.id === beacon.id) ? [beacon, ...prev] : prev));
          if (eventType === "UPDATE") setBeacons((prev) => prev?.map((b) => (b.id === beacon.id ? beacon : b)) ?? prev);
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "lfg_party_members", filter: `server_id=eq.${serverId}` }, ({ new: row }) => {
          const member = row as PartyRow;
          setParty((prev) => (prev.some((p) => p.beacon_id === member.beacon_id && p.user_id === member.user_id) ? prev : [...prev, member]));
        })
        // DELETE payloads only carry the primary key (beacon_id, user_id).
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "lfg_party_members" }, ({ old }) => {
          const key = old as Partial<PartyRow>;
          setParty((prev) => prev.filter((p) => !(p.beacon_id === key.beacon_id && p.user_id === key.user_id)));
        }),
    );
  }, [supabase, serverId, load]);

  return { beacons, party, setParty, reload: load };
}

/** Tick every 30 s so countdowns and expiries stay current. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function LfgBoard() {
  const { server, channels, members, myRole } = useServer();
  const { me } = useMe();
  const { setNavOpen } = useShellUI();
  const call = useCall();
  const router = useRouter();
  const { beacons, party, setParty, reload } = useBeacons(server.id);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const now = useNow();
  const profiles = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const voiceChannels = channels.filter((c) => c.type === "voice");
  const live = (beacons ?? []).filter((b) => isBeaconLive(b, now));

  function joinParty(beacon: LfgBeacon) {
    startTransition(async () => {
      const result = await joinLfgAction({ beaconId: beacon.id });
      if (!result.ok) return void toast.error(result.error ?? "Hindi naka-join.");
      setParty((prev) => (prev.some((p) => p.beacon_id === beacon.id && p.user_id === me.id) ? prev : [...prev, { beacon_id: beacon.id, server_id: server.id, user_id: me.id, joined_at: new Date().toISOString() }]));
      const voice = channels.find((c) => c.id === result.data?.voiceChannelId);
      toast.success(`Nasa party ka na para sa ${beacon.game}! 🎮`);
      if (voice) {
        void call.join({ serverId: server.id, serverName: server.name, channelId: voice.id, channelName: voice.name });
        router.push(`/tambayan/${server.id}/${voice.id}`);
      }
    });
  }

  function leaveParty(beacon: LfgBeacon) {
    startTransition(async () => {
      const result = await leaveLfgAction({ beaconId: beacon.id });
      if (!result.ok) return void toast.error(result.error ?? "May mali.");
      setParty((prev) => prev.filter((p) => !(p.beacon_id === beacon.id && p.user_id === me.id)));
      void reload();
    });
  }

  function close(beacon: LfgBeacon) {
    startTransition(async () => {
      const result = await closeLfgAction({ beaconId: beacon.id });
      if (!result.ok) return void toast.error(result.error ?? "Hindi naisara.");
      void reload();
    });
  }

  return (
    <motion.section className="flex min-w-0 flex-1 flex-col" aria-label="LFG Board" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 bg-black/20 px-3 backdrop-blur-md">
        <button type="button" onClick={() => setNavOpen(true)} aria-label="Open navigation" className="touch-target relative rounded-md p-1.5 text-slate-300 hover:bg-white/10 md:hidden">
          <MenuIcon className="size-5" aria-hidden />
        </button>
        <Radio className="size-5 shrink-0 text-sun" aria-hidden />
        <h1 className="truncate font-bold text-white" data-testid="channel-title">
          LFG Board
        </h1>
        <p className="hidden truncate text-sm text-slate-400 sm:block">Maghanap ng ka-squad — 1 click lang para sumali.</p>
        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)} data-testid="new-beacon">
          <Plus className="size-4" aria-hidden /> Beacon
        </Button>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
        {beacons === null ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-white/5" />
            ))}
          </div>
        ) : live.length === 0 ? (
          <div className="mx-auto mt-16 max-w-sm text-center">
            <p className="font-pixel text-[10px] text-sun">NO SIGNAL</p>
            <p className="mt-3 text-lg font-bold text-white">Walang naka-LFG ngayon.</p>
            <p className="mt-1 text-sm text-slate-400">Magpa-beacon at hintayin ang tropa!</p>
            <Button className="mt-5" onClick={() => setCreating(true)}>
              <Radio className="size-4" aria-hidden /> Magpa-beacon
            </Button>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2" aria-label="LFG beacons">
            {live.map((beacon) => {
              const roster = party.filter((p) => p.beacon_id === beacon.id);
              const inParty = roster.some((p) => p.user_id === me.id);
              const author = profiles.get(beacon.author_id);
              const voice = channels.find((c) => c.id === beacon.voice_channel_id);
              const full = beacon.status === "full" || roster.length >= beacon.party_size;
              const canClose = beacon.author_id === me.id || hasRole(myRole, "moderator");
              return (
                <li key={beacon.id} className={cn("glass relative overflow-hidden rounded-2xl p-4", !full && "border-sun/30")} data-testid="lfg-beacon">
                  {!full && <span className="absolute right-3 top-3 size-2.5 animate-ping rounded-full bg-sun" aria-hidden />}
                  <p className="font-pixel text-[9px] text-sun">{full ? "PARTY FULL" : "LOOKING FOR GROUP"}</p>
                  <h2 className="mt-2 text-lg font-extrabold text-white">{beacon.game}</h2>
                  {beacon.description && <p className="mt-1 text-sm text-slate-300">{beacon.description}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span>ni {author ? (author.nickname ?? author.profile.display_name) : "someone"}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3.5" aria-hidden /> {minutesLeft(beacon.expires_at, now)} min pa
                    </span>
                    {voice && (
                      <span className="flex items-center gap-1">
                        <Volume2 className="size-3.5" aria-hidden /> {voice.name}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex -space-x-2" role="img" aria-label={`${roster.length} of ${beacon.party_size} in party`}>
                      {roster.map((p) => {
                        const m = profiles.get(p.user_id);
                        return m ? <UserAvatar key={p.user_id} profile={m.profile} size={28} ring="#0b1020" /> : null;
                      })}
                      {Array.from({ length: Math.max(0, beacon.party_size - roster.length) }, (_, i) => (
                        <span key={`slot-${i}`} className="size-7 rounded-full border-2 border-dashed border-white/20 bg-black/30" aria-hidden />
                      ))}
                    </div>
                    <span className="flex items-center gap-1 text-xs font-semibold text-slate-300">
                      <Users className="size-3.5" aria-hidden />
                      {roster.length}/{beacon.party_size}
                    </span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    {inParty ? (
                      <>
                        {voice && (
                          <Button
                            size="sm"
                            onClick={() => {
                              void call.join({ serverId: server.id, serverName: server.name, channelId: voice.id, channelName: voice.name });
                              router.push(`/tambayan/${server.id}/${voice.id}`);
                            }}
                          >
                            <Volume2 className="size-4" aria-hidden /> Pumunta sa voice
                          </Button>
                        )}
                        {beacon.author_id !== me.id && (
                          <Button size="sm" variant="secondary" onClick={() => leaveParty(beacon)} disabled={pending}>
                            Umalis
                          </Button>
                        )}
                      </>
                    ) : (
                      <Button size="sm" onClick={() => joinParty(beacon)} disabled={full || pending} data-testid="join-party">
                        {full ? "Puno na" : "Join Party"}
                      </Button>
                    )}
                    {canClose && (
                      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => close(beacon)} disabled={pending}>
                        <X className="size-4" aria-hidden /> Isara
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="Magpa-LFG beacon">
        <BeaconForm
          voiceChannels={voiceChannels}
          onDone={() => {
            setCreating(false);
            void reload();
          }}
        />
      </Modal>
    </motion.section>
  );
}

function BeaconForm({ voiceChannels, onDone }: { voiceChannels: { id: string; name: string }[]; onDone: () => void }) {
  const { server } = useServer();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [size, setSize] = useState(5);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createLfgAction({
        serverId: server.id,
        game: String(form.get("game") ?? ""),
        description: String(form.get("description") ?? ""),
        partySize: size,
        durationMinutes: String(form.get("duration") ?? "60"),
        voiceChannelId: String(form.get("voice") ?? ""),
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (result.error) toast.error(result.error);
        return;
      }
      toast.success("Beacon is live! 📡");
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <InputField label="Laro" name="game" list="lfg-games" required maxLength={48} placeholder="Valorant" data-autofocus error={errors.game} />
      <datalist id="lfg-games">
        {LFG_GAMES.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <TextareaField label="Details (optional)" name="description" maxLength={200} rows={2} placeholder="Ranked, Gold+ lang. Chill lang, walang toxic." error={errors.description} />
      <div>
        <p id="party-size" className="mb-1.5 font-silk text-[11px] uppercase tracking-wider text-slate-300">
          Party size: {size}
        </p>
        <input type="range" min={2} max={10} value={size} onChange={(e) => setSize(Number(e.target.value))} aria-labelledby="party-size" className="w-full accent-[#FFB800]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="block font-silk text-[11px] uppercase tracking-wider text-slate-300">Voice channel</span>
          <select name="voice" defaultValue={voiceChannels[0]?.id ?? ""} className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-2 text-sm text-slate-100">
            <option value="">Wala</option>
            {voiceChannels.map((c) => (
              <option key={c.id} value={c.id}>
                🔊 {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="block font-silk text-[11px] uppercase tracking-wider text-slate-300">Tagal</span>
          <select name="duration" defaultValue="60" className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-2 text-sm text-slate-100">
            {DURATIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Button type="submit" loading={pending} className="w-full">
        <Radio className="size-4" aria-hidden /> I-broadcast ang beacon
      </Button>
    </form>
  );
}
