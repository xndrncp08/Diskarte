import type { ReactNode } from "react";
import { MeProvider } from "@/components/providers/MeProvider";
import { ServerContext, type ServerContextValue } from "@/components/providers/ServerProvider";
import { ShellUIProvider } from "@/components/shell/ShellUI";
import type { PresencePayload } from "@/lib/presence";
import type { Channel, MemberWithProfile, Server } from "@/lib/servers";
import type { MemberRole, Tables } from "@/lib/supabase/database.types";

export const OWNER_ID = "00000000-0000-4000-8000-00000000000a";
export const MOD_ID = "00000000-0000-4000-8000-00000000000b";
export const MEMBER_ID = "00000000-0000-4000-8000-00000000000c";
export const SERVER_ID = "10000000-0000-4000-8000-000000000001";

export function makeProfile(id: string, name: string, extra: Partial<Tables<"profiles">> = {}): Tables<"profiles"> {
  return {
    id,
    username: name.toLowerCase(),
    display_name: name,
    avatar_preset: "araw",
    avatar_url: null,
    banner_preset: "paglubog",
    banner_url: null,
    bio: "",
    status: "online",
    custom_status: null,
    custom_status_emoji: null,
    onboarded: true,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...extra,
  };
}

export function makeMember(id: string, name: string, role: MemberRole, extra: Partial<Tables<"profiles">> = {}): MemberWithProfile {
  return { server_id: SERVER_ID, user_id: id, role, nickname: null, joined_at: "2026-09-01T00:00:00Z", profile: makeProfile(id, name, extra) };
}

export const server: Server = {
  id: SERVER_ID,
  name: "Barkada HQ",
  description: "Tambayan ng tropa",
  icon_url: null,
  owner_id: OWNER_ID,
  invite_code: "ABCDEFGH23",
  automod_enabled: true,
  automod_categories: ["hate", "phishing", "spam"],
  automod_custom_terms: [],
  gcash_number: null,
  maya_number: null,
  support_note: "",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

export function makeChannel(id: string, name: string, type: "text" | "voice", position: number, category = type === "text" ? "Text Channels" : "Voice Channels"): Channel {
  return { id, server_id: SERVER_ID, name, type, category, topic: "", position, slowmode_seconds: 0, requires_verification: false, created_at: "2026-09-01T00:00:00Z" };
}

export const channels: Channel[] = [
  makeChannel("20000000-0000-4000-8000-000000000001", "general", "text", 0),
  makeChannel("20000000-0000-4000-8000-000000000002", "chika", "text", 1),
  makeChannel("20000000-0000-4000-8000-000000000003", "Tambayan 1", "voice", 2),
];

export function presenceFor(userId: string, extra: Partial<PresencePayload> = {}): PresencePayload {
  return {
    user_id: userId,
    status: "online",
    custom_status: null,
    custom_status_emoji: null,
    voice_channel_id: null,
    muted: false,
    deafened: false,
    video: false,
    screen: false,
    online_at: "2026-09-26T00:00:00Z",
    ...extra,
  };
}

export function ServerFixture({
  children,
  meId = OWNER_ID,
  members,
  presence = new Map(),
  myRole = "admin",
  overrides = {},
}: {
  children: ReactNode;
  meId?: string;
  members: MemberWithProfile[];
  presence?: Map<string, PresencePayload>;
  myRole?: MemberRole;
  overrides?: Partial<ServerContextValue>;
}) {
  const me = members.find((m) => m.user_id === meId)?.profile ?? makeProfile(meId, "Me");
  const value: ServerContextValue = {
    server,
    channels,
    members,
    myRole,
    presence,
    health: "connected",
    upsertChannel: () => undefined,
    removeChannel: () => undefined,
    ...overrides,
  };
  return (
    <MeProvider profile={me}>
      <ShellUIProvider>
        <ServerContext.Provider value={value}>{children}</ServerContext.Provider>
      </ShellUIProvider>
    </MeProvider>
  );
}
