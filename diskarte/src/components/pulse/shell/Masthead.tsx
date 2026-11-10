"use client";

import { Menu, PanelRight } from "lucide-react";
import type { ReactNode } from "react";
import { useShellUI } from "@/components/shell/ShellUI";
import { IconButton } from "../Button";
import { usePulseUI } from "./PulseUI";

/**
 * The canvas masthead: what you're looking at (the page's one h1, in the display face), where it lives and its
 * topic or member count, the page's own actions, and (`context`) the Context sheet toggle. ChannelHeader and
 * PageHeader render this in Pulse, so every page gets it without being rewritten. On phones it leads with the
 * navigator button.
 */
export function Masthead({ title, eyebrow, description, icon, actions, context = false, titleTestId }: { title: string; eyebrow?: string; description?: ReactNode; icon?: ReactNode; actions?: ReactNode; context?: boolean; titleTestId?: string }) {
  const { setNavOpen } = useShellUI();
  const ui = usePulseUI();
  const open = ui.docked || ui.contextOpen;
  return (
    <header className="flex min-h-16 shrink-0 items-center gap-2 border-b border-pulse-line px-3 py-2 font-pulse-text text-pulse-text md:px-5" data-pulse-masthead="">
      <IconButton label="Open navigation" icon={<Menu />} onClick={() => setNavOpen(true)} className="md:hidden" />
      {icon && <span className="hidden size-9 shrink-0 items-center justify-center rounded-pulse-control bg-pulse-raised text-pulse-muted sm:inline-flex [&_svg]:size-4" aria-hidden>{icon}</span>}
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="truncate text-pulse-caption text-pulse-muted">{eyebrow}</p>}
        <h1 className="truncate font-pulse-display text-pulse-title font-semibold md:text-pulse-display" data-testid={titleTestId}>{title}</h1>
        {description && <p className="truncate text-pulse-label text-pulse-muted">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        {context && (
          <IconButton
            tooltip
            label={open ? "Hide context" : "Show context"}
            aria-expanded={open}
            icon={<PanelRight />}
            onClick={() => (ui.docked ? ui.setContextPinned(false) : ui.setContextOpen(!ui.contextOpen))}
            data-testid="context-toggle"
          />
        )}
      </div>
    </header>
  );
}
