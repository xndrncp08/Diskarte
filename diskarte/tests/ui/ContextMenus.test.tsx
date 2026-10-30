import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { navigation } from "../mocks/navigation";

const social = vi.hoisted(() => ({
  sendFriendRequestAction: vi.fn(async () => ({ ok: true, data: { status: "pending" } })),
  respondFriendRequestAction: vi.fn(async () => ({ ok: true })),
  removeFriendAction: vi.fn(async () => ({ ok: true })),
  blockUserAction: vi.fn(async () => ({ ok: true })),
  openDmAction: vi.fn(async () => ({ ok: true, data: { conversationId: "30000000-0000-4000-8000-000000000001" } })),
  leaveDmAction: vi.fn(async () => ({ ok: true })),
  createGroupDmAction: vi.fn(),
  sendDirectMessageAction: vi.fn(async () => ({ ok: true })),
}));
const moderation = vi.hoisted(() => ({ banMemberAction: vi.fn(async () => ({ ok: true })), setBadgeAction: vi.fn(async () => ({ ok: true })) }));

vi.mock("@/actions/social", () => social);
vi.mock("@/actions/moderation", () => moderation);
vi.mock("@/actions/servers", async () => (await import("../mocks/actions")).serverActions);
vi.mock("@/actions/messages", async () => (await import("../mocks/actions")).messageActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);
const voiceActions = vi.hoisted(() => ({ moderateVoiceAction: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/actions/voice", () => voiceActions);

const { serverActions } = await import("../mocks/actions");
const { MemberList } = await import("@/components/server/MemberList");
const { ChannelSidebar } = await import("@/components/server/ChannelSidebar");
const { ServerRail } = await import("@/components/shell/ServerRail");
const { MessageItem } = await import("@/components/chat/MessageItem");
const { SocialContext } = await import("@/components/providers/SocialProvider");
const { ConfirmHost } = await import("@/components/ui/ConfirmHost");
const { RuntimeConfigProvider } = await import("@/components/providers/RuntimeConfig");
const { PresenceProvider } = await import("@/components/providers/PresenceProvider");
const { CallProvider } = await import("@/components/voice/CallProvider");
const { MEMBERS, RUNTIME, GENERAL, CHANNELS } = await import("../fixtures/layout");
const { MEMBER_ID, MOD_ID, OWNER_ID, SERVER_ID, ServerFixture, presenceFor, server } = await import("../fixtures/server");

type SocialValue = NonNullable<React.ContextType<typeof SocialContext>>;
type FriendEntry = NonNullable<SocialValue["friends"]>[number];

const setFriendNickname = vi.fn(async () => true);

function Social({ friends = [], blocked = [], profiles = new Map(), children }: { friends?: FriendEntry[]; blocked?: string[]; profiles?: SocialValue["profiles"]; children: ReactNode }) {
  const value: SocialValue = {
    friends,
    blocked,
    profiles,
    reload: async () => undefined,
    conversations: [],
    reloadConversations: async () => undefined,
    markRead: () => undefined,
    attention: 0,
    nicknames: new Map(),
    setNickname: setFriendNickname,
    favourites: new Set<string>(),
    setFavourite: async () => true,
  };
  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

function Shell({
  meId = OWNER_ID,
  role = "admin",
  friends,
  blocked,
  profiles,
  presence,
  children,
}: {
  presence?: Map<string, ReturnType<typeof presenceFor>>;
  meId?: string;
  role?: "admin" | "moderator" | "member";
  friends?: FriendEntry[];
  blocked?: string[];
  profiles?: SocialValue["profiles"];
  children: ReactNode;
}) {
  return (
    <RuntimeConfigProvider value={RUNTIME}>
      <ServerFixture members={MEMBERS} meId={meId} myRole={role} presence={presence} overrides={{ channels: CHANNELS, roles: [TROPA], memberRoles: new Map([[MOD_ID, [TROPA.id]]]) }}>
        <PresenceProvider>
          <CallProvider>
            <Social friends={friends} blocked={blocked} profiles={profiles}>
              {children}
              <ConfirmHost />
            </Social>
          </CallProvider>
        </PresenceProvider>
      </ServerFixture>
    </RuntimeConfigProvider>
  );
}

const TROPA = { id: "50000000-0000-4000-8000-000000000002", server_id: SERVER_ID, name: "Tropa", color: "#4ade80", position: 0, created_at: "2026-10-01T00:00:00Z" };

const row = (name: string) => screen.getAllByTestId("member-row").find((r) => r.textContent?.includes(name))!;
const openMenu = (el: Element) => fireEvent.contextMenu(el, { clientX: 20, clientY: 20 });
const item = (name: string | RegExp) => screen.getByRole("menuitem", { name });
const since = "2026-09-01T00:00:00Z";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  navigation.reset(`/tambayan/${SERVER_ID}/${GENERAL.id}`);
});

describe("Add Friend from a server", () => {
  it("sends a friend request from a member's profile card", async () => {
    render(
      <Shell meId={MEMBER_ID} role="member">
        <MemberList />
      </Shell>,
    );
    fireEvent.click(row("Maria"));
    const card = await screen.findByRole("dialog", { name: "Maria's profile" });
    fireEvent.click(within(card).getByRole("button", { name: /Add Friend/ }));
    await waitFor(() => expect(social.sendFriendRequestAction).toHaveBeenCalledWith({ username: "maria" }));
  });

  it("offers to cancel a request already sent, and hides the control on your own card", async () => {
    render(
      <Shell meId={MEMBER_ID} role="member" friends={[{ userId: MOD_ID, status: "outgoing", since }]}>
        <MemberList />
      </Shell>,
    );
    fireEvent.click(row("Maria"));
    const card = await screen.findByRole("dialog", { name: "Maria's profile" });
    fireEvent.click(within(card).getByRole("button", { name: /Cancel request/ }));
    await waitFor(() => expect(social.removeFriendAction).toHaveBeenCalledWith({ userId: MOD_ID }));

    fireEvent.click(row("Juan"));
    const mine = await screen.findByRole("dialog", { name: "Juan's profile" });
    expect(within(mine).queryByTestId("friend-button")).toBeNull();
  });
});

describe("Right-click a person", () => {
  it("adds a friend and copies the username for a regular member, with no moderation tools", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <Shell meId={MEMBER_ID} role="member">
        <MemberList />
      </Shell>,
    );
    openMenu(row("Maria"));
    expect(screen.getByRole("menu", { name: "Maria options" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Kick/ })).toBeNull();
    expect(screen.queryByRole("group", { name: "Role" })).toBeNull();
    fireEvent.click(item("Add Friend"));
    await waitFor(() => expect(social.sendFriendRequestAction).toHaveBeenCalledWith({ username: "maria" }));

    openMenu(row("Maria"));
    fireEvent.click(item("Copy username"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("@maria"));
  });

  it("shows the right friend action for each relationship", async () => {
    const { unmount } = render(
      <Shell meId={MEMBER_ID} role="member" friends={[{ userId: MOD_ID, status: "incoming", since }, { userId: OWNER_ID, status: "accepted", since }]}>
        <MemberList />
      </Shell>,
    );
    openMenu(row("Maria"));
    fireEvent.click(item("Accept friend request"));
    await waitFor(() => expect(social.respondFriendRequestAction).toHaveBeenCalledWith({ userId: MOD_ID, accept: true }));

    openMenu(row("Kapitan"));
    expect(screen.queryByRole("menuitem", { name: "Add Friend" })).toBeNull();
    fireEvent.click(item("Remove Friend"));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Remove Kapitan as a friend?" })).getByRole("button", { name: "Remove Friend" }));
    await waitFor(() => expect(social.removeFriendAction).toHaveBeenCalledWith({ userId: OWNER_ID }));
    unmount();

    render(
      <Shell meId={MEMBER_ID} role="member" blocked={[MOD_ID]}>
        <MemberList />
      </Shell>,
    );
    openMenu(row("Maria"));
    expect(screen.queryByRole("menuitem", { name: "Message" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Add Friend" })).toBeNull();
    fireEvent.click(item("Unblock"));
    await waitFor(() => expect(social.blockUserAction).toHaveBeenCalledWith({ userId: MOD_ID, block: false }));
  });

  it("never offers to friend, message or block yourself", () => {
    render(
      <Shell meId={MEMBER_ID} role="member">
        <MemberList />
      </Shell>,
    );
    openMenu(row("Juan"));
    for (const name of ["Add Friend", "Message", "Block"]) expect(screen.queryByRole("menuitem", { name })).toBeNull();
    expect(item("Profile")).toBeInTheDocument();
  });

  it("renames yourself in the server, and gives friends a private nickname", async () => {
    render(
      <Shell meId={MEMBER_ID} role="member" friends={[{ userId: OWNER_ID, status: "accepted", since }]}>
        <MemberList />
      </Shell>,
    );
    openMenu(row("Maria"));
    expect(screen.queryByRole("menuitem", { name: "Change nickname" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /friend nickname/ })).toBeNull();

    openMenu(row("Juan"));
    fireEvent.click(item("Change nickname"));
    let dialog = await screen.findByRole("dialog", { name: "Change your nickname" });
    fireEvent.change(within(dialog).getByLabelText("Server nickname"), { target: { value: "Juanito" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(serverActions.setNicknameAction).toHaveBeenCalledWith({ serverId: SERVER_ID, userId: MEMBER_ID, nickname: "Juanito" }));

    openMenu(row("Kapitan"));
    fireEvent.click(item("Add friend nickname"));
    dialog = await screen.findByRole("dialog", { name: "Nickname for Kapitan" });
    fireEvent.change(within(dialog).getByLabelText("Friend nickname"), { target: { value: "Kap" } });
    // The shared confirm button holds its spinner briefly after the previous save.
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled());
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(setFriendNickname).toHaveBeenCalledWith(OWNER_ID, "Kap"));
  });

  it("lets admins hand out and take back custom roles; members don't see them", async () => {
    const { unmount } = render(
      <Shell>
        <MemberList />
      </Shell>,
    );
    openMenu(row("Juan"));
    const tropa = screen.getByRole("menuitemcheckbox", { name: /Tropa/ });
    expect(tropa).toHaveAttribute("aria-checked", "false");
    fireEvent.click(tropa);
    await waitFor(() => expect(serverActions.assignRoleAction).toHaveBeenCalledWith({ serverId: SERVER_ID, userId: MEMBER_ID, roleId: TROPA.id, assigned: true }));
    openMenu(row("Maria"));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Tropa/ }));
    await waitFor(() => expect(serverActions.assignRoleAction).toHaveBeenCalledWith({ serverId: SERVER_ID, userId: MOD_ID, roleId: TROPA.id, assigned: false }));
    unmount();

    render(
      <Shell meId={MEMBER_ID} role="member">
        <MemberList />
      </Shell>,
    );
    openMenu(row("Maria"));
    expect(screen.queryByRole("menuitemcheckbox", { name: /Tropa/ })).toBeNull();
  });

  it("mentions someone in the chat box", () => {
    const heard = vi.fn();
    window.addEventListener("diskarte:mention", (e) => heard((e as CustomEvent).detail));
    render(
      <Shell meId={MEMBER_ID} role="member">
        <MemberList />
      </Shell>,
    );
    openMenu(row("Maria"));
    fireEvent.click(item("Mention"));
    expect(heard).toHaveBeenCalledWith("maria");
  });

  it("gives moderators Server Mute, Disconnect and Move to for someone in voice", async () => {
    const voice = CHANNELS.find((c) => c.type === "voice")!;
    const other = CHANNELS.filter((c) => c.type === "voice")[1];
    render(
      <Shell presence={new Map([[MEMBER_ID, presenceFor(MEMBER_ID, { voice_channel_id: voice.id })]])}>
        <MemberList />
      </Shell>,
    );
    openMenu(row("Juan"));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Server Mute/ }));
    await waitFor(() => expect(voiceActions.moderateVoiceAction).toHaveBeenCalledWith({ channelId: voice.id, userId: MEMBER_ID, action: "mute", toChannelId: undefined }));
    openMenu(row("Juan"));
    fireEvent.click(within(screen.getByRole("group", { name: "Move to" })).getByRole("menuitem", { name: other.name }));
    await waitFor(() => expect(voiceActions.moderateVoiceAction).toHaveBeenCalledWith({ channelId: voice.id, userId: MEMBER_ID, action: "move", toChannelId: other.id }));
    // Not for someone who isn't in voice, and never for regular members.
    openMenu(row("Maria"));
    expect(screen.queryByRole("menuitemcheckbox", { name: /Server Mute/ })).toBeNull();
  });

  it("asks before blocking", async () => {
    render(
      <Shell meId={MEMBER_ID} role="member">
        <MemberList />
      </Shell>,
    );
    openMenu(row("Maria"));
    fireEvent.click(item("Block"));
    const dialog = await screen.findByRole("dialog", { name: "Block Maria?" });
    expect(social.blockUserAction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Block" }));
    await waitFor(() => expect(social.blockUserAction).toHaveBeenCalledWith({ userId: MOD_ID, block: true }));
  });

  it("gives the owner role, kick and ban (with a reason) tools", async () => {
    render(
      <Shell>
        <MemberList />
      </Shell>,
    );
    openMenu(row("Juan"));
    expect(item("Change nickname")).toBeInTheDocument();
    const roles = screen.getByRole("group", { name: "Role" });
    expect(within(roles).getByRole("menuitemradio", { name: "Member" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(roles).getByRole("menuitemradio", { name: "Moderator" }));
    await waitFor(() => expect(serverActions.setMemberRoleAction).toHaveBeenCalledWith({ serverId: SERVER_ID, userId: MEMBER_ID, role: "moderator" }));

    openMenu(row("Juan"));
    fireEvent.click(item("Kick Juan"));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Kick Juan?" })).getByRole("button", { name: "Kick" }));
    await waitFor(() => expect(serverActions.kickMemberAction).toHaveBeenCalledWith({ serverId: SERVER_ID, userId: MEMBER_ID }));

    openMenu(row("Juan"));
    fireEvent.click(item("Ban Juan"));
    const ban = await screen.findByRole("dialog", { name: "Ban Juan?" });
    fireEvent.change(within(ban).getByLabelText("Reason (optional)"), { target: { value: "scam links" } });
    // The kick's button holds its spinner a beat after finishing (no flicker); the shared dialog reuses it.
    await waitFor(() => expect(within(ban).getByRole("button", { name: "Ban" })).toBeEnabled());
    fireEvent.click(within(ban).getByRole("button", { name: "Ban" }));
    await waitFor(() => expect(moderation.banMemberAction).toHaveBeenCalledWith({ serverId: SERVER_ID, userId: MEMBER_ID, reason: "scam links" }));
  });
});

describe("Right-click a message", () => {
  const message = {
    id: "m1",
    channel_id: GENERAL.id,
    server_id: SERVER_ID,
    author_id: MOD_ID,
    content: "Tara laro",
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
    created_at: "2026-09-26T01:00:00Z",
    author: MEMBERS[1].profile,
  };
  const actions = () => ({
    onReply: vi.fn(),
    onEdit: vi.fn(async () => true),
    onDelete: vi.fn(),
    onPin: vi.fn(),
    onReact: vi.fn(),
    onOpenThread: vi.fn(),
    onRetry: vi.fn(),
    onDiscard: vi.fn(),
    onJump: vi.fn(),
    nameOf: () => "Maria",
    onOpenProfile: vi.fn(),
  });

  function renderMessage(a: ReturnType<typeof actions>, props: { meId?: string; canModerate?: boolean } = {}) {
    render(
      <Shell meId={props.meId ?? MEMBER_ID} role="member">
        <MessageItem message={message} grouped={false} replyTo={undefined} reactions={[]} meId={props.meId ?? MEMBER_ID} canModerate={props.canModerate ?? false} mentioned={false} editing={false} setEditing={vi.fn()} actions={a} />
      </Shell>,
    );
  }

  it("offers quick reactions, reply and thread, but not edit/pin/delete on someone else's message", () => {
    const a = actions();
    renderMessage(a);
    openMenu(screen.getByTestId("message"));
    expect(screen.getByRole("menu", { name: "Message options" })).toBeInTheDocument();
    for (const name of ["Edit message", "Pin message", "Delete message"]) expect(screen.queryByRole("menuitem", { name })).toBeNull();
    fireEvent.click(item("React with Thumbs up"));
    expect(a.onReact).toHaveBeenCalledWith("m1", ":thumbs_up:");
    openMenu(screen.getByTestId("message"));
    fireEvent.click(item("Reply"));
    expect(a.onReply).toHaveBeenCalledWith(message);
    openMenu(screen.getByTestId("message"));
    fireEvent.click(item("Start thread"));
    expect(a.onOpenThread).toHaveBeenCalledWith(message);
  });

  it("lets moderators pin and delete", () => {
    const a = actions();
    renderMessage(a, { canModerate: true });
    openMenu(screen.getByTestId("message"));
    fireEvent.click(item("Pin message"));
    expect(a.onPin).toHaveBeenCalledWith("m1", true);
    openMenu(screen.getByTestId("message"));
    fireEvent.click(item("Delete message"));
    expect(a.onDelete).toHaveBeenCalledWith(message, false);
  });

  it("opens the author's person menu (not the message menu) on their name, and their profile on click", () => {
    const a = actions();
    renderMessage(a);
    const name = within(screen.getByTestId("message")).getByRole("button", { name: "Maria" });
    openMenu(name);
    expect(screen.getByRole("menu", { name: "Maria options" })).toBeInTheDocument();
    expect(screen.queryByRole("menu", { name: "Message options" })).toBeNull();
    expect(item("Add Friend")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(name);
    expect(a.onOpenProfile).toHaveBeenCalledWith(MOD_ID, name);
  });
});

describe("Right-click channels and servers", () => {
  it("mutes a channel (dimmed), and Hide Muted Channels hides it", async () => {
    render(
      <Shell meId={MEMBER_ID} role="member">
        <ChannelSidebar />
      </Shell>,
    );
    const chika = () => screen.queryByRole("link", { name: "chika" });
    openMenu(chika()!);
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Mute Channel/ }));
    await waitFor(() => expect(chika()).toHaveClass("opacity-50"));
    fireEvent.click(screen.getByTestId("server-menu"));
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /Hide Muted Channels/ }));
    await waitFor(() => expect(chika()).toBeNull());
  });

  it("lets managers delete a channel after confirming", async () => {
    render(
      <Shell>
        <ChannelSidebar />
      </Shell>,
    );
    openMenu(screen.getByRole("link", { name: "chika" }));
    fireEvent.click(item("Delete channel"));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Delete #chika?" })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(serverActions.deleteChannelAction).toHaveBeenCalledWith({ channelId: CHANNELS[1].id }));
  });

  it("invites a friend who isn't in the server with a DM, and marks friends already there", async () => {
    const PEDRO = "00000000-0000-4000-8000-0000000000ee";
    const person = (id: string, username: string, display_name: string) => ({ id, username, display_name, avatar_url: null, avatar_preset: "default", custom_status: null, custom_status_emoji: null });
    render(
      <Shell
        meId={MEMBER_ID}
        role="member"
        friends={[{ userId: PEDRO, status: "accepted", since }, { userId: OWNER_ID, status: "accepted", since }]}
        profiles={new Map([[PEDRO, person(PEDRO, "pedro", "Pedro")], [OWNER_ID, person(OWNER_ID, "kapitan", "Kapitan")]])}
      >
        <ChannelSidebar />
      </Shell>,
    );
    fireEvent.click(screen.getByTestId("invite-button"));
    const list = await screen.findByTestId("invite-friends");
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual([expect.stringContaining("Pedro"), expect.stringContaining("Joined")]);
    fireEvent.click(within(list).getByRole("button", { name: "Invite Pedro" }));
    await waitFor(() => expect(social.sendDirectMessageAction).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "30000000-0000-4000-8000-000000000001", content: expect.stringContaining("/invite/") })));
    expect(social.openDmAction).toHaveBeenCalledWith({ userId: PEDRO });
    expect(await within(list).findByText("Invited")).toBeInTheDocument();
  });

  it("only offers members the channel link and invite", () => {
    render(
      <Shell meId={MEMBER_ID} role="member">
        <ChannelSidebar />
      </Shell>,
    );
    openMenu(screen.getByRole("link", { name: "chika" }));
    expect(item("Copy link")).toBeInTheDocument();
    expect(item("Invite people")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Edit channel" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Delete channel" })).toBeNull();
  });

  it("moves a channel with the grip's arrow keys and saves the whole server's order", async () => {
    render(
      <Shell>
        <ChannelSidebar />
      </Shell>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: /^Move general/ }), { key: "ArrowDown" });
    const [general, chika, lfg, ...voice] = CHANNELS.map((c) => c.id);
    await waitFor(() => expect(serverActions.reorderChannelsAction).toHaveBeenCalledWith({ serverId: SERVER_ID, channelIds: [chika, general, lfg, ...voice] }));
    // The top channel can't move further up (the fixture doesn't apply the optimistic order, so general is still first).
    fireEvent.keyDown(screen.getByRole("button", { name: /^Move general/ }), { key: "ArrowUp" });
    expect(serverActions.reorderChannelsAction).toHaveBeenCalledTimes(1);
  });

  it("tells moderators when the new order couldn't be saved, and shows members no grip", async () => {
    const { toastMock } = await import("../mocks/actions");
    serverActions.reorderChannelsAction.mockResolvedValueOnce({ ok: false, error: "Only moderators can reorder channels." });
    const { unmount } = render(
      <Shell>
        <ChannelSidebar />
      </Shell>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: /^Move chika/ }), { key: "ArrowUp" });
    await waitFor(() => expect(toastMock.toast.error).toHaveBeenCalledWith("Only moderators can reorder channels."));
    unmount();
    render(
      <Shell meId={MEMBER_ID} role="member">
        <ChannelSidebar />
      </Shell>,
    );
    expect(screen.queryByRole("button", { name: /^Move / })).toBeNull();
  });

  it("folds every category from a category's menu", async () => {
    render(
      <Shell>
        <ChannelSidebar />
      </Shell>,
    );
    openMenu(screen.getByRole("button", { name: "Text Channels" }));
    fireEvent.click(item("Collapse all categories"));
    await waitFor(() => expect(screen.queryByRole("link", { name: "chika" })).toBeNull());
    expect(screen.queryByRole("link", { name: "Tambayan 1" })).toBeNull();
  });

  it("leaves a server from the rail, but never one you own", async () => {
    const other = { ...server, id: "10000000-0000-4000-8000-000000000002", name: "Thesis Squad", owner_id: MOD_ID };
    render(
      <Shell meId={MEMBER_ID} role="member">
        <ServerRail servers={[server, other]} />
      </Shell>,
    );
    openMenu(screen.getByRole("link", { name: "Thesis Squad" }));
    fireEvent.click(item("Leave server"));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Leave Thesis Squad?" })).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(serverActions.leaveServerAction).toHaveBeenCalledWith({ serverId: other.id }));
  });

  it("hides Leave on a server you own", () => {
    render(
      <Shell>
        <ServerRail servers={[server]} />
      </Shell>,
    );
    openMenu(screen.getByRole("link", { name: "Barkada HQ" }));
    expect(item("Copy invite link")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Leave server" })).toBeNull();
  });

  it("opens a mobile voice sheet from a real server-icon long press without navigating", async () => {
    const media = vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ matches: query.includes("hover: none"), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ channels: [], limited: false }));
    try {
      render(<Shell><ServerRail servers={[server]} /></Shell>);
      const icon = screen.getByRole("link", { name: "Barkada HQ" });
      fireEvent.pointerDown(icon, { pointerType: "touch", clientX: 20, clientY: 20 });
      const preview = await screen.findByRole("menuitem", { name: "Voice activity" });
      fireEvent.pointerUp(icon, { pointerType: "touch" });
      fireEvent.click(preview);
      const sheet = await screen.findByRole("dialog", { name: "Voice activity in Barkada HQ" });
      expect(sheet).toHaveClass("bottom-0");
      expect(await within(sheet).findByText(/No active voice channels/)).toBeInTheDocument();
      expect(request.mock.calls.some(([input]) => String(input).includes("/token"))).toBe(false);
    } finally { media.mockRestore(); request.mockRestore(); }
  });
});
