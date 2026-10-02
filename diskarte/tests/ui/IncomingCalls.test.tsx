import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { navigation } from "../mocks/navigation";

const CONVERSATION = "40000000-0000-4000-8000-000000000001";
const fake = createFakeSupabase();

vi.mock("@/components/providers/RuntimeConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/RuntimeConfig")>()),
  useSupabase: () => fake.client,
  useOptionalSupabase: () => fake.client,
}));
/* eslint-disable @typescript-eslint/no-unused-vars -- parameters type the mocks for toHaveBeenCalledWith */
const calls = {
  ringAction: vi.fn(async (_input: unknown) => ({ ok: true, data: { rang: 1 } })),
  respondRingAction: vi.fn(async (input: { ringId: string; accept: boolean }) => ({ ok: true, data: { status: input.accept ? "accepted" : "declined" } })),
  cancelRingsAction: vi.fn(async (_input: { target: string }) => ({ ok: true })),
};
/* eslint-enable @typescript-eslint/no-unused-vars */
vi.mock("@/actions/calls", () => ({
  ringAction: (i: unknown) => calls.ringAction(i),
  respondRingAction: (i: { ringId: string; accept: boolean }) => calls.respondRingAction(i),
  cancelRingsAction: (i: { target: string }) => calls.cancelRingsAction(i),
}));
const sfx = vi.fn();
vi.mock("@/lib/sfx", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/sfx")>()), playSfx: (name: string) => sfx(name) }));
vi.mock("@/actions/profile", async () => (await import("../mocks/actions")).profileActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { AppShell } = await import("@/components/shell/AppShell");
const { SessionProviders } = await import("@/components/shell/SessionProviders");
const { RuntimeConfigProvider } = await import("@/components/providers/RuntimeConfig");
const { useCall } = await import("@/components/voice/CallProvider");
const { useRinger } = await import("@/components/voice/IncomingCalls");
const { ACCOUNT, MEMBERS, RUNTIME, TAMBAYAN } = await import("../fixtures/layout");
const { SERVER_ID, server } = await import("../fixtures/server");

const ME = MEMBERS[0].profile;
const MARIA = MEMBERS[1].profile;
let seq = 0;

function ring(extra: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `50000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    kind: "dm",
    caller_id: MARIA.id,
    callee_id: ME.id,
    conversation_id: CONVERSATION,
    server_id: null,
    channel_id: null,
    video: false,
    status: "ringing",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 45_000).toISOString(),
    responded_at: null,
    ...extra,
  };
}

async function renderShell(me = ME, children: React.ReactNode = null) {
  render(
    <RuntimeConfigProvider value={RUNTIME}>
      <SessionProviders profile={me} account={ACCOUNT}>
        <AppShell servers={[server]}>
        {children}
        </AppShell>
      </SessionProviders>
    </RuntimeConfigProvider>,
  );
  await waitFor(() => expect(fake.joined(`db:rings:${me.id}`)).toBeDefined());
}

beforeEach(() => {
  fake.channels.length = 0;
  sfx.mockReset();
  Object.values(calls).forEach((c) => c.mockClear());
  navigation.reset("/tambayan");
  // The fake answers lookups for the caller, the server and its voice channel.
  Object.assign(fake.client, {
    from: vi.fn((table: string) => {
      const rowsByTable: Record<string, Record<string, unknown>[]> = {
        profiles: [MARIA, ME],
        servers: [{ id: SERVER_ID, name: server.name }],
        channels: [{ id: TAMBAYAN.id, name: TAMBAYAN.name }],
        dm_conversations: [{ id: CONVERSATION, kind: "direct", name: null }],
        call_rings: [],
      };
      let rows = [...(rowsByTable[table] ?? [])];
      const api: Record<string, unknown> = {};
      for (const op of ["select", "order", "limit", "neq", "is", "in", "lt"]) api[op] = () => api;
      api.eq = (col: string, val: unknown) => ((rows = rows.filter((r) => r[col] === val)), api);
      api.gt = () => api;
      api.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
      api.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
      return api;
    }),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ token: "jwt", url: RUNTIME.livekitUrl, room: `dm:${CONVERSATION}` }), { status: 200 })),
  );
});

describe("incoming call pop-up", () => {
  it("rings with the caller's avatar and chime, and Accept joins the DM call", async () => {
    const user = userEvent.setup();
    await renderShell();
    const incoming = ring({ video: true });
    act(() => fake.emitDb("call_rings", "INSERT", incoming));
    const popup = await screen.findByRole("dialog", { name: `Incoming call from ${MARIA.display_name}` });
    expect(popup).toHaveTextContent(`${MARIA.display_name} is video calling you`);
    expect(popup.querySelector(`[data-preset='${MARIA.avatar_preset}']`)).not.toBeNull(); // caller's salakot avatar
    expect(sfx).toHaveBeenCalledWith("ring");

    await user.click(within(popup).getByRole("button", { name: "Accept" }));
    expect(calls.respondRingAction).toHaveBeenCalledWith({ ringId: incoming.id, accept: true });
    await waitFor(() => expect(navigation.path).toBe(`/tambayan/dm/${CONVERSATION}`));
    await waitFor(() => expect(screen.queryByTestId("incoming-call")).toBeNull());
    expect(fetch).toHaveBeenCalledWith("/api/livekit/token", expect.objectContaining({ body: JSON.stringify({ conversationId: CONVERSATION }) }));
  });

  it("shows a voice ping with its channel and server, and Decline dismisses it", async () => {
    const user = userEvent.setup();
    await renderShell();
    const ping = ring({ kind: "voice", conversation_id: null, server_id: SERVER_ID, channel_id: TAMBAYAN.id });
    act(() => fake.emitDb("call_rings", "INSERT", ping));
    const popup = await screen.findByRole("dialog", { name: `Incoming call from ${MARIA.display_name}` });
    expect(popup).toHaveTextContent("wants you in voice");
    await waitFor(() => expect(popup).toHaveTextContent(`${TAMBAYAN.name} · ${server.name}`));
    await user.click(within(popup).getByRole("button", { name: "Decline" }));
    expect(calls.respondRingAction).toHaveBeenCalledWith({ ringId: ping.id, accept: false });
    await waitFor(() => expect(screen.queryByTestId("incoming-call")).toBeNull());
    expect(navigation.path).toBe("/tambayan");
  });

  it("disappears when the caller hangs up, and ignores rings that already ran out", async () => {
    await renderShell();
    act(() => fake.emitDb("call_rings", "INSERT", ring({ expires_at: new Date(Date.now() - 1000).toISOString() })));
    const live = ring();
    act(() => fake.emitDb("call_rings", "INSERT", live));
    await screen.findByTestId("incoming-call");
    expect(screen.queryByText(/\+1 more ringing/)).toBeNull();
    act(() => fake.emitDb("call_rings", "UPDATE", { ...live, status: "cancelled" }));
    await waitFor(() => expect(screen.queryByTestId("incoming-call")).toBeNull());
  });

  it("stays silent in Do Not Disturb", async () => {
    await renderShell({ ...ME, status: "dnd" });
    act(() => fake.emitDb("call_rings", "INSERT", ring()));
    await screen.findByTestId("incoming-call");
    expect(sfx).not.toHaveBeenCalledWith("ring");
  });
});

describe("outgoing rings", () => {
  function Caller() {
    const call = useCall();
    const ringer = useRinger()!;
    return (
      <>
        <button
          type="button"
          onClick={() => {
            void call.join({ kind: "dm", serverId: "", serverName: "Direct Message", channelId: CONVERSATION, channelName: "Maria" });
            void ringer.ringDm(CONVERSATION);
          }}
        >
          Call Maria
        </button>
        <button type="button" onClick={call.leave}>
          Hang up
        </button>
        <output data-testid="status">{call.status}</output>
      </>
    );
  }

  it("rings the DM and cancels unanswered rings on hang-up", async () => {
    const user = userEvent.setup();
    await renderShell(ME, <Caller />);
    await user.click(screen.getByRole("button", { name: "Call Maria" }));
    expect(calls.ringAction).toHaveBeenCalledWith({ kind: "dm", conversationId: CONVERSATION, video: false });
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("connected"));
    await user.click(screen.getByRole("button", { name: "Hang up" }));
    await waitFor(() => expect(calls.cancelRingsAction).toHaveBeenCalledWith({ target: CONVERSATION }));
  });

  it("tells the caller when someone declines", async () => {
    const toast = (await import("../mocks/actions")).toastMock.toast;
    await renderShell();
    act(() => fake.emitDb("call_rings", "UPDATE", ring({ caller_id: ME.id, callee_id: MARIA.id, status: "declined" })));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(`${MARIA.display_name} declined the call.`));
  });
});
