"use client";

import { Volume2 } from "lucide-react";
import { useServer } from "@/components/providers/ServerProvider";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { ChannelHeader } from "@/components/server/ChannelHeader";
import type { Channel } from "@/lib/servers";

/** Voice channel lobby: shows who is hanging out in the room right now (from presence). */
export function VoiceChannelView({ channel }: { channel: Channel }) {
  const { members, presence } = useServer();
  const inRoom = members.filter((m) => presence.get(m.user_id)?.voice_channel_id === channel.id);

  return (
    <section className="flex min-w-0 flex-1 flex-col" aria-label={channel.name}>
      <ChannelHeader channel={channel} />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-white/10">
          <Volume2 className="size-10 text-white" aria-hidden />
        </span>
        <div>
          <h2 className="text-2xl font-extrabold text-white">{channel.name}</h2>
          <p className="text-slate-400">{inRoom.length === 0 ? "Walang tao pa. Ikaw na ang mauna!" : `${inRoom.length} ang nasa loob`}</p>
        </div>
        <ul className="flex flex-wrap justify-center gap-4">
          {inRoom.map((m) => (
            <li key={m.user_id} className="flex flex-col items-center gap-1">
              <UserAvatar profile={m.profile} size={56} />
              <span className="text-sm text-slate-200">{m.nickname ?? m.profile.display_name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
