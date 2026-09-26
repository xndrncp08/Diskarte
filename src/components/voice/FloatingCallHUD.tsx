"use client";

import { useTracks } from "@livekit/components-react";
import { motion } from "framer-motion";
import { Track } from "livekit-client";
import { Maximize2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCall } from "./CallProvider";
import { ParticipantTile } from "./ParticipantTile";

function HudContent() {
  const call = useCall();
  const tracks = useTracks([Track.Source.ScreenShare, Track.Source.Camera], { onlySubscribed: true });
  const featured = tracks.find((t) => t.source === Track.Source.ScreenShare) ?? tracks.find((t) => !t.participant.isLocal) ?? tracks[0];
  if (!featured || !call.target) return null;
  return (
    <motion.div
      drag
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-strong fixed bottom-24 right-6 z-40 w-72 cursor-grab overflow-hidden rounded-2xl p-1.5 shadow-2xl shadow-black/60 active:cursor-grabbing"
      data-testid="call-hud"
    >
      <ParticipantTile trackRef={featured} compact className="aspect-video w-full" />
      <div className="flex items-center justify-between px-1.5 pt-1.5">
        <span className="truncate text-xs text-slate-300">🔊 {call.target.channelName}</span>
        <Link href={`/tambayan/${call.target.serverId}/${call.target.channelId}`} aria-label="Bumalik sa call" className="rounded p-1 text-slate-300 hover:bg-white/10 hover:text-white">
          <Maximize2 className="size-3.5" aria-hidden />
        </Link>
      </div>
    </motion.div>
  );
}

/** Draggable picture-in-picture of the call (screen share first) while you're on another page. */
export function FloatingCallHUD() {
  const call = useCall();
  const pathname = usePathname();
  if (call.status !== "connected" || !call.target || !call.room) return null;
  if (pathname === `/tambayan/${call.target.serverId}/${call.target.channelId}`) return null;
  return <HudContent />;
}
