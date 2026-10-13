"use client";

import { Mic, SendHorizontal, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Tooltip } from "@/components/ui/Tooltip";
import { useIsClient } from "@/hooks/useIsClient";
import { formatDuration } from "@/lib/messages";
import { micProcessing, readVoicePrefs } from "@/lib/voice-prefs";

/** Longest voice message, in seconds. */
export const VOICE_MAX_SECONDS = 300;
// What each browser's MediaRecorder can produce, in order of preference (all allowed attachment types).
const FORMATS = [
  { mime: "audio/webm;codecs=opus", type: "audio/webm", ext: "webm" },
  { mime: "audio/ogg;codecs=opus", type: "audio/ogg", ext: "ogg" },
  { mime: "audio/mp4", type: "audio/mp4", ext: "m4a" },
] as const;

function supportedFormat() {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  return FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mime)) ?? null;
}

/** Discord's voice messages: hold nothing, just tap the mic, talk, then send or bin it. */
export function VoiceRecorder({ onRecorded, disabled = false }: { onRecorded: (file: File, seconds: number) => void; disabled?: boolean }) {
  const isClient = useIsClient();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const keep = useRef(false);

  useEffect(() => {
    if (startedAt === null) return;
    const t = setInterval(() => {
      const seconds = (Date.now() - startedAt) / 1000;
      setElapsed(seconds);
      if (seconds >= VOICE_MAX_SECONDS) stop(true);
    }, 250);
    return () => clearInterval(t);
  }, [startedAt]);

  // Leaving the channel mid-recording discards it and releases the mic.
  useEffect(() => () => stop(false), []);

  const format = isClient ? supportedFormat() : null;
  if (!format) return null;

  async function start() {
    const prefs = readVoicePrefs();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(prefs.inputId ? { deviceId: { exact: prefs.inputId } } : {}), ...micProcessing(prefs) } });
    } catch {
      toast.error("Diskarte can't use your microphone. Allow it in your browser's site settings.");
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, { mimeType: format!.mime, audioBitsPerSecond: 32_000 });
    const began = Date.now();
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const seconds = Math.round((Date.now() - began) / 100) / 10;
      if (keep.current && seconds >= 0.5) onRecorded(new File(chunks, `voice-message.${format!.ext}`, { type: format!.type }), seconds);
    };
    recorder.current = rec;
    keep.current = false;
    rec.start(1000);
    setElapsed(0);
    setStartedAt(began);
  }

  function stop(send: boolean) {
    const rec = recorder.current;
    recorder.current = null;
    setStartedAt(null);
    if (!rec || rec.state === "inactive") return;
    keep.current = send;
    rec.stop();
  }

  if (startedAt !== null) {
    return (
      <div className="flex items-center gap-1 rounded-full bg-red-500/15 py-0.5 pl-2 pr-0.5" role="status" aria-label="Recording a voice message">
        <span className="size-2 animate-pulse rounded-full bg-red-500" aria-hidden />
        <span className="w-10 text-xs tabular-nums text-red-100">{formatDuration(elapsed)}</span>
        <button type="button" onClick={() => stop(false)} aria-label="Discard voice message" className="rounded-full p-1.5 text-slate-300 hover:bg-white/10 hover:text-white">
          <Trash2 className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={() => stop(true)} aria-label="Send voice message" className="rounded-full bg-sun p-1.5 text-abyss hover:brightness-110">
          <SendHorizontal className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <Tooltip label="Record a voice message" side="top">
      <button type="button" onClick={() => void start()} disabled={disabled} aria-label="Record a voice message" className="touch-target relative rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 pointer-coarse:p-3">
        <Mic className="size-5" aria-hidden />
      </button>
    </Tooltip>
  );
}
