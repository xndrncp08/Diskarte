// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { limiters } from "@/lib/rate-limit";
import { signupPolicy } from "@/lib/signup-mode";

/**
 * The main app's half of Early Access: accounts created by the portal must change their emailed
 * temporary password before anything else, and SIGNUP_MODE=invite closes public sign-up.
 */
const session = { userId: null as string | null, mustChangePassword: false };
vi.mock("@/lib/supabase/proxy", () => ({
  refreshSession: async (_req: NextRequest, _env: unknown, make: () => NextResponse) => ({ response: make(), ...session }),
}));

const auth = {
  user: { id: "u1", user_metadata: { must_change_password: true } as Record<string, unknown> },
  updateUser: vi.fn(async () => ({ data: {}, error: null })),
  refreshSession: vi.fn(async () => ({ data: {}, error: null })),
  signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
  signInWithPassword: vi.fn(async () => ({ data: { user: auth.user }, error: null })),
};
vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), getSessionUser: async () => auth.user }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: auth.user }, error: null }),
      updateUser: auth.updateUser,
      refreshSession: auth.refreshSession,
      signUp: auth.signUp,
      signInWithPassword: auth.signInWithPassword,
    },
    rpc: async () => ({ data: true }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "u1", onboarded: false } }) }) }) }),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));

const { proxy } = await import("@/proxy");
const { changePasswordAction } = await import("@/actions/account");
const { signInAction, signUpAction } = await import("@/app/(auth)/actions");
const { requireProfile } = await import("@/lib/auth");

const SITE = "https://diskarte.onrender.com";
const req = (path: string) => new NextRequest(`${SITE}${path}`, { headers: { host: "diskarte.onrender.com", "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.50" } });

beforeEach(() => {
  session.userId = null;
  session.mustChangePassword = false;
  for (const l of Object.values(limiters)) l.reset();
  vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
  vi.stubEnv("SUPABASE_ANON_KEY", "anon-key-that-is-long-enough");
  vi.stubEnv("LIVEKIT_URL", "wss://proj.livekit.cloud");
  vi.stubEnv("SITE_URL", SITE);
  vi.stubEnv("SIGNUP_MODE", "");
  vi.clearAllMocks();
});

describe("first login with a temporary password", () => {
  it("sends the account to /reset-password?first=1 from every app page", async () => {
    session.userId = "u1";
    session.mustChangePassword = true;
    for (const path of ["/tambayan", "/tambayan/abc/def", "/settings/profile", "/onboarding"]) {
      const res = await proxy(req(path));
      expect(res.headers.get("location"), path).toBe(`${SITE}/reset-password?first=1`);
    }
    expect((await proxy(req("/reset-password?first=1"))).status).toBe(200);
  });

  it("leaves normal accounts alone", async () => {
    session.userId = "u1";
    expect((await proxy(req("/tambayan"))).status).toBe(200);
  });

  it("logs straight into the first-login page (a Server Action redirect skips the proxy)", async () => {
    auth.user = { id: "u1", user_metadata: { must_change_password: true } };
    const form = new FormData();
    form.set("email", "new@diskarte.ph");
    form.set("password", "Temp#Pass2026xyz");
    form.set("next", "/tambayan");
    await expect(signInAction({}, form)).rejects.toMatchObject({ url: "/reset-password?first=1" });
  });

  it("enforces the first-login page on every protected server render too", async () => {
    auth.user = { id: "u1", user_metadata: { must_change_password: true } };
    await expect(requireProfile("/tambayan")).rejects.toMatchObject({ url: "/reset-password?first=1" });
    await expect(requireProfile("/onboarding")).rejects.toMatchObject({ url: "/reset-password?first=1" });
    await expect(requireProfile("/reset-password")).resolves.toMatchObject({ user: { id: "u1" } });
  });

  it("clears the flag with the new password and refreshes the session JWT", async () => {
    const form = new FormData();
    form.set("password", "Bagong!Password2026");
    form.set("confirm", "Bagong!Password2026");
    form.set("redirectTo", "/tambayan");
    await expect(changePasswordAction({}, form)).rejects.toMatchObject({ url: "/tambayan" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "Bagong!Password2026", data: { must_change_password: false } });
    expect(auth.refreshSession).toHaveBeenCalled();
  });

  it("lets regular accounts log in to where they were going", async () => {
    auth.user = { id: "u3", user_metadata: {} };
    const form = new FormData();
    form.set("email", "old@diskarte.ph");
    form.set("password", "Whatever#2026x");
    form.set("next", "/tambayan/abc");
    await expect(signInAction({}, form)).rejects.toMatchObject({ url: "/tambayan/abc" });
  });

  it("doesn't touch metadata for regular password changes", async () => {
    auth.user = { id: "u2", user_metadata: {} };
    const form = new FormData();
    form.set("password", "Bagong!Password2026");
    form.set("confirm", "Bagong!Password2026");
    expect(await changePasswordAction({}, form)).toEqual({ ok: true });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "Bagong!Password2026" });
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
});

describe("inter-app routing", () => {
  it("lets the Early Access portal (and only it) read /api/health cross-origin", async () => {
    vi.stubEnv("EARLY_ACCESS_URL", "https://early.diskarte.ph/");
    const from = (origin: string) =>
      proxy(new NextRequest(`${SITE}/api/health`, { headers: { host: "diskarte.onrender.com", "x-forwarded-proto": "https", origin } }));
    const allowed = await from("https://early.diskarte.ph");
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://early.diskarte.ph");
    expect((await from("https://evil.example")).headers.get("access-control-allow-origin")).toBeNull();
    const preflight = await proxy(
      new NextRequest(`${SITE}/api/health`, { method: "OPTIONS", headers: { host: "diskarte.onrender.com", origin: "https://evil.example" } }),
    );
    expect(preflight.status).toBe(403);
  });
});

describe("invite-only sign-up", () => {
  it("parses SIGNUP_MODE and EARLY_ACCESS_URL safely", () => {
    expect(signupPolicy({})).toEqual({ inviteOnly: false, earlyAccessUrl: null });
    expect(signupPolicy({ SIGNUP_MODE: " Invite ", EARLY_ACCESS_URL: "https://early.diskarte.ph/" })).toEqual({ inviteOnly: true, earlyAccessUrl: "https://early.diskarte.ph" });
    expect(signupPolicy({ SIGNUP_MODE: "invite", EARLY_ACCESS_URL: "javascript:alert(1)" }).earlyAccessUrl).toBeNull();
  });

  it("refuses sign-ups before touching Supabase", async () => {
    vi.stubEnv("SIGNUP_MODE", "invite");
    const form = new FormData();
    for (const [k, v] of Object.entries({ email: "a@b.ph", password: "Diskarte!2026x", confirmPassword: "Diskarte!2026x", username: "juan", displayName: "Juan" })) form.set(k, v);
    const result = await signUpAction({}, form);
    expect(result.error).toMatch(/Early Access/);
    expect(result.values?.email).toBe("a@b.ph");
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});
