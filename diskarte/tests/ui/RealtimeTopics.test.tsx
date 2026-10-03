import { act, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";

const fake = createFakeSupabase();
vi.mock("@/components/providers/RuntimeConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/RuntimeConfig")>()),
  useSupabase: () => fake.client,
}));

const { subscribeDbChanges } = await import("@/lib/realtime");
const { MeProvider } = await import("@/components/providers/MeProvider");
const { PresenceProvider, useServerPresence } = await import("@/components/providers/PresenceProvider");
const { MEMBERS } = await import("../fixtures/layout");
const { SERVER_ID } = await import("../fixtures/server");

const ME = MEMBERS[0].profile;
const MARIA = MEMBERS[1].profile;

// realtime-js hands back a topic's existing channel until its removal finishes; re-subscribing in
// that window used to reuse the dying channel, which never joined again — so messages, presence and
// voice rosters silently froze after switching away and straight back.
describe("re-subscribing to a topic that is still being torn down", () => {
  it("chat: leaving a channel and coming straight back still delivers messages", async () => {
    const seen: string[] = [];
    const listen = () =>
      subscribeDbChanges(fake.client as never, "chat:c1", (channel) =>
        channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "channel_id=eq.c1" }, ({ new: row }) => void seen.push((row as { id: string }).id)),
      );
    const first = listen();
    await waitFor(() => expect(fake.joined("db:chat:c1")).toBeDefined());
    first(); // switch away…
    const second = listen(); // …and straight back, before the unsubscribe round trip completes
    await waitFor(() => expect(fake.joined("db:chat:c1")).toBeDefined());
    act(() => fake.emitDb("messages", "INSERT", { id: "m1", channel_id: "c1" }));
    expect(seen).toEqual(["m1"]);
    second();
  });

  it("voice roster: remounting a server's presence keeps showing who joins and leaves voice", async () => {
    const topic = `server:${SERVER_ID}`;
    function Roster() {
      const presence = useServerPresence(SERVER_ID);
      const inVoice = [...presence.values()].filter((p) => p.voice_channel_id).map((p) => p.user_id);
      return <output data-testid="in-voice">{inVoice.join(",")}</output>;
    }
    function Toggle() {
      const [key, setKey] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setKey((k) => k + 1)}>
            Remount
          </button>
          <Roster key={key} />
        </>
      );
    }
    render(
      <MeProvider profile={ME}>
        <PresenceProvider>
          <Toggle />
        </PresenceProvider>
      </MeProvider>,
    );
    await waitFor(() => expect(fake.joined(topic)).toBeDefined());
    act(() => screen.getByRole("button", { name: "Remount" }).click()); // release + re-acquire in one go
    await waitFor(() => expect(fake.joined(topic)).toBeDefined());

    const maria = (voice: string | null) => ({ [MARIA.id]: [{ user_id: MARIA.id, status: "online", voice_channel_id: voice, online_at: new Date().toISOString() }] });
    act(() => fake.syncPresence(topic, maria("voice-1")));
    expect(screen.getByTestId("in-voice")).toHaveTextContent(MARIA.id);
    act(() => fake.syncPresence(topic, maria(null)));
    expect(screen.getByTestId("in-voice")).toBeEmptyDOMElement();
  });
});
