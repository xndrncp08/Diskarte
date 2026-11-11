"use client";

import { Compass, LayoutGrid, Plus } from "lucide-react";
import { useState } from "react";
import { AddServerDialog } from "@/components/shell/AddServerDialog";
import type { RailEntry } from "@/components/shell/ServerRail";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { useDisplayPrefs } from "@/lib/display-prefs";
import { Button } from "../Button";
import { NavItem } from "../Nav";
import { EmptyState } from "../States";
import { Masthead } from "../shell/Masthead";
import { SpaceRow, useSpaces } from "../shell/Navigator";

/**
 * The phone Spaces tab (`/tambayan/spaces`, also a plain page on wider screens): every Space in your saved order, each
 * opening its landing (Overview) where its rooms are; long-press for the Space menu (a sheet on touch). Add a Space
 * sits at the bottom, in thumb reach. Same rows and data as the navigator's Spaces view (`servers` from getMyServers).
 */
export function PulseSpaces({ servers }: { servers: RailEntry[] }) {
  const spaces = useSpaces(servers);
  const pins = useDisplayPrefs().pins ?? [];
  const [adding, setAdding] = useState(false);
  return (
    <WorkspacePanel id="main" title="Spaces">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col font-pulse-text text-pulse-text">
        <Masthead title="Spaces" icon={<LayoutGrid />} description={`${spaces.length} Space${spaces.length === 1 ? "" : "s"}`} />
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl p-2 md:p-6">
            {spaces.length === 0 ? (
              <EmptyState title="No Spaces yet" icon={<LayoutGrid />} headingLevel={2}>Create one for your barkada, or find one to join.</EmptyState>
            ) : (
              <ul data-testid="spaces-screen" aria-label="Your Spaces">
                {spaces.map((s) => <SpaceRow key={s.id} server={s} href={`/tambayan/${s.id}`} active={false} pinned={pins.includes(`space:${s.id}`)} />)}
              </ul>
            )}
            <ul className="mt-2 border-t border-pulse-line pt-2">
              <li><NavItem label="Explore Spaces" leading={<Compass />} href="/tambayan/explore" /></li>
            </ul>
          </div>
        </div>
        <div className="flex shrink-0 justify-end border-t border-pulse-line p-3">
          <Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)} className="max-md:w-full">Add a Space</Button>
        </div>
        <AddServerDialog open={adding} onClose={() => setAdding(false)} />
      </section>
    </WorkspacePanel>
  );
}
