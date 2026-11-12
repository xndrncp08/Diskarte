import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { livekitMock, mockCameraPlaceholder, mockParticipant } from "../mocks/livekit";
import { navigation } from "../mocks/navigation";

vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { CallContext, CallProvider, CallSpeakingContext, useCall } = await import("@/components/voice/CallProvider");
type CallContextValue = import("@/components/voice/CallProvider").CallContextValue;
const { ShellKindContext } = await import("@/components/shell/ShellKind");
const { RuntimeConfigProvider } = await import("@/components/providers/RuntimeConfig");
const { PresenceProvider } = await import("@/components/providers/PresenceProvider");
const { CallStrip } = await import("@/components/pulse/shell/CallStrip");
const { CallControls } = await import("@/components/voice/pulse/controls");
const { CallAnnouncer, CallRecovery, recoveryKind } = await import("@/components/voice/pulse/CallRecovery");
const { SpeakingAvatar } = await import("@/components/voice/pulse/people");
const { VoiceLobby } = await import("@/components/voice/pulse/VoiceLobby");
const { ParticipantTile } = await import("@/components/voice/live/ParticipantTile");
const { VoiceChannelView } = await import("@/components/voice/VoiceChannelView");
const { VoiceStage } = await import("@/components/voice/live/VoiceStage");
const { participantProfile } = await import("@/components/voice/participant-profile");
const { useChannelVoicePresence } = await import("@/hooks/useVoiceRoster");
const { toastMock } = await import("../mocks/actions");
const { CHANNELS, MEMBERS, RUNTIME, TAMBAYAN, channelUrl, GENERAL } = await import("../fixtures/layout");
const { SERVER_ID, ServerFixture, makeChannel, presenceFor, server } = await import("../fixtures/server");

const PRIVATE = { ...makeChannel("20000000-0000-4000-8000-0000000000aa", "mods-only", "voice", 9), is_private: true };
const TARGET = { serverId: SERVER_ID, serverName: server.name, channelId: TAMBAYAN.id, channelName: TAMBAYAN.name };

function fakeCall(over: Partial<CallContextValue> = {}): CallContextValue {
  const fn = () => vi.fn(async () => undefined);
  return {
    status: "connected", target: TARGET, muted: false, deafened: false, camera: false, screen: false, noiseSuppression: true, quality: 4, room: null,
    join: fn(), prewarm: vi.fn(), leave: vi.fn(), toggleMute: fn(), toggleDeafen: fn(), toggleCamera: fn(), toggleScreen: fn(), toggleNoiseSuppression: fn(),
    sendData: fn(), onData: () => () => undefined, mix: { master: 1, people: {} }, setMasterVolume: vi.fn(), setParticipantVolume: vi.fn(), toggleLocalMute: vi.fn(),
    toggleVideoOff: vi.fn(), setStreamVolume: vi.fn(), toggleStreamMute: vi.fn(), switchDevice: fn(),
    ...over,
  };
}

/** Pulse, a Tambayan bundle with `presence`, real PresenceProvider (private voice topics) and a call value. */
function Pulse({ call, speaking = [], presence = new Map(), children }: { call?: CallContextValue; speaking?: string[]; presence?: Map<string, ReturnType<typeof presenceFor>>; children: ReactNode }) {
  const inner = call ? (
    <CallContext.Provider value={call}>
      <CallSpeakingContext.Provider value={speaking}>{children}</CallSpeakingContext.Provider>
    </CallContext.Provider>
  ) : (
    <CallProvider>{children}</CallProvider>
  );
  return (
    <RuntimeConfigProvider value={RUNTIME}>
      <ServerFixture members={MEMBERS} presence={presence} overrides={{ channels: [...CHANNELS, PRIVATE] }}>
        <PresenceProvider>
          <ShellKindContext.Provider value="pulse">{inner}</ShellKindContext.Provider>
        </PresenceProvider>
      </ServerFixture>
    </RuntimeConfigProvider>
  );
}

beforeEach(() => {
  livekitMock.reset();
  navigation.reset(channelUrl(GENERAL.id));
});

describe("call controls", () => {
  it("applies System default to an active call when selected in the lobby", async () => {
    const call = fakeCall();
    render(<Pulse call={call}><VoiceLobby channel={TAMBAYAN} joining={false} label="Join" onJoin={() => undefined} /></Pulse>);
    await userEvent.setup().selectOptions(screen.getByRole("combobox", { name: "Microphone" }), "");
    expect(call.switchDevice).toHaveBeenCalledWith("audioinput", "default");
  });

  it("keep fixed names and report state with aria-pressed", async () => {
    const user = userEvent.setup();
    const call = fakeCall({ muted: true, camera: true });
    render(<Pulse call={call}><CallControls layout="dock" /></Pulse>);
    const dock = screen.getByRole("toolbar", { name: "Call controls" });
    const names = within(dock).getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual(["Mute", "Deafen", "Camera", "Share screen", "Noise filter", "Leave"]);
    expect(screen.getByRole("button", { name: "Mute" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Deafen" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Camera" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Leave" })).not.toHaveAttribute("aria-pressed");
    await user.click(screen.getByRole("button", { name: "Mute" }));
    expect(call.toggleMute).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Leave" }));
    expect(call.leave).toHaveBeenCalled();
  });

  it("strip: icon buttons with the same names; compact: Mute and Leave only", () => {
    const { unmount } = render(<Pulse call={fakeCall()}><CallControls layout="strip" /></Pulse>);
    for (const name of ["Mute", "Deafen", "Camera", "Share screen", "Leave call"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    unmount();
    render(<Pulse call={fakeCall()}><CallControls layout="compact" /></Pulse>);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Mute", "Leave call"]);
  });
});

describe("recovery states", () => {
  it("rank reconnecting, sound blocked, mic blocked, then a poor connection", () => {
    const base = { status: "connected" as const, quality: 4 as const };
    expect(recoveryKind({ ...base, status: "reconnecting", audioBlocked: true })).toBe("reconnecting");
    expect(recoveryKind({ ...base, audioBlocked: true, micDenied: true })).toBe("audio");
    expect(recoveryKind({ ...base, micDenied: true, quality: 1 })).toBe("mic");
    expect(recoveryKind({ ...base, quality: 1 })).toBe("poor");
    expect(recoveryKind(base)).toBeNull();
    expect(recoveryKind({ ...base, status: "idle", quality: 0 })).toBeNull();
  });

  it("say what to do next and offer the fix", async () => {
    const user = userEvent.setup();
    const startAudio = vi.fn(async () => undefined);
    const call = fakeCall({ audioBlocked: true, room: { startAudio } as unknown as CallContextValue["room"] });
    const { rerender } = render(<Pulse call={call}><CallRecovery prompt="all" /></Pulse>);
    expect(screen.getByText("Call sound is off")).toBeInTheDocument();
    expect(document.querySelector("[data-audio-prompt='all']")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Turn on sound" }));
    expect(startAudio).toHaveBeenCalled();

    const denied = fakeCall({ micDenied: true, muted: true });
    rerender(<Pulse call={denied}><CallRecovery prompt="all" /></Pulse>);
    expect(screen.getByText(/Allow the microphone in your browser's site settings/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(denied.toggleMute).toHaveBeenCalled();
    // The visible notice is not a live region: CallAnnouncer reads it out once.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("are announced once each, not repeated while they last", () => {
    const at = (over: Partial<CallContextValue>) => <Pulse call={fakeCall(over)}><CallAnnouncer /></Pulse>;
    const { rerender } = render(at({}));
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("");
    rerender(at({ status: "reconnecting" }));
    expect(region).toHaveTextContent(/^Reconnecting…/);
    rerender(at({ status: "reconnecting", muted: true }));
    expect(region).toHaveTextContent(/^Reconnecting…/);
    rerender(at({}));
    expect(region).toHaveTextContent("Back in the call.");
    rerender(at({ quality: 1 }));
    expect(region).toHaveTextContent(/^Poor connection/);
    rerender(at({}));
    rerender(at({ quality: 1 }));
    // A flapping connection is only read out once per call.
    expect(region).toHaveTextContent("");
  });

  it("announces poor connection again after leaving and rejoining the same room", () => {
    const at = (call: CallContextValue) => <Pulse call={call}><CallAnnouncer /></Pulse>;
    const { rerender } = render(at(fakeCall({ quality: 1 })));
    expect(screen.getByRole("status")).toHaveTextContent(/^Poor connection/);
    rerender(at(fakeCall({ status: "idle", target: null })));
    rerender(at(fakeCall({ quality: 1 })));
    expect(screen.getByRole("status")).toHaveTextContent(/^Poor connection/);
  });

  it("reports a rejected sound retry and leaves the recovery action available", async () => {
    const room = { startAudio: vi.fn(async () => { throw new Error("blocked"); }) };
    render(<Pulse call={fakeCall({ audioBlocked: true, room: room as unknown as CallContextValue["room"] })}><CallRecovery prompt="all" /></Pulse>);
    await userEvent.setup().click(screen.getByRole("button", { name: "Turn on sound" }));
    expect(toastMock.toast.error).toHaveBeenCalledWith("Couldn't start call sound. Try again.");
    expect(screen.getByRole("button", { name: "Turn on sound" })).toBeEnabled();
  });

  it("keeps the stage, recovery notice and Leave control while reconnecting", async () => {
    const room = { localParticipant: mockParticipant(MEMBERS[0].user_id, { isLocal: true }), remoteParticipants: new Map(), on: vi.fn(), off: vi.fn() };
    render(<Pulse call={fakeCall({ status: "reconnecting", room: room as unknown as CallContextValue["room"] })}><VoiceChannelView channel={TAMBAYAN} /></Pulse>);
    await waitFor(() => expect(screen.getByTestId("pulse-voice-stage")).toBeInTheDocument());
    expect(screen.getByText("Reconnecting…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave" })).toBeInTheDocument();
  });

  it("CallProvider tracks a refused microphone and blocked sound", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ token: "jwt", url: RUNTIME.livekitUrl, room: `voice:${TAMBAYAN.id}` }), { status: 200 })));
    const { result } = renderHook(() => useCall(), { wrapper: ({ children }: { children: ReactNode }) => <Pulse>{children}</Pulse> });
    await act(() => result.current.join(TARGET));
    await waitFor(() => expect(result.current.status).toBe("connected"));
    const room = livekitMock.rooms.at(-1)!;
    await act(() => result.current.toggleMute());
    room.localParticipant.setMicrophoneEnabled.mockRejectedValueOnce(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    await act(() => result.current.toggleMute());
    expect(result.current.micDenied).toBe(true);
    await act(() => result.current.toggleMute());
    expect(result.current.micDenied).toBe(false);

    act(() => {
      Object.assign(room, { canPlaybackAudio: false });
      room.emit("audioPlaybackChanged");
    });
    expect(result.current.audioBlocked).toBe(true);
    act(() => room.emit("reconnecting"));
    expect(result.current.status).toBe("reconnecting");
    expect(result.current.room).toBe(room);
    act(() => room.emit("reconnected"));
    expect(result.current.status).toBe("connected");
    expect(livekitMock.rooms).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});

describe("private rooms", () => {
  it("returns no voice presence for a missing or unauthorized channel", () => {
    const presence = new Map([[MEMBERS[1].user_id, presenceFor(MEMBERS[1].user_id, { voice_channel_id: PRIVATE.id })]]);
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useChannelVoicePresence(id), {
      initialProps: { id: null as string | null },
      wrapper: ({ children }) => <Pulse call={fakeCall()} presence={presence}>{children}</Pulse>,
    });
    expect(result.current.size).toBe(0);
    rerender({ id: "unknown-channel" });
    expect(result.current.size).toBe(0);
    rerender({ id: TAMBAYAN.id });
    expect(result.current.size).toBe(1);
  });

  it("the lobby never shows a private room's occupants from server-wide presence", () => {
    // Server presence claims Maria is in the private room; only its own voice:<id> topic may say so.
    const presence = new Map([[MEMBERS[1].user_id, presenceFor(MEMBERS[1].user_id, { voice_channel_id: PRIVATE.id })], [MEMBERS[2].user_id, presenceFor(MEMBERS[2].user_id, { voice_channel_id: TAMBAYAN.id })]]);
    const { unmount } = render(<Pulse call={fakeCall({ status: "idle", target: null })} presence={presence}><VoiceLobby channel={PRIVATE} joining={false} label="Join" onJoin={() => undefined} /></Pulse>);
    expect(screen.getByText(/Nobody's here yet/)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Maria/ })).toBeNull();
    unmount();
    // A public room does read server presence.
    render(<Pulse call={fakeCall({ status: "idle", target: null })} presence={presence}><VoiceLobby channel={TAMBAYAN} joining={false} label="Join" onJoin={() => undefined} /></Pulse>);
    expect(screen.getByText("1 person here now")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Juan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join" })).toHaveAttribute("data-variant", "primary");
  });
});

describe("speaking", () => {
  it("keeps keyboard focus inside the screen-share fallback and restores it on Escape", async () => {
    const participant = mockParticipant(MEMBERS[1].user_id);
    livekitMock.tracks = [{ participant, source: "screen_share" }];
    const room = { localParticipant: mockParticipant(MEMBERS[0].user_id), remoteParticipants: new Map(), on: vi.fn(), off: vi.fn() };
    render(<Pulse call={fakeCall({ room: room as unknown as CallContextValue["room"] })}><VoiceStage /></Pulse>);
    const user = userEvent.setup();
    const focus = screen.getByRole("button", { name: "Focus mode (fullscreen)" });
    await user.click(focus);
    const dialog = screen.getByRole("dialog", { name: "Screen share" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Screen share" })).toBeNull();
    expect(screen.getByRole("button", { name: "Focus mode (fullscreen)" })).toHaveFocus();
  });

  it("makes a remote stream's context menu reachable from the keyboard", async () => {
    const participant = mockParticipant(MEMBERS[1].user_id);
    render(<Pulse call={fakeCall()}><ParticipantTile trackRef={{ participant, source: "screen_share" } as never} /></Pulse>);
    const stream = screen.getByRole("group", { name: "Maria's stream options" });
    stream.focus();
    await userEvent.setup().keyboard("{Shift>}{F10}{/Shift}");
    expect(screen.getByRole("menu", { name: "Maria's stream" })).toBeInTheDocument();
  });

  it("falls back safely when participant metadata has an unexpected JSON shape", () => {
    const participant = mockParticipant("guest", { name: "Guest" });
    participant.metadata = "null";
    expect(participantProfile(participant as never)).toMatchObject({ name: "Guest", avatar_url: null, avatar_preset: "araw" });
    participant.metadata = JSON.stringify({ avatar_url: {}, avatar_preset: [] });
    expect(participantProfile(participant as never)).toMatchObject({ name: "Guest", avatar_url: null, avatar_preset: "araw" });
  });
  it("the pulse ring only animates under pulse-motion; the static ring stays for reduced motion", () => {
    const { rerender } = render(<SpeakingAvatar profile={MEMBERS[1].profile} speaking size={72} />);
    const ring = document.querySelector("[data-pulse-ring]")!;
    expect(ring.className).toMatch(/(^| )hidden( |$)/);
    expect(ring.className).toContain("pulse-motion:block");
    expect(ring.className.split(" ").filter((c) => c.includes("animate-")).every((c) => c.startsWith("pulse-motion:"))).toBe(true);
    expect(document.querySelector("[data-speaking] [data-speaking]")?.className).toContain("ring-pulse-live");
    rerender(<SpeakingAvatar profile={MEMBERS[1].profile} speaking={false} size={72} />);
    expect(document.querySelector("[data-pulse-ring]")).toBeNull();
  });

  it("participant cards name the person and their mic, deafen and camera state in words", () => {
    const maria = mockParticipant(MEMBERS[1].user_id, { micOn: false });
    const me = mockParticipant(MEMBERS[0].user_id, { isLocal: true });
    livekitMock.speaking.add(me.identity);
    render(
      <Pulse call={fakeCall()}>
        <ParticipantTile trackRef={mockCameraPlaceholder(maria) as never} />
        <ParticipantTile trackRef={mockCameraPlaceholder(me) as never} deafened />
      </Pulse>,
    );
    const [mariaCard, myCard] = screen.getAllByTestId("participant-card");
    expect(within(mariaCard).getByText("Maria")).toBeInTheDocument();
    expect(within(mariaCard).getByText("Muted")).toBeInTheDocument();
    expect(within(myCard).getByText("(you)")).toBeInTheDocument();
    expect(within(myCard).getByText("Deafened")).toBeInTheDocument();
    expect(myCard).toHaveAttribute("data-speaking", "true");
  });
});

describe("live strip", () => {
  it("keeps Leave available on the call route while the connection is being established", () => {
    navigation.reset(channelUrl(TAMBAYAN.id));
    const call = fakeCall({ status: "connecting" });
    render(<Pulse call={call}><CallStrip compact /></Pulse>);
    expect(screen.getByRole("region", { name: "Live call" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave call" })).toBeEnabled();
  });

  it("shows the room, the people from the call and Open stage; steps aside on the stage page", () => {
    const room = { localParticipant: mockParticipant(MEMBERS[0].user_id, { isLocal: true }), remoteParticipants: new Map([[MEMBERS[2].user_id, mockParticipant(MEMBERS[2].user_id)]]), on: vi.fn(), off: vi.fn() };
    const call = fakeCall({ room: room as unknown as CallContextValue["room"] });
    render(<Pulse call={call} speaking={[MEMBERS[2].user_id]}><CallStrip /></Pulse>);
    const strip = screen.getByRole("region", { name: "Live call" });
    expect(within(strip).getByRole("link", { name: /Tambayan 1/ })).toHaveAttribute("href", channelUrl(TAMBAYAN.id));
    expect(within(strip).getByRole("link", { name: "Open stage" })).toHaveAttribute("href", channelUrl(TAMBAYAN.id));
    expect(within(strip).getByRole("img", { name: "Kapitan, Juan (speaking)" })).toBeInTheDocument();
    expect(within(strip).getByTestId("connection-meter")).toHaveAccessibleName(/^Connection: Excellent/);
    expect(screen.getAllByRole("status")).toHaveLength(1);

    act(() => navigation.push(channelUrl(TAMBAYAN.id)));
    expect(screen.queryByRole("region", { name: "Live call" })).toBeNull();
    // The announcer stays: the stage's notice isn't a live region.
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("compact: one row with the room, Mute, Leave and Open stage, and no second live region", () => {
    render(<Pulse call={fakeCall({ quality: 1 })}><CallStrip compact /></Pulse>);
    const strip = screen.getByTestId("call-strip-compact");
    expect(within(strip).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Mute", "Leave call"]);
    expect(within(strip).getByRole("link", { name: "Open stage" })).toBeInTheDocument();
    expect(within(strip).getByText("Poor connection")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
