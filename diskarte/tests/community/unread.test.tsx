import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { OWNER_ID, makeProfile } from "../fixtures/server";

const tables: Record<string, unknown[]> = {};
const fake = createFakeSupabase(tables);
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));

const { useConversations, latest } = await import("@/hooks/useSocial");
const { MeProvider } = await import("@/components/providers/MeProvider");
const { isUnread } = await import("@/lib/social");

const CONV = "60000000-0000-4000-8000-000000000001";
const FRIEND = "00000000-0000-4000-8000-0000000000f1";
const wrapper = ({ children }: { children: ReactNode }) => <MeProvider profile={makeProfile(OWNER_ID, "Kapitan")}>{children}</MeProvider>;

describe("unread conversations", () => {
  it("stays read after you've seen it, even when a reload races the read receipt or your clock runs behind", async () => {
    // The newest message is stamped a minute in this device's future (server clock ahead).
    const ahead = new Date(Date.now() + 60_000).toISOString();
    tables.dm_participants = [
      { conversation_id: CONV, user_id: OWNER_ID, last_read_at: "2026-10-01T00:00:00Z" },
      { conversation_id: CONV, user_id: FRIEND, last_read_at: "2026-10-01T00:00:00Z" },
    ];
    tables.dm_conversations = [{ id: CONV, kind: "direct", name: null, owner_id: null, created_at: "2026-10-01T00:00:00Z", last_message_at: ahead }];
    tables.profiles = [{ ...makeProfile(FRIEND, "Juan") }];
    const { result } = renderHook(() => useConversations(), { wrapper });
    await waitFor(() => expect(result.current.conversations?.[0] && isUnread(result.current.conversations[0])).toBe(true));

    act(() => result.current.markRead(CONV));
    expect(isUnread(result.current.conversations![0])).toBe(false);
    // A reload that still sees the old last_read_at (the receipt hasn't landed) keeps it read.
    await act(() => result.current.reload());
    expect(isUnread(result.current.conversations![0])).toBe(false);
  });

  it("picks the later timestamp", () => {
    expect(latest("2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z")).toBe("2026-10-02T00:00:00Z");
    expect(latest("2026-10-02T00:00:00Z", "2026-10-01T00:00:00Z")).toBe("2026-10-02T00:00:00Z");
    expect(latest("2026-10-02T00:00:00Z", undefined)).toBe("2026-10-02T00:00:00Z");
  });
});
