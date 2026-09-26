import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageWithAuthor } from "@/lib/messages";
import { createFakeSupabase } from "../../../tests/fixtures/fake-supabase";
import { MEMBER_ID, MOD_ID, OWNER_ID, ServerFixture, makeMember } from "../../../tests/fixtures/server";

const fake = createFakeSupabase();
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client }));
const sfx = vi.fn();
vi.mock("@/lib/sfx", () => ({ playSfx: (name: string) => sfx(name) }));
vi.mock("@/actions/messages", () => ({
  sendMessageAction: vi.fn(),
  editMessageAction: vi.fn(async () => ({ ok: true })),
  deleteMessageAction: vi.fn(async () => ({ ok: true })),
  setPinnedAction: vi.fn(async () => ({ ok: true })),
  toggleReactionAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const { useChannelChat, mentionsUser } = await import("@/hooks/useChannelChat");
const actions = await import("@/actions/messages");

const CHANNEL = "20000000-0000-4000-8000-000000000001";
const members = [makeMember(OWNER_ID, "Kapitan", "admin"), makeMember(MOD_ID, "Maria", "moderator"), makeMember(MEMBER_ID, "Juan", "member")];

function msg(id: string, author: string, content: string, at: string): MessageWithAuthor {
  return {
    id,
    channel_id: CHANNEL,
    server_id: "s",
    author_id: author,
    content,
    attachments: [],
    reply_to_id: null,
    pinned: false,
    pinned_at: null,
    pinned_by: null,
    edited_at: null,
    created_at: at,
    author: members.find((m) => m.user_id === author)!.profile,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <ServerFixture members={members} meId={OWNER_ID}>
    {children}
  </ServerFixture>
);

function setup() {
  return renderHook(() => useChannelChat(CHANNEL, { messages: [msg("m1", MOD_ID, "hello", "2026-09-26T01:00:00Z")], reactions: [], hasMore: false }), { wrapper });
}

beforeEach(() => {
  sfx.mockReset();
  vi.mocked(actions.sendMessageAction).mockReset();
});

describe("useChannelChat realtime", () => {
  it("appends inserts with the author resolved from the member list and plays an alert", async () => {
    const { result } = setup();
    act(() => fake.emitDb("messages", "INSERT", { ...msg("m2", MEMBER_ID, "hi @kapitan", "2026-09-26T01:01:00Z"), author: undefined }));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages[1].author?.display_name).toBe("Juan");
    expect(sfx).toHaveBeenCalledWith("mention");
  });

  it("ignores inserts for other channels", async () => {
    const { result } = setup();
    act(() => fake.emitDb("messages", "INSERT", { ...msg("x", MEMBER_ID, "elsewhere", "2026-09-26T01:02:00Z"), channel_id: "other" }));
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.messages.map((m) => m.id)).toEqual(["m1"]);
  });

  it("applies edits and deletes", async () => {
    const { result } = setup();
    act(() => fake.emitDb("messages", "UPDATE", { ...msg("m1", MOD_ID, "hello (edited)", "2026-09-26T01:00:00Z"), author: undefined, edited_at: "2026-09-26T01:05:00Z" }));
    await waitFor(() => expect(result.current.messages[0].content).toBe("hello (edited)"));
    expect(result.current.messages[0].author?.display_name).toBe("Maria");
    act(() => fake.emitDb("messages", "DELETE", { id: "m1" }));
    await waitFor(() => expect(result.current.messages).toHaveLength(0));
  });

  it("tracks reactions from realtime events", async () => {
    const { result } = setup();
    act(() => fake.emitDb("reactions", "INSERT", { message_id: "m1", user_id: MEMBER_ID, emoji: ":lodi:", channel_id: CHANNEL, server_id: "s", created_at: "2026-09-26T01:03:00Z" }));
    await waitFor(() => expect(result.current.reactions.get("m1")).toHaveLength(1));
    act(() => fake.emitDb("reactions", "DELETE", { message_id: "m1", user_id: MEMBER_ID, emoji: ":lodi:" }));
    await waitFor(() => expect(result.current.reactions.get("m1")).toHaveLength(0));
  });
});

describe("useChannelChat mutations", () => {
  it("sends optimistically with a client-generated id and dedupes the realtime echo", async () => {
    vi.mocked(actions.sendMessageAction).mockImplementation(async (input) => ({
      ok: true,
      data: { message: { ...msg(input.id as string, OWNER_ID, input.content as string, "2026-09-26T01:10:00Z") } },
    }));
    const { result } = setup();
    let ok = false;
    await act(async () => {
      ok = await result.current.send("mabuhay!");
    });
    expect(ok).toBe(true);
    const sent = result.current.messages.at(-1)!;
    expect(sent).toMatchObject({ content: "mabuhay!", author_id: OWNER_ID });
    expect(sent.pending).toBeUndefined();
    act(() => fake.emitDb("messages", "INSERT", { ...sent, author: undefined }));
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.messages.filter((m) => m.id === sent.id)).toHaveLength(1);
    expect(sfx).toHaveBeenCalledWith("send");
    expect(sfx).not.toHaveBeenCalledWith("message");
  });

  it("marks failed sends for retry", async () => {
    vi.mocked(actions.sendMessageAction).mockResolvedValue({ ok: false, error: "RATE" });
    const { result } = setup();
    await act(async () => {
      await result.current.send("spam");
    });
    expect(result.current.messages.at(-1)).toMatchObject({ content: "spam", failed: true });
    act(() => result.current.discard(result.current.messages.at(-1)!.id));
    expect(result.current.messages).toHaveLength(1);
  });

  it("toggles my reaction optimistically", async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.toggleReaction("m1", ":petmalu:");
    });
    expect(result.current.reactions.get("m1")?.[0]).toMatchObject({ user_id: OWNER_ID, emoji: ":petmalu:" });
    expect(actions.toggleReactionAction).toHaveBeenCalledWith({ messageId: "m1", emoji: ":petmalu:", on: true });
    await act(async () => {
      await result.current.toggleReaction("m1", ":petmalu:");
    });
    expect(result.current.reactions.get("m1")).toHaveLength(0);
  });

  it("pins and exposes the pinned list", async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.setPinned("m1", true);
    });
    expect(result.current.pinned.map((m) => m.id)).toEqual(["m1"]);
  });
});

describe("mentionsUser", () => {
  it("matches whole handles and @everyone", () => {
    expect(mentionsUser("hi @juan.tamad!", "juan.tamad")).toBe(true);
    expect(mentionsUser("email juan@x.ph", "x")).toBe(false);
    expect(mentionsUser("@juanito", "juan")).toBe(false);
    expect(mentionsUser("@everyone tara", "juan")).toBe(true);
  });
});
