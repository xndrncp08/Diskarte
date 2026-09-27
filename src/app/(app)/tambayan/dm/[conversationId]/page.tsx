import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DmView } from "@/components/social/DmView";
import { requireProfile } from "@/lib/auth";
import { getConversationBundle } from "@/lib/data/social";
import { getMyServers } from "@/lib/data/servers";
import { conversationTitle } from "@/lib/social";

async function load(params: PageProps<"/tambayan/dm/[conversationId]">["params"]) {
  const { conversationId } = await params;
  const { profile } = await requireProfile(`/tambayan/dm/${conversationId}`);
  return { profile, bundle: await getConversationBundle(conversationId, profile.id) };
}

export async function generateMetadata({ params }: PageProps<"/tambayan/dm/[conversationId]">): Promise<Metadata> {
  const { profile, bundle } = await load(params);
  if (!bundle) return {};
  const others = bundle.participants.filter((p) => p.id !== profile.id);
  return { title: conversationTitle({ kind: bundle.conversation.kind, name: bundle.conversation.name, others }) };
}

export default async function DmPage({ params }: PageProps<"/tambayan/dm/[conversationId]">) {
  const { profile, bundle } = await load(params);
  if (!bundle) notFound();
  const servers = await getMyServers(profile.id);
  return (
    <DmView
      key={bundle.conversation.id}
      servers={servers}
      conversation={bundle.conversation}
      participants={bundle.participants}
      initial={{ messages: bundle.messages, hasMore: bundle.hasMore }}
      canSend={bundle.canSend}
    />
  );
}
