"use client";

import { useRef, type ReactNode } from "react";
import { useShortScreen } from "@/components/pulse/shell/MobileTabs";
import { useShellKind } from "@/components/shell/ShellKind";
import { useShellUI } from "@/components/shell/ShellUI";
import { cn } from "@/lib/utils";
import { ResizeHandle } from "./ResizeHandle";
import { NAV_WIDTH, useIsCanvas, useLayout } from "./WorkspaceProvider";
import { FloatingPanelControls, useFloatingPanel } from "./FloatingPanelControls";

export type PanelId = "nav" | "main";

export interface WorkspacePanelProps {
  id: PanelId;
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * A column of the app layout. "nav" is the channel / DM list: a resizable column on desktop and the
 * slide-in drawer on phones. "main" is the page's <main> landmark (the skip link's target) and takes
 * the remaining width.
 */
export function WorkspacePanel({ id, title, children, className }: WorkspacePanelProps) {
  const shell = useShellKind();
  const { navOpen } = useShellUI();
  const [layout, setLayout] = useLayout();
  const short = useShortScreen();
  const desktop = useIsCanvas() && (shell !== "pulse" || !short);
  const ref = useRef<HTMLElement>(null);
  const panel = useFloatingPanel(id, ref);
  const controls = panel.floating && <FloatingPanelControls title={title} panel={panel} />;
  const content = <div className="flex min-h-0 min-w-0 flex-1">{children}</div>;

  // Keep the same main/content slot in both shells: remounting would discard queued uploads and edits.
  if (shell === "pulse" && id === "nav") return null;
  if (id === "main") {
    const pulse = shell === "pulse";
    return (
      <main ref={ref} style={pulse ? undefined : panel.style} onPointerDownCapture={pulse ? undefined : panel.raise} onFocusCapture={pulse ? undefined : panel.raise} data-floating-panel={!pulse && panel.floating ? "" : undefined} id="main-content" tabIndex={-1} inert={navOpen && !desktop} aria-label={title} data-panel="main" className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
        pulse ? "bg-pulse-surface text-pulse-text md:my-2 md:mr-2 md:overflow-hidden md:rounded-pulse-card md:border md:border-pulse-line md:shadow-pulse-1" : "workspace-main md:bg-abyss/40",
        !pulse && panel.floating && "glass overflow-hidden rounded-2xl shadow-2xl", className,
      )}>
        {!pulse && controls}{content}
      </main>
    );
  }
  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      role="region"
      aria-label={title}
      data-panel="nav"
      data-mobile-navigation=""
      inert={!desktop && !navOpen}
      style={{ "--nav-w": `${layout.nav}px`, ...panel.style } as React.CSSProperties}
      data-floating-panel={panel.floating ? "" : undefined}
      onPointerDownCapture={panel.raise}
      onFocusCapture={panel.raise}
      className={cn(
        "workspace-sidebar flex min-w-0 outline-none",
        // Phones: the drawer next to the rail.
        "max-md:fixed max-md:inset-y-0 max-md:left-[72px] max-md:z-40 max-md:transition-transform max-md:duration-200 max-md:ease-out",
        navOpen ? "max-md:translate-x-0" : "max-md:-translate-x-[calc(100%+72px)]",
        // Desktop: a column of the remembered width.
        "md:relative md:w-[var(--nav-w)] md:shrink-0 md:border-r md:border-white/[0.06] md:bg-midnight/60",
        panel.floating && "glass flex-col overflow-hidden rounded-2xl shadow-2xl",
        className,
      )}
    >
      {controls}{content}
      {!panel.floating && <ResizeHandle label="Resize channel list" side="right" value={layout.nav} {...NAV_WIDTH} onChange={(nav) => setLayout({ nav })} />}
    </div>
  );
}
