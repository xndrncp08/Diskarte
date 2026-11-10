"use client";

import { useParams } from "next/navigation";
import { Pin, PinOff, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { usePinnedMessages } from "@/components/chat/PinsDrawer";
import { Timestamp } from "@/components/chat/Timestamp";
import { useServer } from "@/components/providers/ServerProvider";
import { Avatar } from "../Avatar";
import { Button, IconButton } from "../Button";
import { Sheet } from "../Dialog";
import { EmptyState, Loading } from "../States";
import { Tabs } from "../Tabs";
import { usePulseUI } from "./PulseUI";

const TABS = [
  { id: "people", label: "People" },
  { id: "pinned", label: "Pinned" },
  { id: "about", label: "About" },
];

/** The open channel's pinned messages: the same RLS-scoped query as the Pins drawer, run only while this tab shows. */
function PinnedTab({ channelId }: { channelId: string }) {
  const pinned = usePinnedMessages(channelId, true);
  if (!pinned) return <Loading label="Loading pinned messages…" />;
  if (pinned.length === 0) return <EmptyState title="Nothing pinned yet" headingLevel={3}>Pin a message from its menu to keep it here.</EmptyState>;
  return (
    <ul className="space-y-3">
      {pinned.map((m) => (
        <li key={m.id} className="rounded-pulse-item border border-pulse-line p-3">
          <div className="mb-1 flex items-center gap-2 text-pulse-label">
            {m.author && <Avatar profile={m.author} size={20} />}
            <span className="font-semibold">{m.author?.display_name ?? "Someone"}</span>
            <span className="text-pulse-muted"><Timestamp iso={m.created_at} /></span>
          </div>
          <p className="line-clamp-4 whitespace-pre-wrap break-words text-pulse-body">{m.content || "Attachment"}</p>
        </li>
      ))}
    </ul>
  );
}

/** Channel topic, Space description and rules, from the server bundle the layout already loaded. */
function AboutTab({ channelId }: { channelId?: string }) {
  const { server, channels } = useServer();
  const channel = channels.find((c) => c.id === channelId);
  return (
    <div className="space-y-5">
      {channel && (
        <section>
          <h3 className="text-pulse-label font-semibold text-pulse-muted">{channel.type === "voice" ? "Room" : `#${channel.name}`}</h3>
          <p className="mt-1 whitespace-pre-wrap">{channel.topic || "No topic yet."}</p>
        </section>
      )}
      <section>
        <h3 className="text-pulse-label font-semibold text-pulse-muted">{server.name}</h3>
        <p className="mt-1 whitespace-pre-wrap">{server.description || "No description yet."}</p>
      </section>
      {server.rules && (
        <section>
          <h3 className="text-pulse-label font-semibold text-pulse-muted">Rules</h3>
          <p className="mt-1 whitespace-pre-wrap">{server.rules}</p>
        </section>
      )}
    </div>
  );
}

/**
 * Pulse's Context sheet, in place of Classic's always-on member list (RosterDrawer's Pulse path): People (the
 * roster the layout passes in), Pinned and About. Opened from the masthead as a sheet; at ≥ 1200 px it can be
 * pinned open as a column beside the canvas (remembered per browser).
 * shortcut: no Media tab yet (recent attachments need a new query); add one with the Step 5 message work.
 */
export function ContextPanel({ children }: { children: ReactNode }) {
  const ui = usePulseUI();
  const { channelId } = useParams<{ channelId?: string }>();
  const [tab, setTab] = useState("people");
  const body = (
    <Tabs label="Context" items={TABS.filter((t) => t.id !== "pinned" || channelId)} value={tab === "pinned" && !channelId ? "people" : tab} onChange={setTab}>
      <div className="pt-3">
        {tab === "pinned" && channelId ? <PinnedTab channelId={channelId} /> : tab === "about" ? <AboutTab channelId={channelId} /> : children}
      </div>
    </Tabs>
  );

  if (ui.docked) {
    return (
      <aside aria-label="Context" className="my-2 mr-2 flex w-80 shrink-0 flex-col overflow-hidden rounded-pulse-card border border-pulse-line bg-pulse-surface font-pulse-text text-pulse-text shadow-pulse-1" data-testid="context-panel">
        <div className="flex items-center gap-1 border-b border-pulse-line px-4 py-2">
          <h2 className="flex-1 font-pulse-display text-pulse-title font-semibold">Context</h2>
          <IconButton size="sm" tooltip label="Unpin context" icon={<PinOff />} onClick={() => ui.setContextPinned(false)} />
          <IconButton size="sm" tooltip label="Close context" icon={<X />} onClick={() => ui.setContextPinned(false)} />
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">{body}</div>
      </aside>
    );
  }
  return (
    <Sheet
      open={ui.contextOpen}
      onClose={() => ui.setContextOpen(false)}
      title="Context"
      footer={ui.wide && <Button variant="quiet" size="sm" icon={<Pin />} onClick={() => { ui.setContextPinned(true); ui.setContextOpen(false); }}>Keep open beside the conversation</Button>}
    >
      {body}
    </Sheet>
  );
}
