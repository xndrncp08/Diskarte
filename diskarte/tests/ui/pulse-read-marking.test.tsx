import { render, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { navigation } from "../mocks/navigation";

const fake = createFakeSupabase();
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));
vi.mock("@/actions/messages", async () => (await import("../mocks/actions")).messageActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { UnreadsProvider, useOptionalUnreads } = await import("@/components/providers/UnreadsProvider");
const { ChatView } = await import("@/components/chat/ChatView");
const { ShellKindContext } = await import("@/components/shell/ShellKind");
const { PresenceProvider } = await import("@/components/providers/PresenceProvider");
const { CallProvider } = await import("@/components/voice/CallProvider");
const { MEMBERS } = await import("../fixtures/layout");
const { OWNER_ID, ServerFixture, channels } = await import("../fixtures/server");

const EMPTY = { messages: [], reactions: [], hasMore: false };
const rpc = vi.mocked(fake.client.rpc);

function answer(unreads: { data: unknown; error: unknown }) {
  rpc.mockImplementation((async (fn: string) => (fn === "my_unreads" ? unreads : { data: null, error: null })) as never);
}

const marked = (channelId: string) => rpc.mock.calls.some(([fn, args]) => fn === "mark_channel_read_until" && (args as { p_channel?: string })?.p_channel === channelId);

beforeEach(() => {
  localStorage.removeItem("diskarte:pending-reads");
  rpc.mockClear();
  navigation.reset(`/tambayan/s/${channels[0].id}`);
});

describe("Pulse marks a channel read once the unread counts have loaded", () => {
  it("reports loaded after the first fetch, even when nothing is unread or the database can't answer", async () => {
    for (const unreads of [{ data: [], error: null }, { data: null, error: { message: "function my_unreads does not exist" } }]) {
      answer(unreads);
      const { result, unmount } = renderHook(() => useOptionalUnreads()!, {
        wrapper: ({ children }: { children: ReactNode }) => (
          <ServerFixture members={MEMBERS} meId={OWNER_ID}>
            <UnreadsProvider>{children}</UnreadsProvider>
          </ServerFixture>
        ),
      });
      expect(result.current.loaded).toBe(false);
      await waitFor(() => expect(result.current.loaded).toBe(true));
      expect(result.current.channels.size).toBe(0);
      unmount();
    }
  });

  it("marks the open channel read in Pulse when the unread map loads empty", async () => {
    answer({ data: [], error: null });
    render(
      <ShellKindContext.Provider value="pulse">
        <ServerFixture members={MEMBERS} meId={OWNER_ID}>
          <UnreadsProvider>
            <PresenceProvider>
              <CallProvider>
                <ChatView channel={channels[0]} initial={EMPTY} />
              </CallProvider>
            </PresenceProvider>
          </UnreadsProvider>
        </ServerFixture>
      </ShellKindContext.Provider>,
    );
    await waitFor(() => expect(marked(channels[0].id)).toBe(true), { timeout: 3000 });
  });
});
