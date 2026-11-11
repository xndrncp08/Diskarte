"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Maximize2 } from "lucide-react";
import { useOptionalServer } from "@/components/providers/ServerProvider";
import { callHref, useCall, useCallSpeaking } from "@/components/voice/CallProvider";
import { ConnectionMeter } from "@/components/voice/ConnectionMeter";
import { participantProfile } from "@/components/voice/participant-profile";
import { CallAnnouncer, CallRecovery } from "@/components/voice/pulse/CallRecovery";
import { CallControls } from "@/components/voice/pulse/controls";
import { useRoomPeople } from "@/components/voice/pulse/people";
import { cn } from "@/lib/utils";
import { AvatarStack } from "../Avatar";
import { buttonClasses } from "../Button";
import { LiveIndicator } from "../PulseLine";

const STATUS_TEXT = { connecting: "Connecting…", reconnecting: "Reconnecting…", connected: "Live", idle: "" } as const;

/** Who's in the call, speakers ringed: LiveKit's own room (you're in it, so you may see everyone), never presence. */
function CallPeople() {
  const call = useCall();
  const speaking = useCallSpeaking();
  const members = useOptionalServer()?.members;
  const people = useRoomPeople(call.room).map((p) => ({ ...participantProfile(p, members), speaking: speaking.includes(p.identity) }));
  if (people.length === 0) return null;
  return <AvatarStack people={people} max={4} size={24} className="shrink-0 px-1 max-lg:hidden" />;
}

/**
 * The live strip: while you're in a call and not looking at its stage, a slim bar across the top of the canvas with the
 * room, connection health (bars and a word), who's in it (speakers ringed), Mute / Deafen / Camera / Share screen (fixed
 * names, aria-pressed), the mixer, Leave and "Open stage" (the voice room, or the DM with its stage). Recovery states
 * (reconnecting, poor connection, sound blocked, mic blocked) show under it with their fix.
 *
 * Public props (the phone navigation places the compact one): `compact` is one row for phones (room, Mute, Leave, Open
 * stage), no `max-md:hidden`; the default is tablets and up and also owns the call's one live region (CallAnnouncer),
 * so render exactly one non-compact strip.
 */
export function CallStrip({ compact = false }: { compact?: boolean }) {
  const call = useCall();
  const pathname = usePathname();
  const target = call.target;
  const href = target ? callHref(target) : null;
  // The stage page has its own dock and recovery notice.
  const visible = call.status !== "idle" && !!target && pathname !== href;
  const announcer = compact ? null : <CallAnnouncer />;
  if (!visible || !target || !href) return announcer;

  const status = call.status === "connected" ? <LiveIndicator label="Voice connected" hideLabel={compact} className="shrink-0" /> : <span className="shrink-0 text-pulse-label font-semibold text-pulse-text">{STATUS_TEXT[call.status]}</span>;
  const room = (
    <Link href={href} className="min-w-0 truncate rounded-pulse-control text-pulse-label text-pulse-text hover:underline">
      <span className="font-semibold">{target.channelName}</span>
      {!compact && <span className="text-pulse-muted"> · {target.serverName}</span>}
    </Link>
  );
  const openStage = compact ? (
    <Link href={href} aria-label="Open stage" className={cn(buttonClasses("quiet", "md"), "size-10 px-0 pointer-coarse:min-w-11")}>
      <Maximize2 className="size-4" aria-hidden />
    </Link>
  ) : (
    <Link href={href} className={buttonClasses("live", "sm")}>
      <Maximize2 className="size-4" aria-hidden />
      Open stage
    </Link>
  );

  return (
    <>
      {announcer}
      <section aria-label="Live call" className={cn("border-b border-pulse-line bg-pulse-live-tint font-pulse-text", compact ? "px-2 py-1" : "px-3 py-1.5 max-md:hidden")} data-testid={compact ? "call-strip-compact" : "call-dock"}>
        <div className={cn("flex min-h-11 items-center gap-x-2", !compact && "flex-wrap gap-y-1")}>
          {status}
          {room}
          {!compact && <ConnectionMeter compact />}
          <span className={cn("ml-auto flex shrink-0 items-center", compact ? "gap-0.5" : "gap-2")}>
            {!compact && <CallPeople />}
            <CallControls layout={compact ? "compact" : "strip"} />
            {openStage}
          </span>
        </div>
        <CallRecovery prompt={compact ? "phone" : "wide"} compact={compact} className="mb-1.5" />
      </section>
    </>
  );
}
