import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { MEMBER_ID, OWNER_ID, SERVER_ID, ServerFixture, channels, makeMember, makeProfile } from "../fixtures/server";

const tables: Record<string, unknown[]> = {};
const fake = createFakeSupabase(tables);
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);
const messages = vi.hoisted(() => ({ sendMessageAction: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/actions/messages", () => messages);
vi.mock("@/actions/social", () => ({ sendDirectMessageAction: vi.fn(async () => ({ ok: true })) }));

const { ForwardDialog, forwardText } = await import("@/components/chat/ForwardDialog");
const { SavedMessages } = await import("@/components/workspace/SavedMessages");
const { UnreadsProvider, useOptionalUnreads, useChannelUnread } = await import("@/components/providers/UnreadsProvider");
const { MeProvider } = await import("@/components/providers/MeProvider");

const members = [makeMember(OWNER_ID, "Kapitan", "admin"), makeMember(MEMBER_ID, "Juan", "member")];

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  vi.mocked(fake.client.rpc).mockReset();
  vi.mocked(fake.client.rpc).mockImplementation((async () => ({ data: null, error: null })) as never);
});

describe("forward", () => {
  it("quotes the message with who wrote it and where", () => {
    expect(forwardText("hello\nworld", "Juan", "general")).toBe("> **Forwarded** from Juan in #general\n> hello\n> world");
    expect(forwardText("x".repeat(5000), "Juan", "general")).toHaveLength(4000);
  });

  it("sends it to the channel you pick", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ServerFixture members={members}>
        <ForwardDialog message={{ content: "Adobo tonight" }} author="Juan" sourceChannel="general" onClose={onClose} />
      </ServerFixture>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Forward to" });
    await user.type(within(dialog).getByLabelText("Search channels and DMs"), "chika");
    await user.click(within(dialog).getByRole("button", { name: /chika/ }));
    await waitFor(() => expect(messages.sendMessageAction).toHaveBeenCalledWith(expect.objectContaining({ channelId: channels[1].id, content: "> **Forwarded** from Juan in #general\n> Adobo tonight" })));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("mark unread", () => {
  it("makes a read channel unread again, even if a stale refresh arrives first", async () => {
    const at = "2026-10-12T10:00:00Z";
    vi.mocked(fake.client.rpc).mockImplementation((async (fn: string) =>
      fn === "my_unreads" ? { data: [{ channel_id: channels[0].id, server_id: SERVER_ID, last_message_at: "2026-10-12T11:00:00Z", read_at: "2026-10-12T11:00:00Z", mentions: 0 }], error: null } : { data: null, error: null }) as never);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MeProvider profile={makeProfile(OWNER_ID, "Kapitan")}>
        <UnreadsProvider>{children}</UnreadsProvider>
      </MeProvider>
    );
    const { result } = renderHook(() => ({ ctx: useOptionalUnreads()!, c: useChannelUnread(channels[0].id) }), { wrapper });
    await waitFor(() => expect(result.current.ctx.channels.size).toBe(1));
    expect(result.current.c.unread).toBe(false);
    act(() => result.current.ctx.markUnread(channels[0].id, at));
    expect(result.current.c.unread).toBe(true);
    await waitFor(() => expect(fake.client.rpc).toHaveBeenCalledWith("mark_channel_unread", { p_channel: channels[0].id, p_from: at }));
    await act(async () => result.current.ctx.refresh());
    expect(result.current.c.unread).toBe(true);
  });
});

describe("saved messages", () => {
  it("lists what you saved, newest first, linking to its channel, and skips ones you can't read any more", async () => {
    tables.saved_messages = [
      { message_id: "m2", saved_at: "2026-10-12T02:00:00Z" },
      { message_id: "gone", saved_at: "2026-10-12T01:30:00Z" },
      { message_id: "m1", saved_at: "2026-10-12T01:00:00Z" },
    ];
    tables.messages = [
      { id: "m1", content: "first", channel_id: channels[0].id, server_id: SERVER_ID, author_id: MEMBER_ID },
      { id: "m2", content: "second", channel_id: channels[1].id, server_id: SERVER_ID, author_id: OWNER_ID },
    ];
    tables.profiles = [makeProfile(MEMBER_ID, "Juan"), makeProfile(OWNER_ID, "Kapitan")];
    render(<SavedMessages onOpen={() => undefined} />);
    const list = await screen.findByRole("list", { name: "Saved messages" });
    const links = within(list).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Kapitansecond", "Juanfirst"]);
    expect(links[0]).toHaveAttribute("href", `/tambayan/${SERVER_ID}/${channels[1].id}`);
  });
});
