import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async () => ({
  data: { server_id: "s1", name: "Kanto", rules: "Be kind.", questions: ["What do you play?"], approval: true, request_status: null, member: false },
  error: null,
}));
const requestToJoinAction = vi.fn(async (input: unknown) => { void input; return { ok: true, data: { status: "pending" } }; });
const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
const client = { rpc };
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => client }));
vi.mock("@/components/providers/ServerProvider", () => ({ useServer: () => ({}) }));
vi.mock("@/actions/servers", () => ({ requestToJoinAction: (i: unknown) => requestToJoinAction(i), decideJoinRequestAction: vi.fn(), setJoinScreeningAction: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const { JoinScreeningDialog } = await import("@/components/server/JoinScreening");

describe("join screening", () => {
  it("shows the rules and questions, then sends a request for approval", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onJoined = vi.fn();
    render(<JoinScreeningDialog target={{ invite: "https://diskarte.test/invite/ABCD234XYZ" }} onClose={onClose} onJoined={onJoined} />);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("join_screening", { p_code: "ABCD234XYZ", p_server: null }));
    expect(await screen.findByText("Be kind.")).toBeInTheDocument();
    const send = screen.getByRole("button", { name: /Request to join/ });
    expect(send).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: /What do you play/ }), "Valorant");
    expect(send).toBeEnabled();
    await user.click(send);
    await waitFor(() => expect(requestToJoinAction).toHaveBeenCalledWith({ invite: "https://diskarte.test/invite/ABCD234XYZ", answers: ["Valorant"] }));
    expect(onJoined).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/Request sent/));
  });
});
