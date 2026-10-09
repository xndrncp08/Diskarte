"use client";

import { AudioLines, Mic, MicOff, MonitorUp, PhoneCall, Radio, Video } from "lucide-react";
import { useMemo } from "react";
import { UserAvatar } from "@/components/profile/UserAvatar";
import type { AdminSnapshot } from "@/lib/admin";
import { formatDuration } from "./format";
import { SectionLabel } from "./primitives";

/** Live LiveKit stages across the network: every room and who's connected, mic state and call length. */
export function VoiceTab({ snapshot, now }: { snapshot: AdminSnapshot; now: number }) {
  const { voice } = snapshot;
  const people = useMemo(() => new Map(snapshot.users.map((u) => [u.id, u])), [snapshot.users]);
  const participants = voice.rooms.reduce((n, r) => n + r.participants.length, 0);
  const live = voice.rooms.reduce((n, r) => n + r.participants.filter((p) => p.micLive).length, 0);

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel className="flex items-center gap-1.5">
          <Radio className="size-3.5" aria-hidden /> LiveKit stages
        </SectionLabel>
        <p className="flex items-center gap-3 text-xs tabular-nums text-slate-400">
          <span>{voice.rooms.length} rooms</span>
          <span>{participants} connected</span>
          <span className="flex items-center gap-1 text-signal-green">
            <AudioLines className="size-3.5" aria-hidden />
            {live} live mics
          </span>
        </p>
      </div>
      {!voice.configured ? (
        <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-400">LiveKit isn&apos;t configured on this server.</p>
      ) : voice.error ? (
        <p className="rounded-xl border border-signal-dnd/30 bg-signal-dnd/10 px-3 py-3 text-sm text-red-200" role="alert">
          Couldn&apos;t reach LiveKit: {voice.error}
        </p>
      ) : voice.rooms.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-400">No one is on a voice stage right now.</p>
      ) : (
        <ul className="space-y-2">
          {voice.rooms.map((room) => (
            <li key={room.room} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3" data-testid="voice-room">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                {room.kind === "dm" ? <PhoneCall className="size-4 text-neon" aria-hidden /> : <Radio className="size-4 text-neon" aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{room.label}</span>
                <span className="text-xs tabular-nums text-slate-400">{room.participants.length}</span>
              </p>
              <ul className="space-y-1">
                {room.participants.map((p) => {
                  const u = people.get(p.identity);
                  return (
                    <li key={p.identity} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1">
                      {u ? <UserAvatar profile={u} size={24} /> : <span className="size-6 rounded-full bg-white/10" aria-hidden />}
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{u?.display_name ?? p.name}</span>
                      <span className="flex items-center gap-1.5 text-slate-400">
                        {p.micLive ? <Mic className="size-3.5 text-signal-green" aria-label="Mic live" /> : <MicOff className="size-3.5" aria-label="Muted" />}
                        {p.camera && <Video className="size-3.5" aria-label="Camera on" />}
                        {p.screen && <MonitorUp className="size-3.5" aria-label="Sharing screen" />}
                      </span>
                      <span className="w-14 text-right font-mono text-[11px] tabular-nums text-slate-400">{formatDuration(p.joinedAt, now)}</span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
