import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { RuntimeConfigProvider } from "@/components/providers/RuntimeConfig";
import { MeProvider } from "@/components/providers/MeProvider";
import { PresenceProvider } from "@/components/providers/PresenceProvider";
import {
  SocialContext,
  type SocialValue,
} from "@/components/providers/SocialProvider";
import { ServerContext } from "@/components/providers/ServerProvider";
import { CallProvider } from "@/components/voice/CallProvider";
import { SettingsDialogProvider } from "@/components/profile/SettingsDialog";
import { MediaViewerProvider } from "@/components/chat/MediaViewer";
import { AppShell } from "@/components/shell/AppShell";
import { HomeView } from "@/components/shell/HomeView";
import { ExploreView } from "@/components/shell/ExploreView";
import { MessagesView } from "@/components/social/MessagesView";
import { FriendsView } from "@/components/social/FriendsView";
import { SharedWorkspaceView } from "@/components/workspace/SharedWorkspaceView";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { ChannelSidebar } from "@/components/server/ChannelSidebar";
import { ChatView } from "@/components/chat/ChatView";
import { VoiceChannelView } from "@/components/voice/VoiceChannelView";
import { MemberList } from "@/components/server/MemberList";
import { RosterDrawer } from "@/components/workspace/RosterDrawer";
import { useDisplayPrefs } from "@/lib/display-prefs";
import { channels, SERVER_ID, server } from "../fixtures/server";
import { usePathname } from "./navigation";
import { people, members } from "./database";
import "@/app/globals.css";

const social: SocialValue = {
  friends: [
    { userId: people[1].id, status: "accepted", since: "2026-10-01T00:00:00Z" },
    { userId: people[2].id, status: "incoming", since: "2026-10-01T00:00:00Z" },
  ],
  blocked: [],
  profiles: new Map(people.map((profile) => [profile.id, profile])),
  conversations: [
    {
      id: "60000000-0000-4000-8000-000000000001",
      kind: "direct",
      name: null,
      ownerId: null,
      lastMessageAt: "2026-10-16T12:00:00Z",
      lastReadAt: "2026-10-01T00:00:00Z",
      others: [people[1]],
    },
  ],
  attention: 2,
  reload: async () => {},
  reloadConversations: async () => {},
  markRead: () => {},
  nicknames: new Map(),
  setNickname: async () => false,
};

function Fixture() {
  const path = usePathname();
  const prefs = useDisplayPrefs();
  useEffect(() => {
    document.documentElement.dataset.colorMode =
      prefs.colorMode === "system" ? "dark" : prefs.colorMode;
    document.documentElement.toggleAttribute(
      "data-reduce-motion",
      prefs.reducedMotion === "on",
    );
  }, [prefs]);
  const channel =
    channels.find((item) => path.endsWith(item.id)) ?? channels[0];
  return (
    <AppShell servers={[server]}>
      {path === "/tambayan" ? (
        <HomeView
          servers={[server]}
          events={[
            {
              id: "e1",
              server_id: SERVER_ID,
              name: "Weekend hangout",
              starts_at: "2026-11-01T12:00:00Z",
              ends_at: null,
            },
          ]}
        />
      ) : path === "/tambayan/explore" ? (
        <ExploreView servers={[server]} />
      ) : path === "/tambayan/messages" ? (<MessagesView servers={[server]} />) : path === "/tambayan/friends" ? (
        <FriendsView servers={[server]} />
      ) : (
        <>
          <WorkspacePanel id="nav" title="Channels">
            <ChannelSidebar />
          </WorkspacePanel>
          <WorkspacePanel id="main" title={server.name}>
            {path.endsWith("workspace") ? (
              <SharedWorkspaceView />
            ) : channel.type === "voice" ? (
              <VoiceChannelView channel={channel} />
            ) : (
              <ChatView
                key={channel.id}
                channel={channel}
                initial={{
                  messages: [
                    {
                      id: "m1",
                      channel_id: channel.id,
                      server_id: SERVER_ID,
                      author_id: people[1].id,
                      content: "One more game, then we plan the weekend?",
                      author: people[1],
                      attachments: [],
                      reply_to_id: null,
                      pinned: false,
                      pinned_at: null,
                      pinned_by: null,
                      edited_at: null,
                      thread_id: null,
                      sticker: null,
                      thread_reply_count: 0,
                      thread_last_reply_at: null,
                      created_at: "2026-10-16T12:00:00Z",
                    },
                    {
                      id: "m2",
                      channel_id: channel.id,
                      server_id: SERVER_ID,
                      author_id: people[2].id,
                      content: "G! I left the notes in our shared workspace.",
                      author: people[2],
                      attachments: [],
                      reply_to_id: null,
                      pinned: false,
                      pinned_at: null,
                      pinned_by: null,
                      edited_at: null,
                      thread_id: null,
                      sticker: null,
                      thread_reply_count: 0,
                      thread_last_reply_at: null,
                      created_at: "2026-10-16T12:01:00Z",
                    },
                  ],
                  reactions: [],
                  hasMore: false,
                }}
              />
            )}
          </WorkspacePanel>
          <RosterDrawer count={members.length}>
            <MemberList />
          </RosterDrawer>
        </>
      )}
    </AppShell>
  );
}

// Fixture data and disabled server boundaries stay outside Next's production source tree.
createRoot(document.getElementById("root")!).render(
  <RuntimeConfigProvider
    value={{
      supabaseUrl: "https://fixture.invalid",
      supabaseAnonKey: "fixture-public-key",
      siteUrl: location.origin,
      livekitUrl: "wss://fixture.invalid",
    }}
  >
    <MeProvider profile={people[0]}>
      <PresenceProvider>
        <CallProvider>
          <SocialContext.Provider value={social}>
            <SettingsDialogProvider
              account={{ email: "kapitan@example.test", providers: ["email"] }}
            >
              <MediaViewerProvider>
                <ServerContext.Provider
                  value={{
                    server,
                    channels,
                    members,
                    myRole: "admin",
                    badges: new Map(),
                    presence: new Map(),
                    health: "connected",
                    upsertChannel: () => {},
                    removeChannel: () => {},
                    roles: [],
                    memberRoles: new Map(),
                    reloadRoles: () => {},
                    emojis: new Map(),
                  }}
                >
                  <Fixture />
                </ServerContext.Provider>
              </MediaViewerProvider>
            </SettingsDialogProvider>
          </SocialContext.Provider>
        </CallProvider>
      </PresenceProvider>
    </MeProvider>
  </RuntimeConfigProvider>,
);
