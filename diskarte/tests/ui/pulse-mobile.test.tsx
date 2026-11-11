import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { navigation } from "../mocks/navigation";
import type { SocialValue } from "@/components/providers/SocialProvider";

vi.mock("@/actions/profile", async () => (await import("../mocks/actions")).profileActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { PulseShell } = await import("@/components/pulse/shell/PulseShell");
const { Masthead } = await import("@/components/pulse/shell/Masthead");
const { PulseSpaces } = await import("@/components/pulse/views/Spaces");
const { PulseYou } = await import("@/components/pulse/views/You");
const { backTarget, phoneTab } = await import("@/components/pulse/shell/MobileTabs");
const { ContextMenu, ContextMenuItems, PulseMenuSkin, useContextMenu } = await import("@/components/pulse/Menu");
const { ShellKindContext } = await import("@/components/shell/ShellKind");
const { AdminAccessProvider } = await import("@/components/admin/AdminAccess");
const { RuntimeConfigProvider } = await import("@/components/providers/RuntimeConfig");
const { PresenceProvider } = await import("@/components/providers/PresenceProvider");
const { SocialContext } = await import("@/components/providers/SocialProvider");
const { WorkspacePanel } = await import("@/components/workspace/WorkspacePanel");
const { CallContext, CallProvider, useCall } = await import("@/components/voice/CallProvider");
const { MEMBERS, RUNTIME } = await import("../fixtures/layout");
const { SERVER_ID, ServerFixture, server } = await import("../fixtures/server");

const social = { friends: [], blocked: [], profiles: new Map(), conversations: [], attention: 4, reload: async () => {}, reloadConversations: async () => {}, markRead: () => {}, nicknames: new Map(), setNickname: async () => false, favourites: new Set<string>(), setFavourite: async () => false } as unknown as SocialValue;

/** A call being set up in the fixture Space's voice room (connecting: no LiveKit room needed). */
function InCall({ children }: { children: ReactNode }) {
  const call = useCall();
  return <CallContext.Provider value={{ ...call, status: "connecting", target: { kind: "channel", serverId: SERVER_ID, serverName: server.name, channelId: "voice-1", channelName: "Tambayan" } }}>{children}</CallContext.Provider>;
}

/** The Pulse frame on a phone (jsdom's matchMedia matches nothing, so below md) around one page with a masthead. */
function Phone({ page, call = false }: { page?: ReactNode; call?: boolean }) {
  const frame = (
    <PulseShell servers={[server]}>
      {page ?? <WorkspacePanel id="main" title="Page"><Masthead title="Screen title" /></WorkspacePanel>}
    </PulseShell>
  );
  return (
    <RuntimeConfigProvider value={RUNTIME}>
      <ServerFixture members={MEMBERS}>
        <PresenceProvider>
          <CallProvider>
            <SocialContext.Provider value={social}>
              <AdminAccessProvider role="member">
                <ShellKindContext.Provider value="pulse">
                  {call ? <InCall>{frame}</InCall> : frame}
                </ShellKindContext.Provider>
              </AdminAccessProvider>
            </SocialContext.Provider>
          </CallProvider>
        </PresenceProvider>
      </ServerFixture>
    </RuntimeConfigProvider>
  );
}

const tabs = () => screen.queryByRole("navigation", { name: "Main destinations" });

beforeEach(() => navigation.reset("/tambayan/messages"));
afterEach(() => void delete document.documentElement.dataset.keyboard);

describe("phone routes", () => {
  it("top-level screens get a tab; conversations, rooms and a Space's inner pages get none", () => {
    expect(phoneTab("/tambayan")).toBe("home");
    expect(phoneTab("/tambayan/search")).toBe("home");
    expect(phoneTab("/tambayan/messages")).toBe("people");
    expect(phoneTab("/tambayan/friends")).toBe("people");
    expect(phoneTab("/tambayan/spaces")).toBe("spaces");
    expect(phoneTab("/tambayan/explore")).toBe("spaces");
    expect(phoneTab(`/tambayan/${SERVER_ID}`)).toBe("spaces"); // a Space's landing
    expect(phoneTab("/tambayan/you")).toBe("you");
    for (const path of ["/tambayan/dm/abc", `/tambayan/${SERVER_ID}/general`, `/tambayan/${SERVER_ID}/workspace`, `/tambayan/${SERVER_ID}/lfg`, "/tambayan/dm"]) expect(phoneTab(path)).toBeNull();
  });

  it("Back goes from a DM to People and from inside a Space to its landing; top-level screens have none", () => {
    expect(backTarget("/tambayan/dm/abc")).toBe("/tambayan/messages");
    expect(backTarget(`/tambayan/${SERVER_ID}/general`)).toBe(`/tambayan/${SERVER_ID}`);
    expect(backTarget(`/tambayan/${SERVER_ID}/workspace`)).toBe(`/tambayan/${SERVER_ID}`);
    for (const path of ["/tambayan", "/tambayan/messages", "/tambayan/spaces", "/tambayan/you", `/tambayan/${SERVER_ID}`]) expect(backTarget(path)).toBeNull();
  });
});

describe("phone tab bar", () => {
  it("shows four destinations on a top-level screen, marks the current one and counts unread conversations", () => {
    render(<Phone />);
    const nav = tabs()!;
    expect(within(nav).getAllByRole("link").map((l) => l.lastElementChild?.textContent)).toEqual(["Home", "People", "Spaces", "You"]);
    expect(within(nav).getByRole("link", { name: /People/ })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: /People/ })).toHaveAccessibleName(/4 unread/);
    expect(within(nav).getByRole("link", { name: /Spaces/ })).toHaveAttribute("href", "/tambayan/spaces");
    expect(within(nav).getByRole("link", { name: /You/ })).toHaveAttribute("href", "/tambayan/you");
    // Top-level: the masthead keeps the navigator button.
    expect(screen.getByRole("button", { name: "Open navigation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("gives a conversation the whole screen, with Back in the masthead", () => {
    navigation.reset("/tambayan/dm/abc");
    render(<Phone />);
    expect(tabs()).toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open navigation" })).toBeNull();
  });

  it("keeps the live call strip above the tabs, and on its own inside a conversation", () => {
    const { unmount } = render(<Phone call />);
    const bottom = screen.getByTestId("pulse-phone-nav");
    const strip = within(bottom).getByTestId("call-dock");
    expect(strip.compareDocumentPosition(within(bottom).getByRole("navigation")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(strip).getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    unmount();
    navigation.reset("/tambayan/dm/abc");
    render(<Phone call />);
    expect(within(screen.getByTestId("pulse-phone-nav")).getByTestId("call-dock")).toBeInTheDocument();
    expect(tabs()).toBeNull();
  });

  it("steps aside while the on-screen keyboard is up", async () => {
    render(<Phone />);
    expect(tabs()).not.toBeNull();
    act(() => void (document.documentElement.dataset.keyboard = "true"));
    await waitFor(() => expect(tabs()).toBeNull());
    act(() => void (document.documentElement.dataset.keyboard = "false"));
    await waitFor(() => expect(tabs()).not.toBeNull());
  });
});

describe("phone navigation", () => {
  it("opening a conversation slides it in and focuses its heading", async () => {
    render(<Phone />);
    act(() => navigation.push("/tambayan/dm/abc"));
    expect(document.querySelector("[data-workspace]")).toHaveAttribute("data-enter");
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Screen title" })).toHaveFocus());
  });

  it("Back from a deep-linked conversation goes to its parent screen", async () => {
    navigation.reset(`/tambayan/${SERVER_ID}/general`);
    render(<Phone />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Back" }));
    expect(navigation.path).toBe(`/tambayan/${SERVER_ID}`);
  });

  it("Back returns through history when you came from the parent", async () => {
    render(<Phone />);
    act(() => navigation.push("/tambayan/dm/abc"));
    navigation.history = [];
    await userEvent.setup().click(screen.getByRole("button", { name: "Back" }));
    expect(navigation.history).toEqual([]); // router.back(), not a new entry
  });

  it("a swipe from the left edge goes Back in a conversation, and opens the navigator on a top-level screen", async () => {
    navigation.reset("/tambayan/dm/abc");
    render(<Phone />);
    const shell = screen.getByTestId("shell");
    const swipe = () => {
      fireEvent.touchStart(shell, { touches: [{ clientX: 8, clientY: 300 }] });
      fireEvent.touchMove(shell, { touches: [{ clientX: 90, clientY: 304 }] });
      fireEvent.touchEnd(shell);
    };
    swipe();
    expect(navigation.path).toBe("/tambayan/messages");
    await waitFor(() => expect(tabs()).not.toBeNull());
    swipe();
    expect(screen.getByRole("button", { name: "Close navigation" })).toBeInTheDocument();
  });
});

describe("Spaces and You screens", () => {
  it("Spaces lists every Space, each opening its landing, with Add a Space", () => {
    navigation.reset("/tambayan/spaces");
    render(<Phone page={<PulseSpaces servers={[server]} />} />);
    expect(screen.getByRole("heading", { level: 1, name: "Spaces" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Your Spaces" })).getByRole("link", { name: new RegExp(server.name) })).toHaveAttribute("href", `/tambayan/${SERVER_ID}`);
    expect(within(screen.getByRole("main")).getByRole("button", { name: "Add a Space" })).toBeInTheDocument();
    expect(within(tabs()!).getByRole("link", { name: /Spaces/ })).toHaveAttribute("aria-current", "page");
  });

  it("You shows your status choices, notifications, Settings and Back to Classic", () => {
    navigation.reset("/tambayan/you");
    render(<Phone page={<PulseYou servers={[server]} />} />);
    expect(screen.getByRole("heading", { level: 1, name: "You" })).toBeInTheDocument();
    const status = screen.getByRole("region", { name: "Status" });
    expect(within(status).getAllByRole("button").some((b) => b.getAttribute("aria-pressed") === "true")).toBe(true);
    for (const name of ["Settings", "Back to Classic"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Control Center" })).toBeNull(); // members only
    expect(within(tabs()!).getByRole("link", { name: /You/ })).toHaveAttribute("aria-current", "page");
  });
});

describe("touch context menus", () => {
  function Row() {
    const menu = useContextMenu();
    return (
      <>
        <button type="button" onClick={(e) => menu.openFrom(e.currentTarget)}>Lakbay Crew</button>
        <ContextMenu menu={menu} label="Lakbay Crew options"><ContextMenuItems items={[{ label: "Mark as read", onSelect: () => {} }]} /></ContextMenu>
      </>
    );
  }

  it("open in a bottom sheet on a touch screen, and close with Escape", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ matches: query === "(pointer: coarse)", media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) as MediaQueryList);
    const user = userEvent.setup();
    render(<PulseMenuSkin><Row /></PulseMenuSkin>);
    await user.click(screen.getByRole("button", { name: "Lakbay Crew" }));
    const sheet = await screen.findByRole("dialog", { name: "Lakbay Crew options" });
    expect(within(sheet).getByRole("menu", { name: "Lakbay Crew options" })).toBeInTheDocument();
    expect(within(sheet).getByRole("menuitem", { name: "Mark as read" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    vi.restoreAllMocks();
  });

  it("stay a floating menu with a mouse", async () => {
    const user = userEvent.setup();
    render(<PulseMenuSkin><Row /></PulseMenuSkin>);
    await user.click(screen.getByRole("button", { name: "Lakbay Crew" }));
    expect(await screen.findByRole("menu", { name: "Lakbay Crew options" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
