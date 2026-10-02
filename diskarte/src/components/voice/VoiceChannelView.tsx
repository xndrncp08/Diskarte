"use client";

import { motion } from "framer-motion";
import { Loader2, Volume2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useServer } from "@/components/providers/ServerProvider";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { ChannelHeader } from "@/components/server/ChannelHeader";
import { Button } from "@/components/ui/Button";
import type { Channel } from "@/lib/servers";
import { useCall } from "./CallProvider";
import { StageSkeleton } from "./StageSkeleton";

// The call grid pulls in @livekit/components-react; load it only once you're in the call.
const VoiceStage = dynamic(() => import("./live/VoiceStage").then((m) => m.VoiceStage), { ssr: false, loading: () => <StageSkeleton /> });

/** Voice channel page: lobby with who's inside + Join, or the live stage when you're connected. */
export function VoiceChannelView({ channel }: { channel: Channel }) {
  const { server, members, presence } = useServer();
  const call = useCall();
  const here = call.target?.channelId === channel.id;
  const inRoom = members.filter((m) => presence.get(m.user_id)?.voice_channel_id === channel.id);
  const target = { serverId: server.id, serverName: server.name, channelId: channel.id, channelName: channel.name };

  // Opening a voice channel is a strong hint you'll join: warm the SDK and token now.
  const { prewarm } = call;
  useEffect(() => {
    if (!here) prewarm({ serverId: server.id, serverName: server.name, channelId: channel.id, channelName: channel.name });
    // Warm once per channel opened, not on every call-state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, prewarm]);

  return (
    <motion.section
      className="flex min-w-0 flex-1 flex-col md:overflow-hidden md:float-card"
      aria-label={channel.name}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
    >
      <ChannelHeader channel={channel} />
      {here && call.status === "connected" ? (
        <VoiceStage />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
          <span className="flex size-20 items-center justify-center rounded-full bg-white/10">
            <Volume2 className="size-10 text-white" aria-hidden />
          </span>
          <div>
            <p className="font-pixel text-[9px] text-sun">VOICE CHANNEL</p>
            <h2 className="mt-2 text-2xl font-extrabold text-white">{channel.name}</h2>
            <p className="text-slate-400">{inRoom.length === 0 ? "Nobody's here yet. Be the first!" : `${inRoom.length} in voice now`}</p>
          </div>
          {inRoom.length > 0 && (
            <ul className="flex flex-wrap justify-center gap-4" aria-label="In voice">
              {inRoom.map((m) => (
                <li key={m.user_id} className="flex flex-col items-center gap-1">
                  <UserAvatar profile={m.profile} size={56} />
                  <span className="text-sm text-slate-200">{m.nickname ?? m.profile.display_name}</span>
                </li>
              ))}
            </ul>
          )}
          <Button
            size="lg"
            loading={here && (call.status === "connecting" || call.status === "reconnecting")}
            onClick={() => void call.join(target)}
            data-testid="join-voice"
          >
            {here && call.status !== "idle" ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Connecting…
              </>
            ) : call.target ? (
              "Switch here"
            ) : (
              "Join Voice"
            )}
          </Button>
          <p className="max-w-sm text-xs text-slate-500">
            Your browser will ask for microphone access. You can turn on your camera and screen share once you&apos;re in.
          </p>
        </div>
      )}
    </motion.section>
  );
}
