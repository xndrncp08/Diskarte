import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { livekitMock } from "../mocks/livekit";
import { navigation } from "../mocks/navigation";

vi.mock("@/actions/messages", async () => (await import("../mocks/actions")).messageActions);
vi.mock("@/actions/servers", async () => (await import("../mocks/actions")).serverActions);
vi.mock("@/actions/profile", async () => (await import("../mocks/actions")).profileActions);
vi.mock("@/actions/account", () => ({ changePasswordAction: vi.fn(async () => ({})), deleteAccountAction: vi.fn(async () => ({})) }));
vi.mock("@/app/(auth)/actions", () => ({ signOutAction: vi.fn(async () => undefined) }));
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { FloatingWindow } = await import("@/components/ui/FloatingWindow");
const { AppShell } = await import("@/components/shell/AppShell");
const { SessionProviders } = await import("@/components/shell/SessionProviders");
const { useCall } = await import("@/components/voice/CallProvider");
const { MixerButton } = await import("@/components/voice/AudioMixer");
const { MediaViewerProvider } = await import("@/components/chat/MediaViewer");
const { Attachments } = await import("@/components/chat/Attachments");
const { RuntimeConfigProvider } = await import("@/components/providers/RuntimeConfig");
const { ACCOUNT, DiskarteLayout, GENERAL, MEMBERS, RUNTIME, TAMBAYAN, channelUrl } = await import("../fixtures/layout");
const { SERVER_ID, server } = await import("../fixtures/server");

function Harness({ initiallyOpen = true }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open window
      </button>
      <input aria-label="Chat box" />
      <FloatingWindow id="test-window" open={open} onClose={() => setOpen(false)} title="Test window">
        <button type="button">Inside</button>
      </FloatingWindow>
    </>
  );
}

const frame = () => screen.getByRole("dialog", { name: "Test window" });

beforeEach(() => {
  localStorage.clear();
  navigation.reset(channelUrl(GENERAL.id));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ token: "jwt", url: RUNTIME.livekitUrl, room: `voice:${TAMBAYAN.id}` }), { status: 200 })),
  );
});

describe("FloatingWindow", () => {
  it("is a non-modal dialog that focuses its content and leaves the page usable", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(frame()).toHaveAttribute("aria-modal", "false");
    await waitFor(() => expect(screen.getByRole("button", { name: "Inside" })).toHaveFocus());
    // The page behind keeps working: type in the chat while the window stays open.
    await user.type(screen.getByLabelText("Chat box"), "hello");
    expect(screen.getByLabelText("Chat box")).toHaveValue("hello");
    expect(frame()).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

  it("drags by the title bar and remembers where it was left", async () => {
    render(<Harness />);
    await waitFor(() => expect(frame().style.visibility).not.toBe("hidden"));
    const start = { x: parseFloat(frame().style.left), y: parseFloat(frame().style.top) };
    const bar = frame().querySelector("[data-window-handle]")!;
    fireEvent.pointerDown(bar, { button: 0, clientX: start.x + 40, clientY: start.y + 10, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: start.x + 140, clientY: start.y + 60, pointerId: 1 });
    fireEvent.pointerUp(bar, { pointerId: 1 });
    expect(parseFloat(frame().style.left)).toBe(start.x + 100);
    expect(parseFloat(frame().style.top)).toBe(start.y + 50);
    expect(JSON.parse(localStorage.getItem("diskarte:window:test-window")!)).toEqual({ x: start.x + 100, y: start.y + 50 });
  });

  it("moves with the arrow keys from its Move button, staying on screen", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Inside" })).toHaveFocus());
    const left = parseFloat(frame().style.left);
    screen.getByRole("button", { name: "Move window" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(parseFloat(frame().style.left)).toBe(left + 16);
    for (let i = 0; i < 200; i++) fireEvent.keyDown(screen.getByRole("button", { name: "Move window" }), { key: "ArrowUp", shiftKey: true });
    expect(parseFloat(frame().style.top)).toBe(0);
  });

  it("closes on Escape only while focus is inside it, and restores focus", async () => {
    const user = userEvent.setup();
    render(<Harness initiallyOpen={false} />);
    await user.click(screen.getByRole("button", { name: "Open window" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Inside" })).toHaveFocus());
    screen.getByLabelText("Chat box").focus();
    await user.keyboard("{Escape}");
    expect(frame()).toBeInTheDocument();
    screen.getByRole("button", { name: "Inside" }).focus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Test window" })).toBeNull());
  });

  it("brings the clicked window to the front", async () => {
    render(
      <>
        <FloatingWindow id="a" open onClose={() => undefined} title="Window A">
          <button type="button">A</button>
        </FloatingWindow>
        <FloatingWindow id="b" open onClose={() => undefined} title="Window B">
          <button type="button">B</button>
        </FloatingWindow>
      </>,
    );
    const a = screen.getByRole("dialog", { name: "Window A" });
    const b = screen.getByRole("dialog", { name: "Window B" });
    expect(Number(b.style.zIndex)).toBeGreaterThan(Number(a.style.zIndex));
    fireEvent.pointerDown(within(a).getByRole("button", { name: "A" }));
    expect(Number(a.style.zIndex)).toBeGreaterThan(Number(b.style.zIndex));
  });
});

describe("media viewer window", () => {
  const attachment = (n: number) => ({ path: `${SERVER_ID}/${GENERAL.id}/u/${n}.png`, name: `photo-${n}.png`, size: 1000, type: "image/png" as const, width: 800, height: 600 });

  it("opens a message's images as a gallery instead of leaving the app", async () => {
    const user = userEvent.setup();
    render(
      <RuntimeConfigProvider value={RUNTIME}>
        <MediaViewerProvider>
          <Attachments attachments={[attachment(1), attachment(2), attachment(3)]} />
        </MediaViewerProvider>
      </RuntimeConfigProvider>,
    );
    await user.click(await screen.findByRole("link", { name: "Open photo-2.png" }));
    const viewer = await screen.findByRole("dialog", { name: "photo-2.png" });
    expect(await within(viewer).findByText("2 / 3")).toBeInTheDocument(); // the gallery body loads on first open
    await user.click(within(viewer).getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("dialog", { name: "photo-3.png" })).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("dialog", { name: "photo-1.png" })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("link", { name: "Open original in a new tab" })).toHaveAttribute("href", expect.stringContaining("1.png"));
    expect(navigation.history).toEqual([]);
  });
});

describe("member profile windows", () => {
  it("pops a member's profile out of the popover into a window that stays open", async () => {
    const user = userEvent.setup();
    render(<DiskarteLayout />);
    const row = screen.getAllByTestId("member-row").find((r) => r.textContent?.includes("Maria"))!;
    await user.click(row);
    const popover = await screen.findByRole("dialog", { name: "Maria's profile" });
    await user.click(within(popover).getByRole("button", { name: "Open in a window" }));
    const win = await screen.findByRole("dialog", { name: "Maria · Profile" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Maria's profile" })).toBeNull());
    expect(within(win).getByTestId("profile-card")).toHaveTextContent("@maria");
    // Clicking elsewhere (which dismisses popovers) leaves the window open.
    fireEvent.mouseDown(document.body);
    expect(screen.getByRole("dialog", { name: "Maria · Profile" })).toBeInTheDocument();
  });
});

describe("audio mixer window", () => {
  function CallHarness() {
    const call = useCall();
    return (
      <>
        <button type="button" onClick={() => void call.join({ serverId: SERVER_ID, serverName: server.name, channelId: TAMBAYAN.id, channelName: TAMBAYAN.name })}>
          Join voice
        </button>
        <output data-testid="call-status">{call.status}</output>
        <MixerButton />
      </>
    );
  }

  it("mixes per-person and overall volume mid-call without touching the connection", async () => {
    const user = userEvent.setup();
    render(
      <RuntimeConfigProvider value={RUNTIME}>
        <SessionProviders profile={MEMBERS[0].profile} account={ACCOUNT}>
          <AppShell servers={[server]}>
          <CallHarness />
          </AppShell>
        </SessionProviders>
      </RuntimeConfigProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Join voice" }));
    await waitFor(() => expect(screen.getByTestId("call-status")).toHaveTextContent("connected"), { timeout: 5000 }); // first SDK import can be slow under load
    const room = livekitMock.rooms[0];
    const maria = { identity: MEMBERS[1].user_id, name: "Maria", setVolume: vi.fn() };
    room.remoteParticipants.set(maria.identity, maria);

    await user.click(screen.getByRole("button", { name: "Audio mixer" }));
    const mixer = await screen.findByRole("dialog", { name: "Audio mixer" });
    expect(await within(mixer).findAllByTestId("mixer-person")).toHaveLength(1); // the panel loads on first open

    fireEvent.change(within(mixer).getByRole("slider", { name: "Volume for Maria" }), { target: { value: "50" } });
    expect(maria.setVolume).toHaveBeenLastCalledWith(0.5, "screen_share_audio");
    expect(maria.setVolume).toHaveBeenCalledWith(0.5);
    fireEvent.change(within(mixer).getByRole("slider", { name: "Call volume" }), { target: { value: "50" } });
    expect(maria.setVolume).toHaveBeenCalledWith(0.25);

    await user.click(within(mixer).getByRole("button", { name: "Mute Maria for me" }));
    expect(maria.setVolume).toHaveBeenCalledWith(0);
    expect(within(mixer).getByRole("button", { name: "Mute Maria for me" })).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(localStorage.getItem("diskarte:audio-mix")!)).toEqual({ master: 0.5, people: { [maria.identity]: 0 } });

    await user.click(within(mixer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Audio mixer" })).toBeNull());
    expect(room.disconnect).not.toHaveBeenCalled();
    expect(livekitMock.rooms).toHaveLength(1);
    expect(screen.getByTestId("call-status")).toHaveTextContent("connected");
  });

  it("explains itself when there's no call", async () => {
    const user = userEvent.setup();
    render(
      <RuntimeConfigProvider value={RUNTIME}>
        <SessionProviders profile={MEMBERS[0].profile} account={ACCOUNT}>
          <AppShell servers={[server]}>
          <MixerButton />
          </AppShell>
        </SessionProviders>
      </RuntimeConfigProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Audio mixer" }));
    expect(await screen.findByText("NO ACTIVE CALL")).toBeInTheDocument();
    await act(async () => undefined);
  });
});
