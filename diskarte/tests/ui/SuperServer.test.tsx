import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { navigation } from "../mocks/navigation";

vi.mock("@/actions/messages", async () => (await import("../mocks/actions")).messageActions);
vi.mock("@/actions/servers", async () => (await import("../mocks/actions")).serverActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { serverActions } = await import("../mocks/actions");
const { ChatView } = await import("@/components/chat/ChatView");
const { ChannelSidebar } = await import("@/components/server/ChannelSidebar");
const { ChannelDialog } = await import("@/components/server/ChannelDialog");
const { ServerRail } = await import("@/components/shell/ServerRail");
const { RuntimeConfigProvider } = await import("@/components/providers/RuntimeConfig");
const { CallProvider } = await import("@/components/voice/CallProvider");
const { PresenceProvider } = await import("@/components/providers/PresenceProvider");
const { MEMBERS, RUNTIME } = await import("../fixtures/layout");
const { MEMBER_ID, OWNER_ID, ServerFixture, makeChannel, server } = await import("../fixtures/server");

const HQ = { ...server, id: "d15ca47e-0000-4000-8000-000000000001", name: "Diskarte HQ", owner_id: null, is_system: true };
const ANNOUNCEMENTS = { ...makeChannel("d15ca47e-0000-4000-8000-0000000000a1", "announcements", "text", 0, "Diskarte HQ"), server_id: HQ.id, read_only: true };
const LOUNGE = { ...makeChannel("d15ca47e-0000-4000-8000-0000000000a2", "global-lounge", "text", 1, "Diskarte HQ"), server_id: HQ.id, slowmode_seconds: 5 };
const EMPTY = { messages: [], reactions: [], hasMore: false };

function Hq({ role, meId = MEMBER_ID, children }: { role: "admin" | "member"; meId?: string; children: React.ReactNode }) {
  return (
    <RuntimeConfigProvider value={RUNTIME}>
      <ServerFixture members={MEMBERS} meId={meId} myRole={role} overrides={{ server: HQ, channels: [ANNOUNCEMENTS, LOUNGE] }}>
        <PresenceProvider>
          <CallProvider>{children}</CallProvider>
        </PresenceProvider>
      </ServerFixture>
    </RuntimeConfigProvider>
  );
}

beforeEach(() => navigation.reset(`/tambayan/${HQ.id}/${ANNOUNCEMENTS.id}`));

describe("Diskarte HQ in the UI", () => {
  it("pins HQ to the top of the server rail with an official gold badge", () => {
    render(
      <ServerFixture members={MEMBERS}>
        <ServerRail servers={[server, HQ]} />
      </ServerFixture>,
    );
    const pinned = screen.getByTestId("pinned-server");
    expect(pinned).toHaveAccessibleName("Diskarte HQ (official)");
    expect(within(screen.getByTestId("server-list")).queryByRole("link", { name: /Diskarte HQ/ })).toBeNull();
    // It sits above every other server in the dock.
    expect(pinned.compareDocumentPosition(screen.getByTestId("server-list")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("locks #announcements for members: 'Only creators can post in this channel.'", () => {
    render(
      <Hq role="member">
        <ChatView channel={ANNOUNCEMENTS} initial={EMPTY} />
      </Hq>,
    );
    const lock = screen.getByTestId("composer-locked");
    expect(lock).toHaveTextContent("Only creators can post in this channel.");
    expect(lock).toHaveAttribute("data-lock", "read-only");
    expect(screen.queryByTestId("composer")).toBeNull();
  });

  it("lets creators post in #announcements and everyone chat in #global-lounge", () => {
    const { unmount } = render(
      <Hq role="admin" meId={OWNER_ID}>
        <ChatView channel={ANNOUNCEMENTS} initial={EMPTY} />
      </Hq>,
    );
    expect(screen.getByTestId("composer")).toBeInTheDocument();
    unmount();
    render(
      <Hq role="member">
        <ChatView channel={LOUNGE} initial={EMPTY} />
      </Hq>,
    );
    expect(screen.getByTestId("composer")).toBeInTheDocument();
    expect(screen.queryByTestId("composer-locked")).toBeNull();
  });

  it("never offers to leave HQ or invite people to it", async () => {
    const user = userEvent.setup();
    render(
      <Hq role="member">
        <ChannelSidebar />
      </Hq>,
    );
    expect(screen.getByLabelText("Official server")).toBeInTheDocument();
    await user.click(screen.getByTestId("server-menu"));
    const menu = await screen.findByRole("menu", { name: "Server menu" });
    expect(within(menu).queryByRole("menuitem", { name: "Leave server" })).toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: "Invite people" })).toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: "Server settings" })).toBeNull();
  });

  it("admins can make any channel read-only", async () => {
    const user = userEvent.setup();
    vi.mocked(serverActions.updateChannelAction).mockClear();
    render(
      <Hq role="admin" meId={OWNER_ID}>
        <ChannelDialog open onClose={() => undefined} channel={LOUNGE} />
      </Hq>,
    );
    await user.click(screen.getByRole("switch", { name: "Read-only (announcements)" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(serverActions.updateChannelAction).toHaveBeenCalledWith(expect.objectContaining({ channelId: LOUNGE.id, readOnly: true })));
  });
});
