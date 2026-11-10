import { act, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";

const tables: Record<string, unknown[]> = {};
const fake = createFakeSupabase(tables);
vi.mock("@/components/providers/RuntimeConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/RuntimeConfig")>()),
  useSupabase: () => fake.client,
}));

const { MeProvider } = await import("@/components/providers/MeProvider");
const { PresenceProvider, useBroadcastSpeaking, usePresenceRejoin, useServerPresence, useVoicePresence } = await import("@/components/providers/PresenceProvider");
const { CHANNELS, MEMBERS } = await import("../fixtures/layout");
const { SERVER_ID, ServerFixture } = await import("../fixtures/server");
const { useVoiceRoster } = await import("@/hooks/useVoiceRoster");
const { CallContext } = await import("@/components/voice/CallProvider");

const ME = MEMBERS[0].profile;
const PUBLIC_VOICE = CHANNELS[3];
const PRIVATE_VOICE = { ...CHANNELS[4], is_private: true };
const SERVER = `server:${SERVER_ID}`;
const VOICE = `voice:${PRIVATE_VOICE.id}`;

type Payload = { status: string; voice_channel_id: string | null };
const tracks = (topic: string) =>
  fake.channels.filter((c) => c.name === topic).flatMap((c) => vi.mocked(c.handle.track).mock.calls.map(([p]) => p as Payload));

let speak: (speaking: boolean) => void = () => undefined;
let rejoin: () => void = () => undefined;
function InVoice({ channelId }: { channelId: string | null }) {
  useServerPresence(SERVER_ID);
  const setVoice = useVoicePresence();
  const broadcast = useBroadcastSpeaking();
  const confirmVisible = usePresenceRejoin();
  useEffect(() => {
    speak = (speaking) => broadcast(SERVER_ID, speaking);
    rejoin = confirmVisible;
  }, [broadcast, confirmVisible]);
  useEffect(() => {
    setVoice(channelId ? { serverId: SERVER_ID, channelId, muted: false, deafened: false, video: false, screen: false } : null);
  }, [channelId, setVoice]);
  return null;
}

function renderAs(status: string, channelId: string | null) {
  const ui = (s: string, c: string | null) => (
    <MeProvider profile={{ ...ME, status: s as typeof ME.status }}>
      <PresenceProvider>
        <InVoice channelId={c} />
      </PresenceProvider>
    </MeProvider>
  );
  const view = render(ui(status, channelId));
  return { rerender: (s: string, c: string | null) => view.rerender(ui(s, c)) };
}

beforeEach(() => {
  fake.channels.length = 0;
  tables.channels = [PUBLIC_VOICE, PRIVATE_VOICE];
});

describe("presence privacy", () => {
  it("announces a public voice channel server-wide", async () => {
    renderAs("online", PUBLIC_VOICE.id);
    await waitFor(() => expect(tracks(SERVER).at(-1)?.voice_channel_id).toBe(PUBLIC_VOICE.id));
    expect(fake.channels.some((c) => c.name.startsWith("voice:"))).toBe(false);
  });

  it("keeps a private voice channel off the server topic and shares it on its own topic", async () => {
    renderAs("online", PRIVATE_VOICE.id);
    await waitFor(() => expect(tracks(VOICE).at(-1)?.voice_channel_id).toBe(PRIVATE_VOICE.id));
    expect(fake.joined(VOICE)!.config).toMatchObject({ private: true });
    expect(tracks(SERVER).length).toBeGreaterThan(0);
    expect(tracks(SERVER).every((p) => p.voice_channel_id === null)).toBe(true);

    act(() => speak(true));
    expect(fake.joined(VOICE)!.sent).toContainEqual({ type: "broadcast", event: "speaking", payload: { user_id: ME.id, speaking: true } });
    expect(fake.joined(SERVER)!.sent).toEqual([]);
  });

  it("tracks nothing while invisible, then rejoins and shows up once the server has stored visible", async () => {
    const view = renderAs("invisible", PRIVATE_VOICE.id);
    await waitFor(() => expect(fake.joined(VOICE)).toBeDefined());
    await waitFor(() => expect(fake.joined(SERVER)).toBeDefined());
    act(() => speak(true));
    expect(tracks(SERVER)).toEqual([]);
    expect(tracks(VOICE)).toEqual([]);
    expect(fake.joined(VOICE)!.sent).toEqual([]);

    // Optimistically visible: rejoining now would be refused presence (the flag isn't cleared yet).
    view.rerender("online", PRIVATE_VOICE.id);
    await new Promise((r) => setTimeout(r, 20));
    expect(fake.channels.filter((c) => c.name === SERVER)).toHaveLength(1);
    act(() => rejoin());
    // A fresh join each: Realtime only re-checks the "may publish presence" policy on join.
    const fresh = (topic: string) => fake.channels.filter((c) => c.name === topic)[1];
    await waitFor(() => expect(vi.mocked(fresh(SERVER)?.handle.track).mock.calls.at(-1)?.[0]).toMatchObject({ status: "online" }));
    await waitFor(() => expect(vi.mocked(fresh(VOICE)?.handle.track).mock.calls.at(-1)?.[0]).toMatchObject({ voice_channel_id: PRIVATE_VOICE.id }));

    view.rerender("invisible", PRIVATE_VOICE.id);
    await waitFor(() => expect(vi.mocked(fake.joined(SERVER)!.handle.untrack)).toHaveBeenCalled());
    expect(vi.mocked(fake.joined(VOICE)!.handle.untrack)).toHaveBeenCalled();
  });

  it("rejoins when the server confirms in the same tick as the status change (another tab's choice)", async () => {
    const view = renderAs("invisible", null);
    await waitFor(() => expect(fake.joined(SERVER)).toBeDefined());
    act(() => {
      rejoin();
      view.rerender("online", null);
    });
    await waitFor(() => expect(fake.channels.filter((c) => c.name === SERVER)).toHaveLength(2));
    await waitFor(() => expect(tracks(SERVER).at(-1)?.status).toBe("online"));
  });

  it("doesn't re-send an unchanged server payload when joining a private call (no timing tell)", async () => {
    const view = renderAs("online", null);
    await waitFor(() => expect(tracks(SERVER)).toHaveLength(1));
    view.rerender("online", PRIVATE_VOICE.id);
    await waitFor(() => expect(tracks(VOICE).at(-1)?.voice_channel_id).toBe(PRIVATE_VOICE.id));
    expect(tracks(SERVER)).toHaveLength(1);
    view.rerender("online", null);
    view.rerender("dnd", null);
    await waitFor(() => expect(tracks(SERVER).at(-1)?.status).toBe("dnd"));
    expect(tracks(SERVER)).toHaveLength(2);
  });

  it("sidebar rosters read a private channel's occupants from its own topic only", async () => {
    const maria = MEMBERS[1].profile;
    function Roster({ channelId }: { channelId: string }) {
      return <output data-testid={channelId}>{useVoiceRoster(channelId).map((r) => r.member.user_id).join(",")}</output>;
    }
    const view = render(
      <ServerFixture members={MEMBERS} overrides={{ channels: [PUBLIC_VOICE, PRIVATE_VOICE] }}>
        <PresenceProvider>
          <CallContext.Provider value={{ status: "idle", target: null } as never}>
            <Roster channelId={PRIVATE_VOICE.id} />
          </CallContext.Provider>
        </PresenceProvider>
      </ServerFixture>,
    );
    await waitFor(() => expect(fake.joined(VOICE)).toBeDefined());
    act(() => fake.syncPresence(VOICE, { [maria.id]: [{ user_id: maria.id, status: "online", voice_channel_id: PRIVATE_VOICE.id, online_at: new Date().toISOString() }] }));
    expect(view.getByTestId(PRIVATE_VOICE.id)).toHaveTextContent(maria.id);
  });

  it("treats a channel it can't read as private", async () => {
    tables.channels = [];
    renderAs("online", PUBLIC_VOICE.id);
    await waitFor(() => expect(fake.joined(`voice:${PUBLIC_VOICE.id}`)).toBeDefined());
    expect(tracks(SERVER).every((p) => p.voice_channel_id === null)).toBe(true);
  });
});
