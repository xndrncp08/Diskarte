"use client";

import { Loader2, Volume2 } from "lucide-react";
import { useServer } from "@/components/providers/ServerProvider";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { ChannelHeader } from "@/components/server/ChannelHeader";
import { Button } from "@/components/ui/Button";
import type { Channel } from "@/lib/servers";
import { useCall } from "./CallProvider";
import { VoiceStage } from "./VoiceStage";

/** Voice channel page: lobby with who's inside + Join, or the live stage when you're connected. */
export function VoiceChannelView({ channel }: { channel: Channel }) {
  const { server, members, presence } = useServer();
  const call = useCall();
  const here = call.target?.channelId === channel.id;
  const inRoom = members.filter((m) => presence.get(m.user_id)?.voice_channel_id === channel.id);

  return (
    <section className="flex min-w-0 flex-1 flex-col" aria-label={channel.name}>
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
            <p className="text-slate-400">{inRoom.length === 0 ? "Walang tao pa. Ikaw na ang mauna!" : `${inRoom.length} ang nasa loob ngayon`}</p>
          </div>
          {inRoom.length > 0 && (
            <ul className="flex flex-wrap justify-center gap-4" aria-label="Nasa voice channel">
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
            onClick={() => void call.join({ serverId: server.id, serverName: server.name, channelId: channel.id, channelName: channel.name })}
            data-testid="join-voice"
          >
            {here && call.status !== "idle" ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Kumokonekta…
              </>
            ) : call.target ? (
              "Lumipat dito"
            ) : (
              "Join Voice"
            )}
          </Button>
          <p className="max-w-sm text-xs text-slate-500">Hihingi ang browser ng permiso para sa mikropono. Pwede kang mag-on ng camera at screen share pagpasok.</p>
        </div>
      )}
    </section>
  );
}
