import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TextChannelView } from "@/components/chat/TextChannelView";
import { VoiceChannelView } from "@/components/voice/VoiceChannelView";
import { requireProfile } from "@/lib/auth";
import { getRecentMessages } from "@/lib/data/messages";
import { getServerBundle } from "@/lib/data/servers";

async function load(params: PageProps<"/tambayan/[serverId]/[channelId]">["params"]) {
  const { serverId, channelId } = await params;
  const { profile } = await requireProfile(`/tambayan/${serverId}/${channelId}`);
  const bundle = await getServerBundle(serverId, profile.id);
  const channel = bundle?.channels.find((c) => c.id === channelId);
  return { bundle, channel };
}

export async function generateMetadata({ params }: PageProps<"/tambayan/[serverId]/[channelId]">): Promise<Metadata> {
  const { bundle, channel } = await load(params);
  if (!bundle || !channel) return {};
  return { title: `${channel.type === "text" ? "#" : "🔊 "}${channel.name} · ${bundle.server.name}` };
}

export default async function ChannelPage({ params }: PageProps<"/tambayan/[serverId]/[channelId]">) {
  const { channel } = await load(params);
  if (!channel) notFound();
  if (channel.type === "voice") return <VoiceChannelView channel={channel} />;
  const messages = await getRecentMessages(channel.id);
  return <TextChannelView key={channel.id} channel={channel} initialMessages={messages} />;
}
