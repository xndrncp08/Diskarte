"use client";

import { Camera, Headphones, Mic } from "lucide-react";
import { useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Switch } from "@/components/ui/Switch";
import { CallContext } from "@/components/voice/CallProvider";
import { refreshMediaDevices, useMediaDevices } from "@/hooks/useMediaDevices";
import { cn } from "@/lib/utils";
import { DEFAULT_VOICE_PREFS, keyLabel, micProcessing, readVoicePrefs, setVoicePrefs, subscribeVoicePrefs, type InputProfile } from "@/lib/voice-prefs";

const SELECT = "h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-slate-100 outline-none focus:border-sun/70";
const BARS = 40;

function useVoicePrefs() {
  return useSyncExternalStore(subscribeVoicePrefs, readVoicePrefs, () => DEFAULT_VOICE_PREFS);
}

function DeviceSelect({ kind, label, icon, value, onChange }: { kind: MediaDeviceKind; label: string; icon: ReactNode; value: string | null; onChange: (id: string | null) => void }) {
  const devices = useMediaDevices(kind);
  const id = `device-${kind}`;
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-white">
        {icon}
        {label}
      </label>
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={SELECT}>
        <option value="">Default</option>
        {devices.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Discord's Mic Test: hear yourself through the chosen speaker and watch the input level. */
function MicTest() {
  const prefs = useVoicePrefs();
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!testing) return;
    let stopped = false;
    let frame = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { ...micProcessing(prefs), ...(prefs.inputId ? { deviceId: { exact: prefs.inputId } } : {}) } });
        refreshMediaDevices();
        if (stopped) return;
        ctx = new AudioContext();
        // Some browsers start it suspended after the await; the click that started the test allows resuming.
        await ctx.resume().catch(() => undefined);
        const sink = (ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
        if (prefs.outputId && sink) await sink.call(ctx, prefs.outputId).catch(() => undefined);
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        source.connect(ctx.destination); // loopback: you hear yourself
        const data = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
          setLevel(Math.min(1, peak / 64));
          frame = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setError("Couldn't use the microphone. Check that your browser can access it.");
        setTesting(false);
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      setLevel(0);
    };
  }, [testing, prefs]);

  const lit = Math.round(level * BARS);
  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setTesting((t) => !t);
          }}
          className={cn("h-10 shrink-0 rounded-lg px-4 text-sm font-bold transition-colors", testing ? "bg-red-500 text-white hover:bg-red-400" : "bg-sun text-abyss hover:brightness-110")}
        >
          {testing ? "Stop Testing" : "Mic Test"}
        </button>
        <div className="flex h-8 min-w-0 flex-1 items-center gap-[3px]" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
          {Array.from({ length: BARS }, (_, i) => (
            <span key={i} className={cn("h-full min-w-0 flex-1 rounded-sm", i < lit ? (i > BARS * 0.8 ? "bg-signal-dnd" : "bg-signal-green") : "bg-white/10")} />
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400">{error ?? (testing ? "Say something — you'll hear yourself." : "Having mic issues? Start a test and say something silly.")}</p>
    </div>
  );
}

function CameraPreview({ cameraId }: { cameraId: string | null }) {
  const [on, setOn] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    navigator.mediaDevices
      .getUserMedia({ video: cameraId ? { deviceId: { exact: cameraId } } : true })
      .then((s) => {
        stream = s;
        refreshMediaDevices();
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => {
        setError("Couldn't open the camera.");
        setOn(false);
      });
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on, cameraId]);
  return (
    <div className="space-y-2">
      <div className="flex aspect-video max-w-md items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black">
        {on ? <video ref={video} autoPlay muted playsInline className="size-full -scale-x-100 object-cover" aria-label="Camera preview" /> : <Camera className="size-8 text-slate-600" aria-hidden />}
      </div>
      <button type="button" onClick={() => setOn((v) => !v)} className="h-9 rounded-lg bg-white/10 px-3 text-sm font-semibold text-slate-100 hover:bg-white/20">
        {on ? "Stop Video" : "Test Video"}
      </button>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

const PROFILES: { id: InputProfile; label: string; hint: string }[] = [
  { id: "isolation", label: "Voice Isolation", hint: "Just your voice: noise suppression, echo cancellation and automatic gain." },
  { id: "studio", label: "Studio", hint: "Pure audio: an open mic with no processing." },
  { id: "custom", label: "Custom", hint: "Choose each one yourself." },
];

/** Settings → Voice & Video, Discord-style. Changes apply to your next call (devices also to the current one). */
export function VoiceSettings() {
  const prefs = useVoicePrefs();
  const call = useContext(CallContext);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code !== "Escape") setVoicePrefs({ pttKey: e.code });
      setRecording(false);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [recording]);

  const inCall = call && call.status !== "idle";
  return (
    <div className="max-w-2xl space-y-8" data-testid="voice-settings">
      <section className="space-y-4">
        <h3 className="text-lg font-bold text-white">Voice</h3>
        <div className="flex flex-col gap-4 sm:flex-row">
          <DeviceSelect
            kind="audioinput"
            label="Microphone"
            icon={<Mic className="size-4" aria-hidden />}
            value={prefs.inputId}
            onChange={(inputId) => {
              setVoicePrefs({ inputId });
              if (inCall && inputId) void call.switchDevice("audioinput", inputId);
            }}
          />
          <DeviceSelect
            kind="audiooutput"
            label="Speaker"
            icon={<Headphones className="size-4" aria-hidden />}
            value={prefs.outputId}
            onChange={(outputId) => {
              setVoicePrefs({ outputId });
              if (inCall && outputId) void call.switchDevice("audiooutput", outputId);
            }}
          />
        </div>
        {call && (
          <label className="block max-w-sm text-sm font-semibold text-white">
            Speaker Volume
            <input type="range" min={0} max={100} value={Math.round(call.mix.master * 100)} onChange={(e) => call.setMasterVolume(Number(e.target.value) / 100)} className="mt-2 block w-full accent-sun" />
          </label>
        )}
        <MicTest />
      </section>

      <section className="space-y-3 border-t border-white/10 pt-6">
        <h3 className="text-sm font-semibold text-white" id="input-profile">
          Input Profile
        </h3>
        <div role="radiogroup" aria-labelledby="input-profile" className="space-y-2">
          {PROFILES.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={prefs.profile === p.id}
              onClick={() => setVoicePrefs({ profile: p.id })}
              className="flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
            >
              <span className={cn("mt-0.5 size-4 shrink-0 rounded-full border-2", prefs.profile === p.id ? "border-sun bg-sun shadow-[inset_0_0_0_3px_#020617]" : "border-slate-500")} aria-hidden />
              <span>
                <span className="block text-sm font-semibold text-white">{p.label}</span>
                <span className="block text-xs text-slate-400">{p.hint}</span>
              </span>
            </button>
          ))}
        </div>
        {prefs.profile === "custom" && (
          <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
            <Switch checked={prefs.noiseSuppression} onChange={(noiseSuppression) => setVoicePrefs({ noiseSuppression })} label="Noise suppression" />
            <Switch checked={prefs.echoCancellation} onChange={(echoCancellation) => setVoicePrefs({ echoCancellation })} label="Echo cancellation" />
            <Switch checked={prefs.autoGainControl} onChange={(autoGainControl) => setVoicePrefs({ autoGainControl })} label="Automatic gain control" />
          </div>
        )}
        <Switch checked={prefs.pushToTalk} onChange={(pushToTalk) => setVoicePrefs({ pushToTalk })} label="Push to Talk" hint="Your mic is off in calls until you hold the key (not while typing in a text box)." />
        {prefs.pushToTalk && (
          <div className="flex items-center gap-3 text-sm text-slate-300">
            Shortcut
            <button type="button" onClick={() => setRecording(true)} className={cn("h-9 min-w-24 rounded-lg border px-3 font-mono", recording ? "border-sun text-sun" : "border-white/15 text-white hover:bg-white/10")}>
              {recording ? "Press a key…" : keyLabel(prefs.pttKey)}
            </button>
          </div>
        )}
        <p className="text-xs text-slate-500">Profile and push-to-talk changes apply from your next call.</p>
      </section>

      <section className="space-y-4 border-t border-white/10 pt-6">
        <h3 className="text-lg font-bold text-white">Camera</h3>
        <DeviceSelect kind="videoinput" label="Camera" icon={<Camera className="size-4" aria-hidden />} value={prefs.cameraId} onChange={(cameraId) => setVoicePrefs({ cameraId })} />
        <CameraPreview cameraId={prefs.cameraId} />
      </section>
    </div>
  );
}
