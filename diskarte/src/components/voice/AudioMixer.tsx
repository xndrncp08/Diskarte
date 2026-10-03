"use client";

import { SlidersVertical } from "lucide-react";
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { FloatingWindow } from "@/components/ui/FloatingWindow";
import { Tooltip } from "@/components/ui/Tooltip";
import { WindowSkeleton } from "@/components/ui/WindowSkeleton";
import { cn } from "@/lib/utils";

// Device lists, sliders and per-person rows download on first open.
const MixerPanel = dynamic(() => import("./AudioMixerPanel").then((m) => m.MixerPanel), {
  ssr: false,
  loading: () => <WindowSkeleton label="Loading audio mixer" />,
});

interface AudioMixerValue {
  openMixer: () => void;
}

const AudioMixerContext = createContext<AudioMixerValue | null>(null);

/**
 * Hosts the floating audio mixer for the app shell (inside <CallProvider>): open it mid-call, drag it
 * aside and keep talking — it only adjusts levels and devices, never the connection.
 */
export function AudioMixerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openMixer = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ openMixer }), [openMixer]);
  return (
    <AudioMixerContext.Provider value={value}>
      {children}
      <FloatingWindow
        id="audio-mixer"
        open={open}
        onClose={() => setOpen(false)}
        title="Audio mixer"
        icon={<SlidersVertical aria-hidden />}
        className="w-[min(24rem,calc(100vw-2rem))] max-h-[min(40rem,calc(100dvh-2rem))]"
        bodyClassName="p-4"
        testId="audio-mixer"
      >
        <MixerPanel />
      </FloatingWindow>
    </AudioMixerContext.Provider>
  );
}

export function useAudioMixer(): AudioMixerValue | null {
  return useContext(AudioMixerContext);
}

/** Opens the mixer; renders nothing outside the app shell. */
export function MixerButton({ className, size = "lg" }: { className?: string; size?: "sm" | "lg" }) {
  const mixer = useAudioMixer();
  if (!mixer) return null;
  return (
    <Tooltip label="Audio mixer" side="top">
      <button
        type="button"
        onClick={mixer.openMixer}
        aria-label="Audio mixer"
        aria-haspopup="dialog"
        className={cn(
          "flex items-center justify-center bg-white/10 text-slate-200 transition-colors hover:bg-white/20",
          size === "lg" ? "size-11 rounded-2xl sm:size-12" : "size-7 rounded-md pointer-coarse:size-11",
          className,
        )}
      >
        <SlidersVertical className={size === "lg" ? "size-5" : "size-4"} aria-hidden />
      </button>
    </Tooltip>
  );
}
