import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServerProvider } from "@/components/providers/ServerProvider";
import { ChannelSidebar } from "@/components/server/ChannelSidebar";
import { MemberList } from "@/components/server/MemberList";
import { RosterDrawer } from "@/components/workspace/RosterDrawer";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { requireProfile } from "@/lib/auth";
import { getServerBundle } from "@/lib/data/servers";

export async function generateMetadata({ params }: LayoutProps<"/tambayan/[serverId]">): Promise<Metadata> {
  const { serverId } = await params;
  const { profile } = await requireProfile();
  const bundle = await getServerBundle(serverId, profile.id);
  return { title: bundle?.server.name ?? "Server" };
}

export default async function ServerLayout({ children, params }: LayoutProps<"/tambayan/[serverId]">) {
  const { serverId } = await params;
  const { profile } = await requireProfile(`/tambayan/${serverId}`);
  const bundle = await getServerBundle(serverId, profile.id);
  if (!bundle) notFound();

  return (
    <ServerProvider server={bundle.server} channels={bundle.channels} members={bundle.members} badges={bundle.badges} myRole={bundle.myRole}>
      <WorkspacePanel id="nav" title="Channels">
        <ChannelSidebar />
      </WorkspacePanel>
      <WorkspacePanel id="main" title={bundle.server.name}>
        {children}
      </WorkspacePanel>
      <RosterDrawer count={bundle.members.length}>
        <MemberList />
      </RosterDrawer>
    </ServerProvider>
  );
}
