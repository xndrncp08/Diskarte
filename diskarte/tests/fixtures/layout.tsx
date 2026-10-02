import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import { ChatView } from "@/components/chat/ChatView";
import { PresenceProvider } from "@/components/providers/PresenceProvider";
import { RuntimeConfigProvider } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { ChannelSidebar } from "@/components/server/ChannelSidebar";
import { DrawerPanel } from "@/components/shell/AppShell";
import { ServerRail } from "@/components/shell/ServerRail";
import { CallProvider } from "@/components/voice/CallProvider";
import { FloatingCallHUD } from "@/components/voice/FloatingCallHUD";
import { VoiceChannelView } from "@/components/voice/VoiceChannelView";
import type { MessageWithAuthor } from "@/lib/messages";
import { MEMBER_ID, MOD_ID, OWNER_ID, SERVER_ID, ServerFixture, makeChannel, makeMember, presenceFor, server } from "./server";

/**
 * The real shell (server rail, channel sidebar, active view) wired to fixtures, mirroring
 * app/(app)/tambayan/[serverId]/[channelId]/page.tsx. Test files provide the module mocks.
 */
export const CHANNELS = [
  makeChannel("20000000-0000-4000-8000-000000000001", "general", "text", 0),
  makeChannel("20000000-0000-4000-8000-000000000002", "chika", "text", 1),
  makeChannel("20000000-0000-4000-8000-000000000003", "lfg-valorant", "text", 2),
  makeChannel("20000000-0000-4000-8000-000000000004", "Tambayan 1", "voice", 3),
  makeChannel("20000000-0000-4000-8000-000000000005", "Chill & Music", "voice", 4),
];
export const [GENERAL, CHIKA, LFG, TAMBAYAN] = CHANNELS;

export const MEMBERS = [
  makeMember(OWNER_ID, "Kapitan", "admin"),
  makeMember(MOD_ID, "Maria", "moderator", { avatar_preset: "ube" }),
  makeMember(MEMBER_ID, "Juan", "member", { avatar_preset: "dagat" }),
];

export const RUNTIME = {
  supabaseUrl: "https://proj.supabase.co",
  supabaseAnonKey: "anon-key-that-is-long-enough",
  livekitUrl: "wss://proj.livekit.cloud",
  siteUrl: "http://localhost:3000",
};

/** What the tambayan layout hands the shell's Settings dialog for a password (email) account. */
export const ACCOUNT = { email: "kapitan@diskarte.ph", providers: ["email"] };

export const channelUrl = (id: string) => `/tambayan/${SERVER_ID}/${id}`;

function ChannelRoute({ history }: { history: Record<string, MessageWithAuthor[]> }) {
  const { channelId } = useParams<{ channelId?: string }>();
  const { channels } = useServer();
  const channel = channels.find((c) => c.id === channelId);
  if (!channel) return <p>Pumili ng channel</p>;
  return channel.type === "voice" ? (
    <VoiceChannelView channel={channel} />
  ) : (
    <ChatView key={channel.id} channel={channel} initial={{ messages: history[channel.id] ?? [], reactions: [], hasMore: false }} />
  );
}

export function DiskarteLayout({ children, history = {} }: { children?: ReactNode; history?: Record<string, MessageWithAuthor[]> }) {
  return (
    <RuntimeConfigProvider value={RUNTIME}>
      <ServerFixture members={MEMBERS} overrides={{ channels: CHANNELS }} presence={new Map([[MOD_ID, presenceFor(MOD_ID, { voice_channel_id: TAMBAYAN.id })]])}>
        <PresenceProvider>
          <CallProvider>
            <div className="flex h-dvh overflow-hidden" data-testid="shell">
              <div data-testid="rail-column">
                <ServerRail servers={[server]} />
              </div>
              <DrawerPanel>
                <ChannelSidebar />
              </DrawerPanel>
              <main data-testid="active-view" className="flex min-w-0 flex-1">
                <ChannelRoute history={history} />
              </main>
              <FloatingCallHUD />
              {children}
            </div>
          </CallProvider>
        </PresenceProvider>
      </ServerFixture>
    </RuntimeConfigProvider>
  );
}

/** A chat message fixture authored by one of MEMBERS. */
export function messageFixture(id: string, channelId: string, authorId: string, content: string, minutesAgo = 5): MessageWithAuthor {
  const author = MEMBERS.find((m) => m.user_id === authorId)!.profile;
  return {
    id,
    channel_id: channelId,
    server_id: SERVER_ID,
    author_id: authorId,
    content,
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
    created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    author,
  };
}
