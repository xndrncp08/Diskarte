"use client";

import { useRef, type ReactNode } from "react";
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
  const { navOpen } = useShellUI();
  const [layout, setLayout] = useLayout();
  const desktop = useIsCanvas();
  const ref = useRef<HTMLElement>(null);
  const panel = useFloatingPanel(id, ref);
  const controls = panel.floating && <FloatingPanelControls title={title} panel={panel} />;
  const content = <div className="flex min-h-0 min-w-0 flex-1">{children}</div>;

  if (id === "main") {
    return (
      <main ref={ref} style={panel.style} onPointerDownCapture={panel.raise} onFocusCapture={panel.raise} data-floating-panel={panel.floating ? "" : undefined} id="main-content" tabIndex={-1} inert={navOpen && !desktop} aria-label={title} data-panel="main" className={cn("workspace-main relative flex min-h-0 min-w-0 flex-1 flex-col outline-none md:bg-abyss/40", panel.floating && "glass overflow-hidden rounded-2xl shadow-2xl", className)}>
        {controls}{content}
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
