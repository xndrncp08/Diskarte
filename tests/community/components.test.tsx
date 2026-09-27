import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageWithAuthor } from "@/lib/messages";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { MEMBER_ID, MOD_ID, OWNER_ID, SERVER_ID, ServerFixture, makeMember, makeProfile } from "../fixtures/server";

const CHANNEL = "20000000-0000-4000-8000-000000000001";
const VOICE = "20000000-0000-4000-8000-000000000003";
const members = [makeMember(OWNER_ID, "Kapitan", "admin"), makeMember(MOD_ID, "Maria", "moderator"), makeMember(MEMBER_ID, "Juan", "member")];

const tables: Record<string, unknown[]> = {};
let fake = createFakeSupabase(tables);
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));
vi.mock("@/lib/sfx", async (orig) => ({ ...(await orig<typeof import("@/lib/sfx")>()), playSfx: vi.fn(), playCue: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("@/actions/messages", () => ({
  sendMessageAction: vi.fn(),
  editMessageAction: vi.fn(async () => ({ ok: true })),
  deleteMessageAction: vi.fn(async () => ({ ok: true })),
  setPinnedAction: vi.fn(async () => ({ ok: true })),
  toggleReactionAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/actions/moderation", () => ({
  updateAutomodAction: vi.fn(async () => ({ ok: true })),
  updateSupportAction: vi.fn(async () => ({ ok: true })),
  banMemberAction: vi.fn(async () => ({ ok: true })),
  unbanMemberAction: vi.fn(async () => ({ ok: true })),
  setBadgeAction: vi.fn(async () => ({ ok: true })),
  addSoundboardClipAction: vi.fn(async () => ({ ok: true })),
  removeSoundboardClipAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/actions/lfg", () => ({
  createLfgAction: vi.fn(async () => ({ ok: true, data: { beaconId: "b" } })),
  joinLfgAction: vi.fn(async () => ({ ok: true, data: { voiceChannelId: "20000000-0000-4000-8000-000000000003" } })),
  leaveLfgAction: vi.fn(async () => ({ ok: true })),
  closeLfgAction: vi.fn(async () => ({ ok: true })),
}));
const social = {
  friends: [] as { userId: string; status: "accepted" | "incoming" | "outgoing"; since: string }[],
  blocked: [] as string[],
  profiles: new Map(),
  conversations: [] as unknown[],
  reload: vi.fn(async () => undefined),
  reloadConversations: vi.fn(async () => undefined),
  markRead: vi.fn(),
  attention: 0,
};
vi.mock("@/components/providers/SocialProvider", () => ({ useSocial: () => social, useOptionalSocial: () => social }));
vi.mock("@/actions/social", () => ({
  sendFriendRequestAction: vi.fn(async () => ({ ok: true, data: { status: "pending" } })),
  respondFriendRequestAction: vi.fn(async () => ({ ok: true })),
  removeFriendAction: vi.fn(async () => ({ ok: true })),
  blockUserAction: vi.fn(async () => ({ ok: true })),
  openDmAction: vi.fn(async () => ({ ok: true, data: { conversationId: "c" } })),
  createGroupDmAction: vi.fn(async () => ({ ok: true, data: { conversationId: "g" } })),
}));

const messageActions = await import("@/actions/messages");
const moderationActions = await import("@/actions/moderation");
const lfgActions = await import("@/actions/lfg");
const socialActions = await import("@/actions/social");
const { useChannelChat } = await import("@/hooks/useChannelChat");
const { Composer } = await import("@/components/chat/Composer");
const { MessageItem } = await import("@/components/chat/MessageItem");
const { OfflineBanner } = await import("@/components/chat/OfflineBanner");
const { LfgBoard } = await import("@/components/community/LfgBoard");
const { ServerSettingsDialog } = await import("@/components/server/ServerSettingsDialog");
const { MemberList } = await import("@/components/server/MemberList");
const { FriendsView } = await import("@/components/social/FriendsView");
const { TicTacToeBoard } = await import("@/components/voice/live/activities/TicTacToeBoard");
const { CallContext } = await import("@/components/voice/CallProvider");
const { newTicTacToe } = await import("@/lib/games/tictactoe");

function msg(id: string, extra: Partial<MessageWithAuthor> = {}): MessageWithAuthor {
  return {
    id,
    channel_id: CHANNEL,
    server_id: SERVER_ID,
    author_id: MOD_ID,
    content: "hello",
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
    created_at: "2026-09-27T01:00:00Z",
    author: members[1].profile,
    ...extra,
  };
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}

function wrap(meId = OWNER_ID, myRole: "admin" | "moderator" | "member" = "admin") {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ServerFixture members={members} meId={meId} myRole={myRole}>
        {children}
      </ServerFixture>
    );
  };
}

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  fake = createFakeSupabase(tables);
  localStorage.clear();
  setOnline(true);
  vi.mocked(messageActions.sendMessageAction).mockReset();
  vi.clearAllMocks();
});

// =============================================================================================
describe("offline queue & slow mode (useChannelChat)", () => {
  const initial = { messages: [msg("m1")], reactions: [], hasMore: false };

  it("queues messages while offline, persists them, and syncs on reconnect", async () => {
    const { result } = renderHook(() => useChannelChat(CHANNEL, initial), { wrapper: wrap() });
    act(() => setOnline(false));
    let outcome = "";
    await act(async () => {
      outcome = await result.current.send("pag-online na");
    });
    expect(outcome).toBe("queued");
    expect(result.current.queuedCount).toBe(1);
    expect(JSON.parse(localStorage.getItem("diskarte:outbox")!)).toHaveLength(1);
    expect(messageActions.sendMessageAction).not.toHaveBeenCalled();

    vi.mocked(messageActions.sendMessageAction).mockImplementation(async (input) => ({ ok: true, data: { message: msg(input.id as string, { author_id: OWNER_ID, content: input.content as string }) } }));
    await act(async () => setOnline(true));
    await waitFor(() => expect(result.current.queuedCount).toBe(0));
    expect(messageActions.sendMessageAction).toHaveBeenCalledWith(expect.objectContaining({ content: "pag-online na" }));
    expect(localStorage.getItem("diskarte:outbox")).toBeNull();
  });

  it("falls back to the queue when the network drops mid-send", async () => {
    vi.mocked(messageActions.sendMessageAction).mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useChannelChat(CHANNEL, initial), { wrapper: wrap() });
    let outcome = "";
    await act(async () => {
      outcome = await result.current.send("hello?");
    });
    expect(outcome).toBe("queued");
    expect(result.current.messages.at(-1)).toMatchObject({ queued: true, content: "hello?" });
  });

  it("restores the draft on a slow mode refusal and starts the cooldown", async () => {
    vi.mocked(messageActions.sendMessageAction).mockResolvedValue({ ok: false, error: "Slow mode", code: "SLOWMODE", retryAfter: 9 });
    const { result } = renderHook(() => useChannelChat(CHANNEL, initial, { slowmodeSeconds: 10 }), { wrapper: wrap() });
    let outcome = "";
    await act(async () => {
      outcome = await result.current.send("mabilis");
    });
    expect(outcome).toBe("rejected");
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.cooldownUntil).toBeGreaterThan(Date.now() + 8000);
  });

  it("keeps thread replies out of the channel and in their thread", async () => {
    const channel = renderHook(() => useChannelChat(CHANNEL, initial), { wrapper: wrap() });
    const thread = renderHook(() => useChannelChat(CHANNEL, { messages: [], reactions: [], hasMore: false }, { threadId: "m1" }), { wrapper: wrap() });
    act(() => fake.emitDb("messages", "INSERT", { ...msg("r1", { thread_id: "m1" }), author: undefined }));
    await waitFor(() => expect(thread.result.current.messages.map((m) => m.id)).toEqual(["r1"]));
    expect(channel.result.current.messages.map((m) => m.id)).toEqual(["m1"]);
  });
});

// =============================================================================================
describe("composer & message rendering", () => {
  const base = {
    channelName: "general",
    serverId: SERVER_ID,
    channelId: CHANNEL,
    replyTo: null,
    onCancelReply: () => undefined,
    onSend: vi.fn(async () => "sent" as const),
    onEditLast: () => undefined,
    typingNames: [],
    onTyping: () => undefined,
    onStopTyping: () => undefined,
  };

  it("shows the slow mode countdown and blocks sending until it ends", async () => {
    render(<Composer {...base} slowmodeSeconds={10} cooldownUntil={Date.now() + 5000} />, { wrapper: wrap(MEMBER_ID, "member") });
    expect(screen.getByTestId("slowmode-indicator")).toHaveTextContent(/Slow mode: [45]s/);
    await userEvent.type(screen.getByTestId("composer"), "hi");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("gives the draft back when a send is rejected", async () => {
    const onSend = vi.fn(async () => "rejected" as const);
    render(<Composer {...base} onSend={onSend} />, { wrapper: wrap() });
    const box = screen.getByTestId("composer");
    await userEvent.type(box, "may link na scam{Enter}");
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    await waitFor(() => expect(box).toHaveValue("may link na scam"));
  });

  it("replaces the input with a notice in verification-gated channels", () => {
    render(<Composer {...base} locked="Verified accounts lang" />, { wrapper: wrap() });
    expect(screen.getByTestId("composer-locked")).toHaveTextContent("Verified accounts lang");
    expect(screen.queryByTestId("composer")).toBeNull();
  });

  it("sends stickers from the picker; DMs have no attach button", async () => {
    const user = userEvent.setup();
    const onSticker = vi.fn();
    render(<Composer {...base} serverId={undefined} onSticker={onSticker} />, { wrapper: wrap() });
    expect(screen.queryByRole("button", { name: "Attach files" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Send a sticker" }));
    const picker = await screen.findByRole("dialog", { name: "Stickers" });
    await user.click(within(picker).getByRole("tab", { name: /Tambayan Classics/ }));
    await user.click(within(picker).getByRole("button", { name: "Jeepney" }));
    expect(onSticker).toHaveBeenCalledWith("jeepney");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Stickers" })).toBeNull());
  });

  it("renders stickers, thread chips and queued state on messages", async () => {
    const onOpenThread = vi.fn();
    const onDiscard = vi.fn();
    const actions = { onReply: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onRetry: vi.fn(), onDiscard, onJump: vi.fn(), onOpenThread, nameOf: () => "x" };
    const root = { ...msg("t1", { content: "Best lugaw?", thread_reply_count: 3, thread_last_reply_at: "2026-09-27T02:00:00Z" }) };
    const { rerender } = render(
      <MessageItem message={root} grouped={false} replyTo={undefined} reactions={[]} meId={OWNER_ID} canModerate mentioned={false} editing={false} setEditing={() => undefined} actions={actions} />,
      { wrapper: wrap() },
    );
    await userEvent.click(screen.getByTestId("thread-chip"));
    expect(screen.getByTestId("thread-chip")).toHaveTextContent("3 replies");
    expect(onOpenThread).toHaveBeenCalledWith(root);

    rerender(
      <MessageItem
        message={{ ...msg("s1", { content: "", sticker: "sana-all", author_id: OWNER_ID }), queued: true }}
        grouped={false}
        replyTo={undefined}
        reactions={[]}
        meId={OWNER_ID}
        canModerate
        mentioned={false}
        editing={false}
        setEditing={() => undefined}
        actions={actions}
      />,
    );
    expect(screen.getByRole("img", { name: "Sticker: Sana All" })).toBeInTheDocument();
    expect(screen.getByText(/Naka-queue/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDiscard).toHaveBeenCalledWith("s1");
  });

  it("shows the 8-bit offline banner", () => {
    setOnline(false);
    render(<OfflineBanner queued={2} />);
    expect(screen.getByTestId("offline-banner")).toHaveTextContent("OFFLINE — 2 MESSAGES NAKA-QUEUE");
  });
});

// =============================================================================================
describe("LFG board", () => {
  it("lists live beacons and joins a party in one click, hopping into voice", async () => {
    const join = vi.fn(async () => undefined);
    tables.lfg_beacons = [
      { id: "b1", server_id: SERVER_ID, author_id: MOD_ID, game: "Valorant", description: "Need 2, Gold+", party_size: 5, voice_channel_id: VOICE, status: "open", expires_at: "2999-01-01T00:00:00Z", created_at: "2026-09-27T00:00:00Z" },
      { id: "b2", server_id: SERVER_ID, author_id: MOD_ID, game: "Dota", description: "", party_size: 5, voice_channel_id: null, status: "closed", expires_at: "2999-01-01T00:00:00Z", created_at: "2026-09-27T00:00:00Z" },
    ];
    tables.lfg_party_members = [{ beacon_id: "b1", server_id: SERVER_ID, user_id: MOD_ID, joined_at: "2026-09-27T00:00:00Z" }];
    const call = { join, status: "idle", target: null } as unknown as import("@/components/voice/CallProvider").CallContextValue;
    render(
      <CallContext.Provider value={call}>
        <LfgBoard />
      </CallContext.Provider>,
      { wrapper: wrap(MEMBER_ID, "member") },
    );
    const beacon = await screen.findByTestId("lfg-beacon");
    expect(screen.getAllByTestId("lfg-beacon")).toHaveLength(1);
    expect(beacon).toHaveTextContent("Valorant");
    expect(within(beacon).getByLabelText("1 of 5 in party")).toBeInTheDocument();
    await userEvent.click(within(beacon).getByRole("button", { name: "Join Party" }));
    await waitFor(() => expect(lfgActions.joinLfgAction).toHaveBeenCalledWith({ beaconId: "b1" }));
    await waitFor(() => expect(join).toHaveBeenCalledWith(expect.objectContaining({ channelId: VOICE, channelName: "Tambayan 1" })));
  });
});

// =============================================================================================
describe("Bantay-Bayan settings", () => {
  it("shows moderators only the audit log and bans", async () => {
    tables.audit_logs = [{ id: 1, server_id: SERVER_ID, actor_id: MOD_ID, action: "member.kick", target_type: "member", target_id: MEMBER_ID, metadata: {}, created_at: "2026-09-27T00:00:00Z" }];
    render(<ServerSettingsDialog open onClose={() => undefined} initialTab="overview" />, { wrapper: wrap(MOD_ID, "moderator") });
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Audit log", "Bans"]);
    expect(await screen.findByText("Maria kicked Juan")).toBeInTheDocument();
  });

  it("lets admins configure auto-mod", async () => {
    const user = userEvent.setup();
    render(<ServerSettingsDialog open onClose={() => undefined} initialTab="automod" />, { wrapper: wrap() });
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    await user.click(screen.getByRole("switch", { name: "Explicit content" }));
    await user.type(screen.getByLabelText("Custom blocked words"), "scam{Enter}benta account");
    await user.click(screen.getByRole("button", { name: "I-save" }));
    await waitFor(() =>
      expect(moderationActions.updateAutomodAction).toHaveBeenCalledWith({
        serverId: SERVER_ID,
        enabled: true,
        categories: ["hate", "phishing", "spam", "explicit"],
        customTerms: ["scam", "benta account"],
      }),
    );
  });

  it("lets admins grant supporter badges and moderators ban with a reason", async () => {
    const user = userEvent.setup();
    render(<MemberList />, { wrapper: wrap() });
    await user.click(screen.getAllByTestId("member-row").find((r) => r.textContent?.includes("Juan"))!);
    const card = await screen.findByRole("dialog", { name: "Juan's profile" });
    await user.click(within(card).getByRole("button", { name: /Server Booster/ }));
    await waitFor(() => expect(moderationActions.setBadgeAction).toHaveBeenCalledWith({ serverId: SERVER_ID, userId: MEMBER_ID, badge: "booster", on: true }));
    await user.click(within(card).getByRole("button", { name: /Ban from tambayan/ }));
    await user.type(within(card).getByLabelText(/Reason/), "scam links");
    await user.click(within(card).getByRole("button", { name: "Confirm ban" }));
    await waitFor(() => expect(moderationActions.banMemberAction).toHaveBeenCalledWith({ serverId: SERVER_ID, userId: MEMBER_ID, reason: "scam links" }));
  });
});

// =============================================================================================
describe("friends", () => {
  it("sends a friend request by @username and accepts incoming ones", async () => {
    const user = userEvent.setup();
    social.friends = [{ userId: MOD_ID, status: "incoming", since: "2026-09-27T00:00:00Z" }];
    social.profiles = new Map([[MOD_ID, makeProfile(MOD_ID, "Maria")]]);
    const idle = { status: "idle", target: null } as unknown as import("@/components/voice/CallProvider").CallContextValue;
    render(
      <CallContext.Provider value={idle}>
        <FriendsView servers={[]} />
      </CallContext.Provider>,
      { wrapper: wrap() },
    );
    await user.click(screen.getByRole("tab", { name: /Add Friend/ }));
    await user.type(screen.getByLabelText("Username"), "@juan");
    await user.click(screen.getByRole("button", { name: /Send/ }));
    await waitFor(() => expect(socialActions.sendFriendRequestAction).toHaveBeenCalledWith({ username: "@juan" }));

    await user.click(screen.getByRole("tab", { name: /Pending/ }));
    const row = screen.getByTestId("friend-row");
    expect(row).toHaveTextContent("Maria");
    await user.click(within(row).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(socialActions.respondFriendRequestAction).toHaveBeenCalledWith({ userId: MOD_ID, accept: true }));
  });
});

// =============================================================================================
describe("voice activities", () => {
  it("plays tic-tac-toe moves only on your turn", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const game = { ...newTicTacToe("me"), players: { X: "me", O: "them" } };
    const { rerender } = render(<TicTacToeBoard game={game} me="me" nameOf={(id) => id ?? "—"} onChange={onChange} />);
    await user.click(screen.getByRole("gridcell", { name: "Row 2, column 2: empty" }));
    expect(onChange.mock.calls[0][0].board[4]).toBe("X");
    rerender(<TicTacToeBoard game={onChange.mock.calls[0][0]} me="me" nameOf={(id) => id ?? "—"} onChange={onChange} />);
    expect(screen.getByRole("status")).toHaveTextContent("Turn ni them (O)");
    expect(screen.getByRole("gridcell", { name: "Row 1, column 1: empty" })).toBeDisabled();
  });
});
