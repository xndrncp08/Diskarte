"use client";

import { Columns3, Focus, PanelBottomClose, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import type { Preset } from "@/lib/workspace";
import { useVoicePanelAvailable } from "./VoicePanel";
import { useWorkspace, useWorkspaceStore } from "./WorkspaceProvider";

const PRESETS: { id: Preset; label: string; hint: string; icon: ReactNode }[] = [
  { id: "focus", label: "Focus mode", hint: "Just the conversation: everything else tucked away", icon: <Focus className="size-5" aria-hidden /> },
  { id: "multitask", label: "Multitask mode", hint: "Channels, chat and the live call side by side", icon: <Columns3 className="size-5" aria-hidden /> },
  { id: "minimal", label: "Minimal dock", hint: "Minimize every panel into the bottom tray", icon: <PanelBottomClose className="size-5" aria-hidden /> },
];

const BUTTON =
  "flex size-11 items-center justify-center rounded-2xl text-slate-400 transition-colors hover:bg-white/10 hover:text-white aria-pressed:bg-sun/15 aria-pressed:text-sun";

/** Workspace preset triggers on the command rail (tablet and up, where the canvas exists). */
export function WorkspacePresets() {
  const store = useWorkspaceStore();
  const active = useWorkspace((s) => s.preset);
  const voiceAvailable = useVoicePanelAvailable();

  return (
    <div role="group" aria-label="Workspace layout" className="flex flex-col items-center gap-1.5 max-md:hidden">
      {PRESETS.map((p) => (
        <Tooltip key={p.id} label={`${p.label} — ${p.hint}`} side="right">
          <button type="button" aria-label={p.label} aria-pressed={active === p.id} onClick={() => store.applyPreset(p.id, { voiceAvailable })} className={BUTTON}>
            {p.icon}
          </button>
        </Tooltip>
      ))}
      <Tooltip label="Reset layout" side="right">
        <button type="button" aria-label="Reset layout" onClick={store.reset} className={BUTTON}>
          <RotateCcw className="size-4" aria-hidden />
        </button>
      </Tooltip>
    </div>
  );
}
