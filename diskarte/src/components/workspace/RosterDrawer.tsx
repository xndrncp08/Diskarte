"use client";

import type { ReactNode } from "react";
import { ResizeHandle } from "./ResizeHandle";
import { ROSTER_WIDTH, useLayout } from "./WorkspaceProvider";

/**
 * The member list: a resizable column on the right (desktop), toggled from the channel header ("Toggle
 * member list") and remembered. Phones don't show a member column.
 */
export function RosterDrawer({ children }: { children: ReactNode; count?: number }) {
  const [layout, setLayout] = useLayout();
  if (!layout.membersOpen) return null;
  return (
    <aside
      aria-label="Member roster"
      data-roster="open"
      style={{ width: layout.roster }}
      className="relative ml-auto flex shrink-0 flex-col border-l border-white/[0.06] bg-midnight/60 max-lg:hidden"
    >
      <ResizeHandle label="Resize member list" side="left" value={layout.roster} {...ROSTER_WIDTH} onChange={(roster) => setLayout({ roster })} />
      <div className="flex min-h-0 flex-1">{children}</div>
    </aside>
  );
}
