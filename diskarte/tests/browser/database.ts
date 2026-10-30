import { createFakeSupabase } from "../fixtures/fake-supabase";
import {
  channels,
  makeMember,
  makeProfile,
  MEMBER_ID,
  MOD_ID,
  OWNER_ID,
  SERVER_ID,
  server,
} from "../fixtures/server";
export const people = [
  makeProfile(OWNER_ID, "Kapitan"),
  makeProfile(MOD_ID, "Maria"),
  makeProfile(MEMBER_ID, "Juan"),
];
export const members = [
  makeMember(OWNER_ID, "Kapitan", "admin"),
  makeMember(MOD_ID, "Maria", "moderator"),
  makeMember(MEMBER_ID, "Juan", "member"),
];
export const fake = createFakeSupabase({
  profiles: people,
  channels,
  workspace_documents: [
    {
      id: "70000000-0000-4000-8000-000000000001",
      server_id: SERVER_ID,
      channel_id: channels[0].id,
      kind: "note",
      title: "Weekend plans",
      content: { text: "Bring your ideas. We’ll make a plan together." },
      revision: 1,
      created_by: OWNER_ID,
      updated_by: OWNER_ID,
      updated_at: "2026-10-16T12:00:00Z",
    },
  ],
});
fake.client.rpc = (async (name: string) => ({
  data:
    name === "my_unreads"
      ? [
          {
            channel_id: channels[1].id,
            server_id: SERVER_ID,
            read_at: "2026-10-01T00:00:00Z",
            last_message_at: "2026-10-16T12:00:00Z",
            mentions: 2,
          },
        ]
      : name === "discover_servers"
        ? [
            {
              ...server,
              category: "gaming",
              member_count: 3,
              active_members: 2,
              is_member: true,
            },
          ]
        : name === "can_edit_workspace"
          ? true
          : null,
  error: null,
})) as typeof fake.client.rpc;
export const getBrowserClient = () => fake.client;
export type BrowserSupabase = ReturnType<typeof getBrowserClient>;
