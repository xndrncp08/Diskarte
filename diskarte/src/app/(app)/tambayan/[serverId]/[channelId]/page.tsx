import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChatView } from "@/components/chat/ChatView";
import { ForumView } from "@/components/chat/ForumView";
import { VoiceChannelView } from "@/components/voice/VoiceChannelView";
import { requireProfile } from "@/lib/auth";
import { getChannelHistory } from "@/lib/data/messages";
import { getChannel, getServerName } from "@/lib/data/servers";

export async function generateMetadata({ params }: PageProps<"/tambayan/[serverId]/[channelId]">): Promise<Metadata> {
  const { serverId, channelId } = await params;
  const [channel, serverName] = await Promise.all([getChannel(serverId, channelId), getServerName(serverId)]);
  return channel ? { title: `${channel.type !== "voice" ? "#" : ""}${channel.name} · ${serverName}` } : {};
}

export default async function ChannelPage({ params }: PageProps<"/tambayan/[serverId]/[channelId]">) {
  const { serverId, channelId } = await params;
  // One round of parallel queries (the server layout already loaded the bundle). History is RLS-scoped, so
  // fetching it before the channel check leaks nothing; a voice channel just gets an empty page back.
  const [, channel, history] = await Promise.all([
    requireProfile(`/tambayan/${serverId}/${channelId}`),
    getChannel(serverId, channelId),
    getChannelHistory(channelId),
  ]);
  // A remembered or shared link to a channel that's gone: open the server instead (its index 404s non-members).
  if (!channel) redirect(`/tambayan/${serverId}`);
  if (channel.type === "voice") return <VoiceChannelView channel={channel} />;
  if (channel.type === "forum") return <ForumView key={channel.id} channel={channel} initial={history} />;
  return <ChatView key={channel.id} channel={channel} initial={history} />;
}
