"use client";

import type { RemoteParticipant } from "livekit-client";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useEffect, useReducer, useState } from "react";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/utils";
import { loadLivekit, useCall } from "./CallProvider";

function percent(v: number) {
  return Math.round(v * 100);
}

function Slider({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      step={5}
      value={percent(value)}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value) / 100)}
      aria-label={label}
      aria-valuetext={`${percent(value)}%`}
      className="h-2 w-full cursor-pointer accent-sun disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

/** Lists audio devices of one kind; labels appear once the browser has granted the mic. */
function useDevices(kind: MediaDeviceKind) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.enumerateDevices) return;
    let cancelled = false;
    const load = () =>
      media
        .enumerateDevices()
        .then((all) => !cancelled && setDevices(all.filter((d) => d.kind === kind && d.deviceId)))
        .catch(() => undefined);
    void load();
    media.addEventListener?.("devicechange", load);
    return () => {
      cancelled = true;
      media.removeEventListener?.("devicechange", load);
    };
  }, [kind]);
  return devices;
}

/** Re-renders when people join or leave the room. */
function useRemoteParticipants() {
  const call = useCall();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const room = call.room;
    if (!room) return;
    let off = () => undefined as void;
    void loadLivekit().then((lk) => {
      room.on(lk.RoomEvent.ParticipantConnected, bump).on(lk.RoomEvent.ParticipantDisconnected, bump);
      off = () => void room.off?.(lk.RoomEvent.ParticipantConnected, bump)?.off?.(lk.RoomEvent.ParticipantDisconnected, bump);
    });
    return () => off();
  }, [call.room]);
  return call.room ? Array.from(call.room.remoteParticipants.values()) : [];
}

/** The mixer window's body, loaded on first open. */
export function MixerPanel() {
  const call = useCall();
  const people = useRemoteParticipants();
  const inputs = useDevices("audioinput");
  const outputs = useDevices("audiooutput");
  const canPickOutput = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
  const [activeInput, setActiveInput] = useState<string | undefined>(() => call.room?.getActiveDevice?.("audioinput"));
  const [activeOutput, setActiveOutput] = useState<string | undefined>(() => call.room?.getActiveDevice?.("audiooutput"));

  if (call.status === "idle" || !call.room) {
    return (
      <div className="py-6 text-center">
        <p className="font-pixel text-[9px] text-sun">NO ACTIVE CALL</p>
        <p className="mt-2 text-sm text-slate-400">Join a voice channel or start a DM call to mix its audio.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="mixer-output" className="space-y-3">
        <h3 id="mixer-output" className="font-silk text-[11px] uppercase tracking-wider text-slate-400">
          Output
        </h3>
        <div className="flex items-center gap-3">
          {call.deafened ? <VolumeX className="size-4 shrink-0 text-red-400" aria-hidden /> : <Volume2 className="size-4 shrink-0 text-slate-300" aria-hidden />}
          <Slider label="Call volume" value={call.mix.master} onChange={call.setMasterVolume} disabled={call.deafened} />
          <span className="w-10 shrink-0 text-right font-mono text-xs text-slate-300">{percent(call.mix.master)}%</span>
        </div>
        {call.deafened && <p className="text-xs text-red-300">You&apos;re deafened — undeafen to hear the call.</p>}
        {canPickOutput && outputs.length > 1 && (
          <DeviceSelect
            label="Speakers"
            devices={outputs}
            value={activeOutput}
            onChange={(id) => {
              setActiveOutput(id);
              void call.switchDevice("audiooutput", id);
            }}
          />
        )}
      </section>

      <section aria-labelledby="mixer-input" className="space-y-3">
        <h3 id="mixer-input" className="font-silk text-[11px] uppercase tracking-wider text-slate-400">
          Input
        </h3>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-white">Microphone</span>
          <button
            type="button"
            onClick={() => void call.toggleMute()}
            aria-pressed={call.muted}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors pointer-coarse:h-11",
              call.muted ? "bg-red-500/20 text-red-200 hover:bg-red-500/30" : "bg-white/10 text-slate-100 hover:bg-white/20",
            )}
          >
            {call.muted ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
            {call.muted ? "Unmute" : "Mute"}
          </button>
        </div>
        {inputs.length > 1 && (
          <DeviceSelect
            label="Microphone device"
            devices={inputs}
            value={activeInput}
            onChange={(id) => {
              setActiveInput(id);
              void call.switchDevice("audioinput", id);
            }}
          />
        )}
        <Switch checked={call.noiseSuppression} onChange={() => void call.toggleNoiseSuppression()} label="Noise suppression" hint="Filters fans, keyboards and jeepney horns." />
      </section>

      <section aria-labelledby="mixer-people" className="space-y-2">
        <h3 id="mixer-people" className="font-silk text-[11px] uppercase tracking-wider text-slate-400">
          People — {people.length}
        </h3>
        {people.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-sm text-slate-400">Nobody else is here yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {people.map((p) => (
              <PersonRow key={p.identity} participant={p} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PersonRow({ participant }: { participant: RemoteParticipant }) {
  const call = useCall();
  const name = participant.name || participant.identity;
  const volume = call.mix.people[participant.identity] ?? 1;
  const speaking = call.speaking.includes(participant.identity);
  const silenced = volume === 0;
  return (
    <li className="rounded-xl bg-white/[0.04] px-3 py-2" data-testid="mixer-person">
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={cn("size-2 shrink-0 rounded-full", speaking ? "bg-signal-green shadow-[0_0_6px] shadow-signal-green" : "bg-slate-600")}
          aria-label={speaking ? "Speaking" : undefined}
          role={speaking ? "img" : undefined}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{name}</span>
        <span className="font-mono text-xs text-slate-400">{percent(volume)}%</span>
        <button
          type="button"
          onClick={() => call.setParticipantVolume(participant.identity, silenced ? 1 : 0)}
          aria-pressed={silenced}
          aria-label={`Mute ${name} for me`}
          className={cn(
            "flex size-7 items-center justify-center rounded-md transition-colors pointer-coarse:size-11",
            silenced ? "bg-red-500/20 text-red-300" : "text-slate-400 hover:bg-white/10 hover:text-white",
          )}
        >
          {silenced ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
        </button>
      </div>
      <Slider label={`Volume for ${name}`} value={volume} onChange={(v) => call.setParticipantVolume(participant.identity, v)} />
    </li>
  );
}

function DeviceSelect({ label, devices, value, onChange }: { label: string; devices: MediaDeviceInfo[]; value?: string; onChange: (id: string) => void }) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <select
        value={value ?? devices[0]?.deviceId}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/40 px-2 text-sm text-slate-100 outline-none focus:border-sun/70 pointer-coarse:h-11"
      >
        {devices.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}
