import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServerProvider } from "@/components/providers/ServerProvider";
import { ChannelSidebar } from "@/components/server/ChannelSidebar";
import { MemberList } from "@/components/server/MemberList";
import { WarningNotice } from "@/components/server/WarningNotice";
import { RosterDrawer } from "@/components/workspace/RosterDrawer";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { requireProfile } from "@/lib/auth";
import { getServerBundle, getServerName } from "@/lib/data/servers";

export async function generateMetadata({ params }: LayoutProps<"/tambayan/[serverId]">): Promise<Metadata> {
  const { serverId } = await params;
  return { title: (await getServerName(serverId)) ?? "Server" };
}

export default async function ServerLayout({ children, params }: LayoutProps<"/tambayan/[serverId]">) {
  const { serverId } = await params;
  const { profile } = await requireProfile(`/tambayan/${serverId}`);
  const bundle = await getServerBundle(serverId, profile.id);
  if (!bundle) notFound();

  return (
    <ServerProvider server={bundle.server} channels={bundle.channels} members={bundle.members} badges={bundle.badges} myRole={bundle.myRole} roles={bundle.roles} memberRoles={bundle.memberRoles}>
      <WorkspacePanel id="nav" title="Channels">
        <ChannelSidebar />
      </WorkspacePanel>
      <WorkspacePanel id="main" title={bundle.server.name}>
        {children}
      </WorkspacePanel>
      <WarningNotice />
      <RosterDrawer count={bundle.members.length}>
        <MemberList />
      </RosterDrawer>
    </ServerProvider>
  );
}
