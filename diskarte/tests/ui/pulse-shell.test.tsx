import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { livekitMock } from "../mocks/livekit";
import { navigation } from "../mocks/navigation";
import type { SocialValue } from "@/components/providers/SocialProvider";

vi.mock("@/actions/profile", async () => (await import("../mocks/actions")).profileActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);
// Counts mounts of one of ShellProviders' watchers: it must survive a shell switch.
const watcher = vi.hoisted(() => ({ mounts: 0 }));
const composer = vi.hoisted(() => ({ upload: vi.fn(), send: vi.fn(async () => "sent" as const) }));
vi.mock("@/lib/uploads", async (original) => ({ ...(await original<typeof import("@/lib/uploads")>()), uploadAttachment: composer.upload }));

// Presence rejoins after a status save leaves Invisible (release/privacy-hardening); the You menu must do it too.
const presence = vi.hoisted(() => ({ rejoin: vi.fn() }));
vi.mock("@/components/providers/PresenceProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/PresenceProvider")>()),
  usePresenceRejoin: () => presence.rejoin,
}));
vi.mock("@/components/shell/DmNotifier", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/shell/DmNotifier")>()),
  DmNotifier: function DmNotifier() {
    useEffect(() => void (watcher.mounts += 1), []);
    return null;
  },
}));

const { ShellProviders } = await import("@/components/shell/AppShell");
const { Composer } = await import("@/components/chat/Composer");
const { SessionProviders } = await import("@/components/shell/SessionProviders");
const { ShellKindContext } = await import("@/components/shell/ShellKind");
const { ShellUIProvider } = await import("@/components/shell/ShellUI");
const { AppFrame } = await import("@/components/shell/AppFrame");
const { PulseShell } = await import("@/components/pulse/shell/PulseShell");
const { PulseRooms } = await import("@/components/pulse/shell/Rooms");
const { viewFor } = await import("@/components/pulse/shell/Navigator");
const { usePulseUI } = await import("@/components/pulse/shell/PulseUI");
const { AdminAccessProvider } = await import("@/components/admin/AdminAccess");
const { RuntimeConfigProvider } = await import("@/components/providers/RuntimeConfig");
const { PresenceProvider } = await import("@/components/providers/PresenceProvider");
const { SocialContext } = await import("@/components/providers/SocialProvider");
const { ChannelHeader } = await import("@/components/server/ChannelHeader");
const { MemberList } = await import("@/components/server/MemberList");
const { RosterDrawer } = await import("@/components/workspace/RosterDrawer");
const { WorkspacePanel } = await import("@/components/workspace/WorkspacePanel");
const { CallProvider, useCall } = await import("@/components/voice/CallProvider");
const { parseDisplayPrefs, readDisplayPrefs, togglePin } = await import("@/lib/display-prefs");
const { ACCOUNT, CHANNELS, MEMBERS, RUNTIME, TAMBAYAN, GENERAL, channelUrl } = await import("../fixtures/layout");
const { SERVER_ID, ServerFixture, makeChannel, presenceFor, server } = await import("../fixtures/server");

const OTHER = { ...server, id: "10000000-0000-4000-8000-000000000002", name: "Lakbay Crew", is_system: false };
const HQ = { ...server, id: "10000000-0000-4000-8000-000000000003", name: "Diskarte HQ", is_system: true };
// A private room someone else can see; RLS keeps it out of this viewer's bundle, so it is not in `channels`.
const HIDDEN = makeChannel("20000000-0000-4000-8000-0000000000ff", "mods-only", "voice", 9);

function social(): SocialValue {
  return {
    friends: [],
    blocked: [],
    profiles: new Map(),
    conversations: [],
    attention: 0,
    reload: async () => {},
    reloadConversations: async () => {},
    markRead: () => {},
    nicknames: new Map(),
    setNickname: async () => false,
    favourites: new Set<string>(),
    setFavourite: async () => false,
  } as unknown as SocialValue;
}

/** The Pulse tree as app/(app)/tambayan/layout.tsx + [serverId]/layout.tsx render it, on fixtures. */
function PulseApp({ role = "member" as const, children }: { role?: "member" | "super_admin"; children?: ReactNode }) {
  return (
    <RuntimeConfigProvider value={RUNTIME}>
      <ServerFixture members={MEMBERS} overrides={{ channels: CHANNELS }} presence={new Map([[MEMBERS[1].user_id, presenceFor(MEMBERS[1].user_id, { voice_channel_id: TAMBAYAN.id })], [MEMBERS[2].user_id, presenceFor(MEMBERS[2].user_id, { voice_channel_id: HIDDEN.id })]])}>
        <PresenceProvider>
        <CallProvider>
          <SocialContext.Provider value={social()}>
            <AdminAccessProvider role={role}>
              <ShellKindContext.Provider value="pulse">
                <PulseShell servers={[server, OTHER, HQ]}>
                  <WorkspacePanel id="nav" title="Channels"><p>Classic channel list</p></WorkspacePanel>
                  <WorkspacePanel id="main" title={server.name}>
                    <ChannelHeader channel={GENERAL} />
                    {children}
                  </WorkspacePanel>
                  <PulseRooms />
                  <RosterDrawer><MemberList /></RosterDrawer>
                </PulseShell>
              </ShellKindContext.Provider>
            </AdminAccessProvider>
          </SocialContext.Provider>
        </CallProvider>
        </PresenceProvider>
      </ServerFixture>
    </RuntimeConfigProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  navigation.reset(channelUrl(GENERAL.id));
});

describe("shell seams", () => {
  it("WorkspacePanel: in Pulse the nav column renders nothing and main is the canvas landmark", () => {
    render(<PulseApp />);
    expect(screen.queryByText("Classic channel list")).toBeNull();
    const main = screen.getByRole("main", { name: server.name });
    expect(main).toHaveAttribute("id", "main-content");
    expect(within(main).getByRole("heading", { level: 1, name: GENERAL.name })).toBeInTheDocument();
    expect(screen.queryByTestId("micro-dock")).toBeNull(); // no server rail
  });

  it("WorkspacePanel stays Classic outside the Pulse shell", () => {
    render(
      <ShellUIProvider>
        <WorkspacePanel id="nav" title="Channels"><p>Classic channel list</p></WorkspacePanel>
      </ShellUIProvider>,
    );
    expect(screen.getByRole("region", { name: "Channels" })).toHaveTextContent("Classic channel list");
  });

  it("picks the navigator view from the route", () => {
    expect(viewFor("/tambayan")).toBe("home");
    expect(viewFor("/tambayan/explore")).toBe("home");
    expect(viewFor("/tambayan/dm/abc")).toBe("people");
    expect(viewFor("/tambayan/friends")).toBe("people");
    expect(viewFor(`/tambayan/${SERVER_ID}/x`)).toBe("spaces");
  });
});

describe("Spaces navigator", () => {
  it("lists only RLS-scoped data: your Spaces, the open Space's visible rooms, occupancy of visible rooms", () => {
    render(<PulseApp />);
    const spaces = screen.getByTestId("space-list");
    // HQ first, then the rest.
    expect(Array.from(spaces.querySelectorAll(":scope > li > div > a"), (l) => l.textContent)).toEqual([expect.stringContaining("Diskarte HQ"), expect.stringContaining("Barkada HQ"), expect.stringContaining("Lakbay Crew")]);
    const rooms = screen.getByTestId("pulse-rooms");
    for (const c of CHANNELS) expect(within(rooms).getByRole("link", { name: new RegExp(c.name) })).toBeInTheDocument();
    expect(within(rooms).queryByText(HIDDEN.name)).toBeNull();
    // Maria is in Tambayan 1; Juan's presence names a room this viewer can't see, so nothing shows for it.
    expect(within(rooms).getByRole("link", { name: /Tambayan 1/ })).toHaveTextContent("1 in voice");
    expect(within(rooms).getAllByText(/in voice/)).toHaveLength(1);
  });

  it("shows the Control Center only when the server says you are a super admin", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<PulseApp />);
    await user.click(screen.getByRole("radio", { name: "Home" }));
    expect(screen.queryByRole("link", { name: "Control Center" })).toBeNull();
    unmount();
    render(<PulseApp role="super_admin" />);
    await user.click(screen.getByRole("radio", { name: "Home" }));
    expect(screen.getByRole("link", { name: "Control Center" })).toHaveAttribute("href", "/tambayan/admin");
  });

  it("Alt 1–9 open Spaces in order (not Ctrl/⌘, which browsers keep; not while typing); arrows move between rows; Escape returns to the canvas", () => {
    render(<PulseApp />);
    fireEvent.keyDown(window, { key: "1", code: "Digit1", ctrlKey: true }); // the browser's tab shortcut: ignored
    expect(navigation.path).toBe(channelUrl(GENERAL.id));
    fireEvent.keyDown(window, { key: "¡", code: "Digit1", altKey: true }); // Option + 1 on a Mac types ¡
    expect(navigation.path).toBe(`/tambayan/${HQ.id}`);
    act(() => navigation.set(channelUrl(GENERAL.id)));
    fireEvent.keyDown(window, { key: "£", code: "Digit3", altKey: true });
    expect(navigation.path).toBe(`/tambayan/${OTHER.id}`);
    act(() => navigation.set(channelUrl(GENERAL.id)));
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "£", code: "Digit3", altKey: true }); // typing a character
    expect(navigation.path).toBe(channelUrl(GENERAL.id));
    fireEvent.keyDown(window, { key: "ª", code: "Digit9", altKey: true }); // no ninth Space: nothing happens
    expect(navigation.path).toBe(channelUrl(GENERAL.id));

    const rooms = screen.getByTestId("pulse-rooms");
    const lfg = within(rooms).getByRole("link", { name: "LFG Board" });
    lfg.focus();
    fireEvent.keyDown(lfg, { key: "ArrowDown" });
    expect(within(rooms).getByRole("link", { name: "Shared workspace" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(lfg).toHaveFocus();
    fireEvent.keyDown(lfg, { key: "Escape" });
    expect(screen.getByRole("main")).toHaveFocus();
  });
});

describe("You menu", () => {
  it("going from Invisible back to Online rejoins presence once the save succeeds (not while going Invisible)", async () => {
    const user = userEvent.setup();
    presence.rejoin.mockClear();
    render(<PulseApp />);
    await user.click(screen.getByTestId("you-button"));
    await user.click(await screen.findByRole("menuitemradio", { name: /^Invisible/ }));
    await waitFor(() => expect(screen.getByTestId("you-button")).toHaveAccessibleName(/Invisible/));
    expect(presence.rejoin).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("you-button"));
    await user.click(await screen.findByRole("menuitemradio", { name: /^Online/ }));
    await waitFor(() => expect(presence.rejoin).toHaveBeenCalledTimes(1));
  });
});

describe("Context sheet", () => {
  it("openContext('pinned') (ChatView's Pinned messages button in Pulse) opens the sheet on Pinned", async () => {
    const user = userEvent.setup();
    function PinsButton() {
      const ui = usePulseUI();
      return <button type="button" onClick={() => ui.openContext("pinned")}>Pinned messages</button>;
    }
    render(<PulseApp><PinsButton /></PulseApp>);
    await user.click(screen.getByRole("button", { name: "Pinned messages" }));
    const sheet = await screen.findByRole("dialog", { name: "Context" });
    expect(within(sheet).getByRole("tab", { name: "Pinned" })).toHaveAttribute("aria-selected", "true");
    expect(await within(sheet).findByText("Nothing pinned yet")).toBeInTheDocument();
  });

  it("opens from the masthead with People, Pinned and About", async () => {
    const user = userEvent.setup();
    render(<PulseApp />);
    expect(screen.queryByRole("dialog", { name: "Context" })).toBeNull();
    await user.click(screen.getByTestId("context-toggle"));
    const sheet = await screen.findByRole("dialog", { name: "Context" });
    expect(within(sheet).getAllByRole("tab").map((t) => t.textContent)).toEqual(["People", "Pinned", "About"]);
    expect(within(sheet).getByTestId("member-list")).toHaveTextContent("Maria");
    await user.click(within(sheet).getByRole("tab", { name: "About" }));
    expect(within(sheet).getByText(server.description)).toBeInTheDocument();
    await user.click(within(sheet).getByRole("tab", { name: "Pinned" }));
    expect(await within(sheet).findByText("Nothing pinned yet")).toBeInTheDocument();
  });
});

describe("navigator pins", () => {
  it("live in the display prefs (synced when account_state exists, else this browser) without touching other prefs", () => {
    localStorage.setItem("diskarte:display-prefs", JSON.stringify({ fontSize: 18 }));
    const before = readDisplayPrefs();
    togglePin(`space:${SERVER_ID}`);
    const saved = JSON.parse(localStorage.getItem("diskarte:display-prefs")!);
    expect(saved).toMatchObject({ ...before, pins: [`space:${SERVER_ID}`] });
    togglePin(`space:${SERVER_ID}`);
    expect(readDisplayPrefs().pins).toEqual([]);
    // Junk and duplicates are dropped; with no pins the prefs keep their old shape.
    expect(parseDisplayPrefs(JSON.stringify({ pins: ["space:x", 3, `dm:${SERVER_ID}`, `dm:${SERVER_ID}`] })).pins).toEqual([`dm:${SERVER_ID}`]);
    expect(parseDisplayPrefs(JSON.stringify({ pins: [] }))).not.toHaveProperty("pins");
  });

  it("show a Pinned section for pinned Spaces you still belong to", async () => {
    togglePin(`space:${OTHER.id}`);
    togglePin("space:10000000-0000-4000-8000-0000000000ee"); // a Space you left: not listed
    render(<PulseApp />);
    const pinned = await screen.findByRole("region", { name: "Pinned" });
    expect(within(pinned).getAllByRole("link").map((l) => l.textContent)).toEqual([expect.stringContaining("Lakbay Crew")]);
  });
});

describe("switching shells", () => {
  beforeEach(() => {
    watcher.mounts = 0;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ token: "jwt", url: RUNTIME.livekitUrl, room: `voice:${TAMBAYAN.id}` }), { status: 200 })));
  });

  function JoinButton() {
    const call = useCall();
    return <button type="button" onClick={() => void call.join({ serverId: SERVER_ID, serverName: server.name, channelId: TAMBAYAN.id, channelName: TAMBAYAN.name })}>Join voice</button>;
  }
  function DraftProbe() {
    const [value, setValue] = useState("");
    return <WorkspacePanel id="main" title="Conversation"><input aria-label="Unsent draft" value={value} onChange={(event) => setValue(event.target.value)} /><Composer channelName="general" serverId={SERVER_ID} channelId={GENERAL.id} replyTo={null} onCancelReply={() => {}} onSend={composer.send} onEditLast={() => {}} typingNames={[]} onTyping={() => {}} onStopTyping={() => {}} /></WorkspacePanel>;
  }
  function CallStatus() {
    return <output data-testid="call-status">{useCall().status}</output>;
  }
  /** app/(app)/layout.tsx → SessionProviders; tambayan/layout.tsx → ShellProviders around one frame or the other. */
  function App({ shell }: { shell: "classic" | "pulse" }) {
    return (
      <RuntimeConfigProvider value={RUNTIME}>
        <SessionProviders profile={MEMBERS[0].profile} account={ACCOUNT}>
          <CallStatus />
          <ShellProviders shell={shell}>
            <AppFrame shell={shell} servers={[server]}>
              <JoinButton />
              <DraftProbe />
            </AppFrame>
          </ShellProviders>
        </SessionProviders>
      </RuntimeConfigProvider>
    );
  }

  it("keeps the call, conversation state and shared providers mounted across both presentations", async () => {
    const user = userEvent.setup();
    const { rerender, container } = render(<App shell="classic" />);
    const attachment = { path: `${SERVER_ID}/${GENERAL.id}/${MEMBERS[0].user_id}/voice.mp3`, name: "voice.mp3", size: 12, type: "audio/mpeg" };
    composer.upload.mockResolvedValue(attachment);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["ID3 recording"], "voice.mp3", { type: "audio/mpeg" })] } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled());
    expect(screen.getByTestId("micro-dock")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Join voice" }));
    await waitFor(() => expect(screen.getByTestId("call-status")).toHaveTextContent("connected"), { timeout: 5000 });
    fireEvent.change(screen.getByRole("textbox", { name: "Unsent draft" }), { target: { value: "Keep this draft" } });
    const draft = screen.getByRole("textbox", { name: "Unsent draft" });
    const room = livekitMock.rooms.at(-1)!;
    expect(watcher.mounts).toBe(1);

    rerender(<App shell="pulse" />);
    expect(screen.queryByTestId("micro-dock")).toBeNull();
    expect(screen.getByTestId("pulse-navigator")).toBeInTheDocument();
    expect(screen.getByTestId("call-status")).toHaveTextContent("connected");
    expect(screen.getByRole("textbox", { name: "Unsent draft" })).toBe(draft);
    expect(draft).toHaveValue("Keep this draft");
    expect(room.disconnect).not.toHaveBeenCalled();
    expect(watcher.mounts).toBe(1);

    rerender(<App shell="classic" />);
    expect(screen.getByTestId("micro-dock")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Unsent draft" })).toBe(draft);
    expect(draft).toHaveValue("Keep this draft");
    expect(room.disconnect).not.toHaveBeenCalled();
    expect(watcher.mounts).toBe(1);
    expect(screen.getByText("voice.mp3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(composer.send).toHaveBeenCalledWith("", [attachment], null);
  });
});
