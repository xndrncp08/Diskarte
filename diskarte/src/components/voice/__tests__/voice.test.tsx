import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bestGrid } from "@/lib/voice-layout";

// ---- livekit-client mock -------------------------------------------------------------
const roomInstances: FakeRoom[] = [];
class FakeRoom {
  handlers = new Map<string, (...args: unknown[]) => void>();
  connect = vi.fn(async () => undefined);
  disconnect = vi.fn(async () => undefined);
  remoteParticipants = new Map<string, { identity: string; setVolume: (v: number) => void }>();
  localParticipant = {
    setMicrophoneEnabled: vi.fn(async () => undefined),
    setCameraEnabled: vi.fn(async () => undefined),
    setScreenShareEnabled: vi.fn(async () => undefined),
    getTrackPublication: vi.fn(() => undefined),
  };
  constructor(public options: unknown) {
    roomInstances.push(this);
  }
  on(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, handler);
    return this;
  }
  removeAllListeners() {
    this.handlers.clear();
  }
}
vi.mock("livekit-client", async (orig) => ({ ...(await orig<typeof import("livekit-client")>()), Room: FakeRoom }));
vi.mock("@livekit/components-react", () => ({
  RoomContext: { Provider: ({ children }: { children: ReactNode }) => <>{children}</> },
  RoomAudioRenderer: ({ muted }: { muted: boolean }) => <div data-testid="audio-renderer" data-muted={String(muted)} />,
}));
const setVoice = vi.fn();
vi.mock("@/components/providers/PresenceProvider", () => ({ useVoicePresence: () => setVoice, useServerPresence: () => new Map(), useBroadcastSpeaking: () => () => undefined }));
const sfx = vi.fn();
vi.mock("@/lib/sfx", () => ({ playSfx: (n: string) => sfx(n) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const { CallProvider, useCall, usePrewarm, qualityToLevel, PREWARM_FRESH_MS, PREWARM_GAP_MS } = await import("@/components/voice/CallProvider");
const { CallDock } = await import("@/components/voice/CallDock");
const { ConnectionQuality } = await import("livekit-client");

const target = { serverId: "s1", serverName: "Barkada HQ", channelId: "20000000-0000-4000-8000-000000000003", channelName: "Tambayan 1" };
const wrapper = ({ children }: { children: ReactNode }) => <CallProvider>{children}</CallProvider>;

beforeEach(() => {
  roomInstances.length = 0;
  setVoice.mockReset();
  sfx.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ token: "jwt", url: "wss://proj.livekit.cloud", room: "voice:x" }), { status: 200 })),
  );
});

describe("switching and leaving voice channels", () => {
  const other = { ...target, channelId: "20000000-0000-4000-8000-000000000004", channelName: "Chill & Music" };
  afterEach(() => vi.useRealTimers());

  it("disconnects the old room before connecting the new one, and moves my voice presence", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await act(async () => {
      await result.current.join(target);
    });
    await act(async () => {
      await result.current.join(other);
    });
    const [oldRoom, newRoom] = roomInstances;
    expect(roomInstances).toHaveLength(2);
    expect(oldRoom.disconnect).toHaveBeenCalledTimes(1);
    // Clean sequence: the old room is closed before the new one starts connecting.
    expect(oldRoom.disconnect.mock.invocationCallOrder[0]).toBeLessThan(newRoom.connect.mock.invocationCallOrder[0]);
    expect(newRoom.disconnect).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ status: "connected", target: other });

    // Watchers see me leave the old channel before I appear in the new one.
    const calls = setVoice.mock.calls.map(([v]) => (v as { channelId?: string } | null)?.channelId ?? null);
    const inOld = calls.lastIndexOf(target.channelId);
    const cleared = calls.indexOf(null, inOld);
    expect(inOld).toBeGreaterThanOrEqual(0);
    expect(cleared).toBeGreaterThan(inOld);
    expect(calls.indexOf(other.channelId, cleared)).toBeGreaterThan(cleared);
  });

  it("drops my voice presence the moment I leave", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await act(async () => {
      await result.current.join(target);
    });
    setVoice.mockClear();
    result.current.leave(); // synchronously — before any re-render or effect
    expect(setVoice).toHaveBeenCalledWith(null);
    expect(roomInstances[0].disconnect).toHaveBeenCalledTimes(1);
    await act(async () => undefined);
    expect(result.current.status).toBe("idle");
  });

  it("doesn't let a hung disconnect block switching", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useCall(), { wrapper });
    await act(async () => {
      await result.current.join(target);
    });
    roomInstances[0].disconnect.mockImplementation(() => new Promise<undefined>(() => undefined));
    let switching!: Promise<void>;
    act(() => {
      switching = result.current.join(other);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
      await switching;
    });
    expect(roomInstances[1].connect).toHaveBeenCalled();
    expect(result.current.status).toBe("connected");
  });
});

describe("voice pre-warming", () => {
  const other = { ...target, channelId: "20000000-0000-4000-8000-000000000004", channelName: "Chill & Music" };
  const tokenCalls = () => vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/livekit/token");
  afterEach(() => vi.useRealTimers());

  it("mints the token on intent, so joining connects without another round trip", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    act(() => result.current.prewarm(target));
    act(() => result.current.prewarm(target)); // deduped
    expect(tokenCalls()).toHaveLength(1);
    await act(async () => {
      await result.current.join(target);
    });
    expect(tokenCalls()).toHaveLength(1);
    expect(roomInstances[0].connect).toHaveBeenCalledWith("wss://proj.livekit.cloud", "jwt", { autoSubscribe: true });
  });

  it("spaces pre-warms out so sweeping over channels can't burn the token rate limit", () => {
    vi.useFakeTimers({ now: new Date("2026-10-02T10:00:00Z") });
    const { result } = renderHook(() => useCall(), { wrapper });
    act(() => result.current.prewarm(target));
    act(() => result.current.prewarm(other));
    expect(tokenCalls()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(PREWARM_GAP_MS));
    act(() => result.current.prewarm(other));
    expect(tokenCalls()).toHaveLength(2);
  });

  it("falls back to a fresh token when the warmed one is stale or failed", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-02T10:00:00Z"), shouldAdvanceTime: true });
    const { result } = renderHook(() => useCall(), { wrapper });
    act(() => result.current.prewarm(target));
    vi.setSystemTime(Date.now() + PREWARM_FRESH_MS + 1);
    await act(async () => {
      await result.current.join(target);
    });
    expect(tokenCalls()).toHaveLength(2);

    act(() => result.current.leave());
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: "rate limited" }), { status: 429 }));
    vi.setSystemTime(Date.now() + PREWARM_GAP_MS);
    act(() => result.current.prewarm(other));
    await act(async () => {
      await result.current.join(other);
    });
    expect(tokenCalls()).toHaveLength(4);
    expect(result.current.status).toBe("connected");
  });

  it("warms on a deliberate hover, focus or touch — not a mouse sweeping past", () => {
    vi.useFakeTimers({ now: new Date("2026-10-02T10:00:00Z") });
    const { result } = renderHook(() => usePrewarm(), { wrapper });
    const handlers = result.current(target) as { onPointerEnter: () => void; onPointerLeave: () => void; onFocus: () => void };
    act(() => {
      handlers.onPointerEnter();
      vi.advanceTimersByTime(100);
      handlers.onPointerLeave();
      vi.advanceTimersByTime(500);
    });
    expect(tokenCalls()).toHaveLength(0);
    act(() => {
      handlers.onPointerEnter();
      vi.advanceTimersByTime(150);
    });
    expect(tokenCalls()).toHaveLength(1);
  });
});

describe("CallProvider", () => {
  it("fetches a token, connects, enables the mic and announces presence", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await act(async () => {
      await result.current.join(target);
    });
    expect(fetch).toHaveBeenCalledWith("/api/livekit/token", expect.objectContaining({ method: "POST", body: JSON.stringify({ channelId: target.channelId }) }));
    const room = roomInstances[0];
    expect(room.connect).toHaveBeenCalledWith("wss://proj.livekit.cloud", "jwt", { autoSubscribe: true });
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(result.current.status).toBe("connected");
    expect(sfx).toHaveBeenCalledWith("join");
    expect(setVoice).toHaveBeenLastCalledWith(expect.objectContaining({ serverId: "s1", channelId: target.channelId, muted: false }));
  });

  it("mutes, deafens (muting the audio renderer) and restores the mic", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await act(async () => {
      await result.current.join(target);
    });
    const mic = roomInstances[0].localParticipant.setMicrophoneEnabled;
    await act(async () => {
      await result.current.toggleMute();
    });
    expect(mic).toHaveBeenLastCalledWith(false);
    expect(result.current.muted).toBe(true);
    await act(async () => {
      await result.current.toggleMute();
    });
    await act(async () => {
      await result.current.toggleDeafen();
    });
    expect(result.current).toMatchObject({ deafened: true, muted: true });
    expect(await screen.findByTestId("audio-renderer")).toHaveAttribute("data-muted", "true"); // lazily loaded chunk
    await act(async () => {
      await result.current.toggleDeafen();
    });
    expect(result.current).toMatchObject({ deafened: false, muted: false });
    expect(mic).toHaveBeenLastCalledWith(true);
  });

  it("toggles camera and screen share", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await act(async () => {
      await result.current.join(target);
    });
    await act(async () => {
      await result.current.toggleCamera();
      await result.current.toggleScreen();
    });
    expect(roomInstances[0].localParticipant.setCameraEnabled).toHaveBeenCalledWith(true);
    expect(roomInstances[0].localParticipant.setScreenShareEnabled).toHaveBeenCalledWith(true, expect.objectContaining({ audio: true }));
    expect(result.current).toMatchObject({ camera: true, screen: true });
  });

  it("leaves cleanly and clears presence", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await act(async () => {
      await result.current.join(target);
    });
    act(() => result.current.leave());
    expect(roomInstances[0].disconnect).toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
    expect(setVoice).toHaveBeenLastCalledWith(null);
    expect(sfx).toHaveBeenCalledWith("leave");
  });

  it("surfaces token errors without connecting", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Not a voice channel" }), { status: 400 })));
    const { result } = renderHook(() => useCall(), { wrapper });
    await act(async () => {
      await result.current.join(target);
    });
    expect(roomInstances).toHaveLength(0);
    expect(result.current.status).toBe("idle");
    expect(sfx).toHaveBeenCalledWith("error");
  });

  it("maps connection quality to arcade bars", () => {
    expect(qualityToLevel(ConnectionQuality.Excellent)).toBe(4);
    expect(qualityToLevel(ConnectionQuality.Good)).toBe(3);
    expect(qualityToLevel(ConnectionQuality.Poor)).toBe(1);
    expect(qualityToLevel(ConnectionQuality.Lost)).toBe(0);
  });
});

describe("CallDock", () => {
  it("appears during a call with working controls", async () => {
    function Harness() {
      const call = useCall();
      return (
        <>
          <button type="button" onClick={() => void call.join(target)}>
            join
          </button>
          <CallDock />
        </>
      );
    }
    render(
      <CallProvider>
        <Harness />
      </CallProvider>,
    );
    expect(screen.queryByTestId("call-dock")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByText("join"));
    });
    const dock = await screen.findByTestId("call-dock");
    expect(dock).toHaveTextContent("Voice Connected");
    expect(dock).toHaveTextContent("Tambayan 1 / Barkada HQ");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    });
    expect(screen.getByRole("button", { name: "Unmute" })).toHaveAttribute("aria-pressed", "true");
    act(() => fireEvent.click(screen.getByRole("button", { name: "Disconnect" })));
    expect(roomInstances[0].disconnect).toHaveBeenCalled();
  });
});

describe("bestGrid", () => {
  it("chooses the layout with the biggest tiles", () => {
    expect(bestGrid(1, 1200, 700)).toMatchObject({ columns: 1, rows: 1 });
    expect(bestGrid(2, 1400, 500)).toMatchObject({ columns: 2, rows: 1 });
    expect(bestGrid(2, 1200, 700)).toMatchObject({ columns: 1, rows: 2 });
    expect(bestGrid(4, 1200, 700)).toMatchObject({ columns: 2, rows: 2 });
    expect(bestGrid(9, 1600, 900)).toMatchObject({ columns: 3, rows: 3 });
    expect(bestGrid(3, 400, 1200).columns).toBe(1);
    expect(bestGrid(0, 100, 100)).toMatchObject({ tileWidth: 0 });
  });
});
