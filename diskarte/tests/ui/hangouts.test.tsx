import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
const rpc = vi.fn(async () => ({ data: [{ user_id: "u2", status: "online", voice_server_id: null, voice_channel_id: null, last_seen_at: "" }], error: null }));
const createHangoutAction = vi.fn(async (input: unknown) => { void input; return { ok: true, data: { conversationId: "h1" } }; });
const join = vi.fn(async () => undefined);
const ringDm = vi.fn(async () => undefined);
const profiles = new Map([
  ["u1", { id: "u1", username: "ana", display_name: "Ana", avatar_url: null, avatar_preset: "araw" }],
  ["u2", { id: "u2", username: "ben", display_name: "Ben", avatar_url: null, avatar_preset: "araw" }],
]);

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => ({ rpc }), useRuntimeConfig: () => ({ siteUrl: "https://diskarte.test" }) }));
vi.mock("@/actions/social", () => ({ createHangoutAction: (i: unknown) => createHangoutAction(i), endHangoutAction: vi.fn(), extendHangoutAction: vi.fn(), sendDirectMessageAction: vi.fn() }));
vi.mock("@/actions/servers", () => ({ createServerAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("@/components/providers/SocialProvider", () => ({
  useSocial: () => ({ friends: [{ userId: "u1", status: "accepted" }, { userId: "u2", status: "accepted" }], profiles, reloadConversations: vi.fn(async () => undefined) }),
}));
vi.mock("@/components/voice/CallProvider", () => ({ useCall: () => ({ join, leave: vi.fn(), target: null }) }));
vi.mock("@/components/voice/IncomingCalls", () => ({ useRinger: () => ({ ringDm }) }));

const { StartHangoutDialog } = await import("@/components/social/Hangouts");

describe("start a hangout", () => {
  it("lists friends who are around first, then starts it, joins voice and rings them", async () => {
    const user = userEvent.setup();
    render(<StartHangoutDialog open onClose={vi.fn()} />);
    const who = await screen.findByRole("group", { name: /Who's coming/ });
    await waitFor(() => expect(within(who).getAllByRole("checkbox").map((c) => c.closest("label")?.textContent)).toEqual([expect.stringMatching(/Ben.*Around$/), expect.stringMatching(/Ana.*Offline$/)]));
    const start = screen.getByRole("button", { name: /Start hangout/ });
    expect(start).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: /Study/ }));
    await user.click(within(who).getByRole("checkbox", { name: /Ben/ }));
    await user.click(start);

    await waitFor(() => expect(createHangoutAction).toHaveBeenCalledWith({ userIds: ["u2"], name: "", topic: "study", hours: 3 }));
    expect(router.push).toHaveBeenCalledWith("/tambayan/dm/h1");
    expect(join).toHaveBeenCalledWith(expect.objectContaining({ kind: "dm", channelId: "h1", channelName: "Ben" }));
    expect(ringDm).toHaveBeenCalledWith("h1");
  });
});
