import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { MEMBER_ID, MOD_ID, OWNER_ID, SERVER_ID, ServerFixture, makeMember, server } from "../fixtures/server";

const tables: Record<string, unknown[]> = {};
let fake = createFakeSupabase(tables);
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));

const { LeaderboardButton, MemberLevel } = await import("@/components/server/Leaderboard");
const { levelFor, xpForLevel } = await import("@/lib/community");
const members = [makeMember(OWNER_ID, "Kapitan", "admin"), makeMember(MOD_ID, "Maria", "moderator"), makeMember(MEMBER_ID, "Juan", "member")];
const on = { server: { ...server, levels_enabled: true } };

beforeEach(() => {
  tables.member_xp = [
    { server_id: SERVER_ID, user_id: MOD_ID, xp: 1250 },
    { server_id: SERVER_ID, user_id: OWNER_ID, xp: 60 },
    { server_id: SERVER_ID, user_id: "gone-member", xp: 9000 },
  ];
  fake = createFakeSupabase(tables);
});

describe("community levels", () => {
  it("levels follow 50·n² XP", () => {
    expect([0, 49, 50, 199, 200, 1250].map(levelFor)).toEqual([0, 0, 1, 1, 2, 5]);
    expect(xpForLevel(3)).toBe(450);
  });

  it("is hidden until an admin turns levels on", () => {
    render(<ServerFixture members={members}><LeaderboardButton /><MemberLevel userId={MOD_ID} /></ServerFixture>);
    expect(screen.queryByTestId("leaderboard-button")).toBeNull();
    expect(screen.queryByTestId("member-level")).toBeNull();
  });

  it("ranks current members by XP and shows my progress", async () => {
    const user = userEvent.setup();
    render(<ServerFixture members={members} overrides={on}><LeaderboardButton /></ServerFixture>);
    await user.click(screen.getByTestId("leaderboard-button"));
    const list = await screen.findByRole("list", { name: "Top members" });
    const rows = within(list).getAllByRole("listitem");
    // Someone who left isn't listed.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Maria");
    expect(rows[0]).toHaveTextContent("Level 5");
    expect(screen.getByTestId("my-level")).toHaveTextContent("You're level 1 · 60 XP · 140 XP to level 2");
  });

  it("shows a member's level on their profile", async () => {
    render(<ServerFixture members={members} overrides={on}><MemberLevel userId={MOD_ID} /></ServerFixture>);
    expect(await screen.findByTestId("member-level")).toHaveTextContent("Level 5 · 1250 XP");
  });
});
