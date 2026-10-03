import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_STATS, healthLevel, summarizeStats, type StatLike } from "@/lib/call-stats";
import { isOptimizable, imageHosts, serializeImageHosts } from "@/lib/image-hosts";
import { DEFAULT_SFX_SETTINGS, getSfxSettings, playSfx, resetSfxSettingsCache, setSfxSettings, SFX_NAMES } from "@/lib/sfx";
import { audioMock } from "../mocks/audio";
import { livekitMock, mockCameraPlaceholder, mockParticipant } from "../mocks/livekit";
import { navigation } from "../mocks/navigation";
import { MOD_ID, OWNER_ID } from "../fixtures/server";

vi.mock("@/actions/messages", async () => (await import("../mocks/actions")).messageActions);
vi.mock("@/actions/servers", async () => (await import("../mocks/actions")).serverActions);
vi.mock("@/actions/profile", async () => (await import("../mocks/actions")).profileActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { ACCOUNT, DiskarteLayout, GENERAL, MEMBERS, RUNTIME, TAMBAYAN, channelUrl, messageFixture } = await import("../fixtures/layout");
const { SoundSettings } = await import("@/components/profile/SoundSettings");
const { useCallStats } = await import("@/hooks/useCallStats");

function setCoarsePointer(coarse: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes("pointer: coarse") ? coarse : query.includes("min-width: 768px") ? !coarse : false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  resetSfxSettingsCache();
  audioMock.notes.length = 0;
  setCoarsePointer(false);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ token: "jwt", url: RUNTIME.livekitUrl }), { status: 200 })));
});

afterEach(() => vi.useRealTimers());

// =============================================================================================
describe("connection quality stats", () => {
  const sample = (lost: number, received: number, extra: StatLike[] = []): StatLike[] => [
    { type: "candidate-pair", nominated: true, currentRoundTripTime: 0.042 },
    { type: "inbound-rtp", kind: "audio", packetsLost: lost, packetsReceived: received, jitter: 0.008 },
    ...extra,
  ];

  it("reports RTT and jitter in ms and packet loss from counter deltas", () => {
    const first = summarizeStats(sample(10, 990), null);
    expect(first.stats).toEqual({ rttMs: 42, lossPct: null, jitterMs: 8 }); // no window yet
    const second = summarizeStats(sample(20, 1980), first.totals);
    expect(second.stats.lossPct).toBe(1); // 10 lost of 1000 in this window
  });

  it("uses the SFU's view of our uplink when it's worse", () => {
    const r = summarizeStats(sample(0, 100, [{ type: "remote-inbound-rtp", fractionLost: 0.05, roundTripTime: 0.3 }]), { lost: 0, received: 50 });
    expect(r.stats.lossPct).toBe(5);
    expect(r.stats.rttMs).toBe(42); // candidate-pair RTT preferred
  });

  it("maps stats + LiveKit quality to arcade signal bars", () => {
    expect(healthLevel({ rttMs: 40, lossPct: 0, jitterMs: 3 }, 4)).toBe(4);
    expect(healthLevel({ rttMs: 150, lossPct: 0, jitterMs: 3 }, 4)).toBe(3);
    expect(healthLevel({ rttMs: 40, lossPct: 5, jitterMs: 3 }, 4)).toBe(2);
    expect(healthLevel({ rttMs: 500, lossPct: 0, jitterMs: 3 }, 4)).toBe(1);
    expect(healthLevel(EMPTY_STATS, 2)).toBe(2); // LiveKit's rating caps it
  });

  it("polls tracks of the active room", async () => {
    vi.useFakeTimers();
    let lost = 0;
    const report = () => new Map<string, StatLike>([["c", { type: "candidate-pair", selected: true, currentRoundTripTime: 0.12 }], ["i", { type: "inbound-rtp", packetsLost: lost, packetsReceived: 1000 + lost * 10 }]]);
    const track = { getRTCStatsReport: vi.fn(async () => report() as unknown as RTCStatsReport) };
    const room = {
      localParticipant: { trackPublications: new Map([["mic", { track }]]) },
      remoteParticipants: new Map([["p", { audioTrackPublications: new Map([["a", { track }]]) }]]),
    };
    const { result } = renderHook(() => useCallStats(room as never, 1000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(result.current.rttMs).toBe(120);
    lost = 30;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.lossPct).toBeGreaterThan(0);
    expect(track.getRTCStatsReport).toHaveBeenCalled();
  });
});

// =============================================================================================
describe("8-bit sound settings", () => {
  it("persists enabled + volume and reads the legacy on/off value", () => {
    expect(getSfxSettings()).toEqual(DEFAULT_SFX_SETTINGS);
    setSfxSettings({ volume: 0.25 });
    resetSfxSettingsCache();
    expect(getSfxSettings()).toEqual({ enabled: true, volume: 0.25 });
    localStorage.setItem("diskarte:sfx", "off");
    resetSfxSettingsCache();
    expect(getSfxSettings().enabled).toBe(false);
    setSfxSettings({ volume: 7 });
    expect(getSfxSettings().volume).toBe(1); // clamped
  });

  it("every cue synthesises; toggles add a noise click; muted/zero volume is silent", () => {
    for (const name of SFX_NAMES) playSfx(name);
    expect(audioMock.notes.length).toBeGreaterThan(SFX_NAMES.length);
    audioMock.notes.length = 0;
    playSfx("mute");
    expect(audioMock.notes).toContain(-1); // buffer source = click
    audioMock.notes.length = 0;
    setSfxSettings({ enabled: false });
    playSfx("join");
    expect(audioMock.notes).toHaveLength(0);
    playSfx("join", 0.5); // explicit preview volume still plays
    expect(audioMock.notes.length).toBeGreaterThan(0);
    audioMock.notes.length = 0;
    setSfxSettings({ enabled: true, volume: 0 });
    playSfx("message");
    expect(audioMock.notes).toHaveLength(0);
  });

  it("settings UI: switch, volume slider and previews", async () => {
    const user = userEvent.setup();
    render(<SoundSettings />);
    const toggle = screen.getByRole("switch", { name: "8-bit sound effects" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    const slider = screen.getByLabelText("Volume");
    fireEvent.change(slider, { target: { value: "30" } });
    expect(getSfxSettings().volume).toBe(0.3);
    expect(slider).toHaveAttribute("aria-valuetext", "30%");
    await user.click(screen.getByRole("button", { name: /Join/ }));
    expect(audioMock.notes.length).toBeGreaterThan(0);
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(slider).toBeDisabled();
    expect(JSON.parse(localStorage.getItem("diskarte:sfx")!)).toEqual({ enabled: false, volume: 0.3 });
  });

  it("is reachable from the user panel", async () => {
    const user = userEvent.setup();
    navigation.set(channelUrl(GENERAL.id));
    render(<DiskarteLayout />);
    const button = within(screen.getByTestId("user-panel")).getByRole("button", { name: "Sound settings" });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Sound settings" });
    expect(dialog.parentElement).toBe(document.body);
    expect(within(dialog).getByRole("switch", { name: "8-bit sound effects" })).toBeInTheDocument();
    expect(within(dialog).getByRole("switch", { name: /Low-data mode/ })).toHaveAttribute("aria-checked", "false");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Sound settings" })).toBeNull());
    expect(button).toHaveFocus();
  });
});

// =============================================================================================
describe("voice polish", () => {
  it("shows the connection meter in the call dock and a neon glow on speaking tiles", async () => {
    const user = userEvent.setup();
    navigation.set(channelUrl(TAMBAYAN.id));
    livekitMock.tracks = [mockCameraPlaceholder(mockParticipant(OWNER_ID, { isLocal: true })), mockCameraPlaceholder(mockParticipant(MOD_ID))];
    livekitMock.speaking.add(MOD_ID);
    render(<DiskarteLayout />);
    await user.click(screen.getByTestId("join-voice"));
    const stage = await screen.findByTestId("voice-stage");
    const tiles = within(stage).getAllByTestId("participant-tile");
    const speaking = tiles.find((t) => t.dataset.speaking);
    expect(speaking).toHaveClass("neon-speaking");
    expect(tiles.filter((t) => t.classList.contains("neon-speaking"))).toHaveLength(1);

    const meter = within(screen.getByTestId("call-dock")).getByTestId("connection-meter");
    expect(meter).toHaveAccessibleName(/Connection: .*latency.*packet loss/);
    await user.click(meter);
    const details = await screen.findByRole("dialog", { name: "Connection details" });
    for (const label of ["Latency (RTT)", "Packet loss", "Jitter", "LiveKit rating"]) expect(within(details).getByText(label)).toBeInTheDocument();
  });

  it("loads the call grid lazily behind a skeleton", async () => {
    const user = userEvent.setup();
    navigation.set(channelUrl(TAMBAYAN.id));
    render(<DiskarteLayout />);
    await user.click(screen.getByTestId("join-voice"));
    // Either the skeleton is showing or the chunk already resolved — never an empty view.
    await waitFor(() => expect(screen.queryByTestId("stage-skeleton") ?? screen.queryByTestId("voice-stage")).not.toBeNull());
    expect(await screen.findByTestId("voice-stage")).toBeInTheDocument();
  });
});

// =============================================================================================
describe("mobile interactions", () => {
  it("swipes the navigation drawer open from the left edge and closed again", async () => {
    setCoarsePointer(true);
    const { AppShell, DrawerPanel } = await import("@/components/shell/AppShell");
    const { SessionProviders } = await import("@/components/shell/SessionProviders");
    const { server } = await import("../fixtures/server");
    const { RuntimeConfigProvider } = await import("@/components/providers/RuntimeConfig");
    render(
      <RuntimeConfigProvider value={RUNTIME}>
        <SessionProviders profile={MEMBERS[0].profile} account={ACCOUNT}>
          <AppShell servers={[server]}>
          <DrawerPanel>
            <aside aria-label="Drawer content">x</aside>
          </DrawerPanel>
          </AppShell>
        </SessionProviders>
      </RuntimeConfigProvider>,
    );
    const shell = screen.getByTestId("shell");
    const swipe = (from: number, to: number, y = 300, dy = 0) => {
      fireEvent.touchStart(shell, { touches: [{ clientX: from, clientY: y }] });
      fireEvent.touchMove(shell, { touches: [{ clientX: to, clientY: y + dy }] });
      fireEvent.touchEnd(shell, { touches: [] });
    };
    swipe(200, 320); // not from the edge → ignored
    expect(screen.queryByRole("button", { name: "Close navigation" })).toBeNull();
    swipe(10, 40, 300, 120); // mostly vertical → a scroll, ignored
    expect(screen.queryByRole("button", { name: "Close navigation" })).toBeNull();
    swipe(10, 120);
    expect(await screen.findByRole("button", { name: "Close navigation" })).toBeInTheDocument();
    swipe(300, 150);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Close navigation" })).toBeNull());
  });

  it("tapping a message pins its action bar open on touch screens", async () => {
    setCoarsePointer(true);
    navigation.set(channelUrl(GENERAL.id));
    render(<DiskarteLayout history={{ [GENERAL.id]: [messageFixture("m1", GENERAL.id, MOD_ID, "Tap me"), messageFixture("m2", GENERAL.id, MOD_ID, "Or me")] }} />);
    const [first, second] = screen.getAllByTestId("message");
    fireEvent.click(within(first).getByText("Tap me"));
    expect(first).toHaveAttribute("data-active", "true");
    fireEvent.click(within(second).getByText("Or me"));
    expect(second).toHaveAttribute("data-active", "true");
    expect(first).not.toHaveAttribute("data-active");
    // Tapping a control inside doesn't toggle.
    fireEvent.click(within(second).getByRole("button", { name: "Reply" }));
    expect(second).toHaveAttribute("data-active", "true");
  });

  it("mouse clicks don't toggle the action bar (hover handles it)", () => {
    navigation.set(channelUrl(GENERAL.id));
    render(<DiskarteLayout history={{ [GENERAL.id]: [messageFixture("m1", GENERAL.id, MOD_ID, "Click me")] }} />);
    const msg = screen.getByTestId("message");
    fireEvent.click(within(msg).getByText("Click me"));
    expect(msg).not.toHaveAttribute("data-active");
  });

  it("gives small controls a 44px touch target", () => {
    navigation.set(channelUrl(GENERAL.id));
    render(<DiskarteLayout history={{ [GENERAL.id]: [messageFixture("m1", GENERAL.id, MOD_ID, "Hi")] }} />);
    const small = [
      screen.getByRole("button", { name: "Attach files" }),
      screen.getByRole("button", { name: "Insert emoji" }),
      screen.getByRole("button", { name: "Send message" }),
      screen.getByRole("button", { name: "Pinned messages" }),
      screen.getByRole("button", { name: "Sound settings" }),
      screen.getByRole("link", { name: "User settings" }),
      within(screen.getByTestId("message")).getByRole("button", { name: "Reply" }),
    ];
    for (const el of small) expect(el.className, el.getAttribute("aria-label") ?? "").toMatch(/touch-target/);
    const link = within(screen.getByRole("navigation", { name: "Channels" })).getByRole("link", { name: "general" });
    expect(link.className).toContain("pointer-coarse:py-2.5");
  });
});

// =============================================================================================
describe("image optimisation hosts", () => {
  const serialized = serializeImageHosts(imageHosts("http://127.0.0.1:54321"));

  it("optimises Supabase Storage and OAuth avatars only", () => {
    expect(isOptimizable("https://abc.supabase.co/storage/v1/object/public/avatars/u/a.png", serialized)).toBe(true);
    expect(isOptimizable("https://abc.supabase.co/storage/v1/object/sign/attachments/x.png?token=t", serialized)).toBe(true);
    expect(isOptimizable("http://127.0.0.1:54321/storage/v1/object/public/avatars/a.png", serialized)).toBe(true);
    expect(isOptimizable("https://avatars.githubusercontent.com/u/1?v=4", serialized)).toBe(true);
    expect(isOptimizable("https://abc.supabase.co/rest/v1/profiles", serialized)).toBe(false);
    expect(isOptimizable("https://evil.example/storage/v1/object/public/x.png", serialized)).toBe(false);
    expect(isOptimizable("https://abc.supabase.co.evil.example/storage/v1/object/x.png", serialized)).toBe(false);
    expect(isOptimizable("blob:http://localhost/123", serialized)).toBe(false);
    expect(isOptimizable("https://abc.supabase.co/storage/v1/object/public/a.png", undefined)).toBe(false);
  });

  it("falls back to a plain lazy <img> for unknown hosts (never throws)", async () => {
    const { SmartImage } = await import("@/components/ui/SmartImage");
    const { container } = render(<SmartImage src="https://cdn.example.org/a.png" alt="x" width={40} height={40} />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", "https://cdn.example.org/a.png");
    expect(img).toHaveAttribute("loading", "lazy");
  });
});
