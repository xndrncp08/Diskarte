import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { livekitMock } from "../mocks/livekit";

const fake = createFakeSupabase();
vi.mock("@/components/providers/RuntimeConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/RuntimeConfig")>()),
  useSupabase: () => fake.client,
  useOptionalSupabase: () => fake.client,
}));
vi.mock("@/actions/profile", async () => (await import("../mocks/actions")).profileActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { MeProvider } = await import("@/components/providers/MeProvider");
const { PresenceProvider, SPEAKING_TTL_MS, useServerSpeaking } = await import("@/components/providers/PresenceProvider");
const { AppShell } = await import("@/components/shell/AppShell");
const { SessionProviders } = await import("@/components/shell/SessionProviders");
const { RuntimeConfigProvider } = await import("@/components/providers/RuntimeConfig");
const { useCall } = await import("@/components/voice/CallProvider");
const { ACCOUNT, MEMBERS, RUNTIME, TAMBAYAN } = await import("../fixtures/layout");
const { SERVER_ID, server } = await import("../fixtures/server");

const ME = MEMBERS[0].profile;
const MARIA = MEMBERS[1].profile;
const TOPIC = `server:${SERVER_ID}`;

function Talking() {
  const speaking = useServerSpeaking(SERVER_ID);
  return <output data-testid="speaking">{[...speaking].sort().join(",")}</output>;
}

beforeEach(() => {
  fake.channels.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ token: "jwt", url: RUNTIME.livekitUrl, room: `voice:${TAMBAYAN.id}` }), { status: 200 })),
  );
});
afterEach(() => vi.useRealTimers());

describe("voice activity over Realtime Broadcast", () => {
  it("shows who is talking from members' broadcasts, and lets stale claims lapse", async () => {
    render(
      <MeProvider profile={ME}>
        <PresenceProvider>
          <Talking />
        </PresenceProvider>
      </MeProvider>,
    );
    await waitFor(() => expect(fake.joined(TOPIC)).toBeDefined());
    expect(fake.joined(TOPIC)!.config).toMatchObject({ private: true });

    act(() => fake.emitBroadcast(TOPIC, "speaking", { user_id: MARIA.id, speaking: true }));
    expect(screen.getByTestId("speaking")).toHaveTextContent(MARIA.id);
    // Own echoes and malformed payloads are ignored.
    act(() => fake.emitBroadcast(TOPIC, "speaking", { user_id: ME.id, speaking: true }));
    act(() => fake.emitBroadcast(TOPIC, "speaking", { speaking: true }));
    expect(screen.getByTestId("speaking").textContent).toBe(MARIA.id);

    act(() => fake.emitBroadcast(TOPIC, "speaking", { user_id: MARIA.id, speaking: false }));
    expect(screen.getByTestId("speaking")).toBeEmptyDOMElement();

    vi.useFakeTimers();
    act(() => fake.emitBroadcast(TOPIC, "speaking", { user_id: MARIA.id, speaking: true }));
    expect(screen.getByTestId("speaking")).toHaveTextContent(MARIA.id);
    act(() => vi.advanceTimersByTime(SPEAKING_TTL_MS + 50));
    expect(screen.getByTestId("speaking")).toBeEmptyDOMElement();
  });

  it("broadcasts my own speaking state while I'm in a server voice channel — and nothing is stored", async () => {
    function Join() {
      const call = useCall();
      return (
        <>
          <button type="button" onClick={() => void call.join({ serverId: SERVER_ID, serverName: server.name, channelId: TAMBAYAN.id, channelName: TAMBAYAN.name })}>
            Join
          </button>
          <output data-testid="call-status">{call.status}</output>
        </>
      );
    }
    const user = userEvent.setup();
    render(
      <RuntimeConfigProvider value={RUNTIME}>
        <SessionProviders profile={ME} account={ACCOUNT}>
          <AppShell servers={[server]}>
          <Join />
          </AppShell>
        </SessionProviders>
      </RuntimeConfigProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(fake.joined(TOPIC)).toBeDefined());
    const room = livekitMock.rooms[0];
    room.localParticipant.identity = ME.id;
    await waitFor(() => expect(room.handlers.get("activeSpeakersChanged")).toBeDefined());
    // Only a connected call announces voice activity.
    await waitFor(() => expect(screen.getByTestId("call-status")).toHaveTextContent("connected"));
    const sent = () => fake.channels.filter((c) => c.name === TOPIC).flatMap((c) => c.sent) as { event: string; payload: unknown }[];
    const queriesBefore = vi.mocked(fake.client.from).mock.calls.length;

    act(() => room.handlers.get("activeSpeakersChanged")!([{ identity: ME.id }]));
    await waitFor(() => expect(sent()).toContainEqual({ type: "broadcast", event: "speaking", payload: { user_id: ME.id, speaking: true } }));
    act(() => room.handlers.get("activeSpeakersChanged")!([]));
    await waitFor(() => expect(sent().at(-1)).toEqual({ type: "broadcast", event: "speaking", payload: { user_id: ME.id, speaking: false } }));
    // Ephemeral: talking never touches the database.
    expect(vi.mocked(fake.client.from).mock.calls.length).toBe(queriesBefore);
  });
});
