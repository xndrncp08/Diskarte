import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { MEMBER_ID, MOD_ID, OWNER_ID, SERVER_ID, ServerFixture, makeMember, server } from "../fixtures/server";

const tables: Record<string, unknown[]> = {};
let fake = createFakeSupabase(tables);
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const { RulesGate } = await import("@/components/server/RulesGate");
const members = [makeMember(OWNER_ID, "Kapitan", "admin"), makeMember(MOD_ID, "Maria", "moderator"), makeMember(MEMBER_ID, "Juan", "member")];
const withRules = { server: { ...server, rules: "1. Be kind.\n2. Walang scam.", rules_updated_at: "2026-10-30T00:00:00Z" } };
const gate = (meId: string, myRole: "member" | "moderator", overrides = withRules) =>
  render(<ServerFixture members={members} meId={meId} myRole={myRole} overrides={overrides}><RulesGate><textarea data-testid="composer" /></RulesGate></ServerFixture>);

beforeEach(() => {
  tables.rules_acceptances = [];
  fake = createFakeSupabase(tables);
});

describe("rules gate", () => {
  it("asks a member to accept before the composer appears", async () => {
    const user = userEvent.setup();
    gate(MEMBER_ID, "member");
    await user.click(await screen.findByRole("button", { name: "Read the rules" }));
    const dialog = screen.getByRole("dialog", { name: /rules$/ });
    expect(dialog).toHaveTextContent("Walang scam.");
    await user.click(within(dialog).getByRole("button", { name: "I agree" }));
    expect(fake.client.rpc).toHaveBeenCalledWith("accept_server_rules", { p_server: SERVER_ID });
    await waitFor(() => expect(screen.getByTestId("composer")).toBeInTheDocument());
  });

  it("lets through members who accepted the current rules, moderators, and servers without rules", async () => {
    tables.rules_acceptances = [{ server_id: SERVER_ID, user_id: MEMBER_ID, accepted_at: "2026-10-30T01:00:00Z" }];
    fake = createFakeSupabase(tables);
    gate(MEMBER_ID, "member");
    expect(await screen.findByTestId("composer")).toBeInTheDocument();
  });

  it("asks again after the rules changed", async () => {
    tables.rules_acceptances = [{ server_id: SERVER_ID, user_id: MEMBER_ID, accepted_at: "2026-10-29T01:00:00Z" }];
    fake = createFakeSupabase(tables);
    gate(MEMBER_ID, "member");
    expect(await screen.findByTestId("rules-gate")).toBeInTheDocument();
  });

  it("never gates moderators or servers without rules", () => {
    gate(MOD_ID, "moderator");
    expect(screen.getByTestId("composer")).toBeInTheDocument();
  });
});
