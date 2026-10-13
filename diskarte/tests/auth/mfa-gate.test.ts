// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { factors: [] as { status: string }[], aal: "aal1" };
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "u1", user_metadata: {}, factors: state.factors } }, error: null }),
      getClaims: async () => ({ data: { claims: { sub: "u1", aal: state.aal } }, error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "u1" } }) }) }) }),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));

const { requireProfile } = await import("@/lib/auth");
const redirectOf = (p: Promise<unknown>) => p.then(() => null, (e: { url?: string }) => e.url ?? String(e));

beforeEach(() => {
  state.factors = [];
  state.aal = "aal1";
});

describe("two-factor gate", () => {
  it("lets accounts without two-factor in", async () => {
    await expect(requireProfile("/tambayan/x")).resolves.toMatchObject({ profile: { id: "u1" } });
  });

  it("sends aal1 sessions of two-factor accounts to /mfa, keeping where they were going", async () => {
    state.factors = [{ status: "verified" }];
    expect(await redirectOf(requireProfile("/tambayan/x"))).toBe("/mfa?next=%2Ftambayan%2Fx");
    state.aal = "aal2";
    await expect(requireProfile("/tambayan/x")).resolves.toMatchObject({ profile: { id: "u1" } });
  });

  it("ignores an unfinished setup", async () => {
    state.factors = [{ status: "unverified" }];
    await expect(requireProfile("/tambayan")).resolves.toBeTruthy();
  });
});
