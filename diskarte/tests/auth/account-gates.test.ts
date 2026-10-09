// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { limiters } from "@/lib/rate-limit";
import { signupPolicy } from "@/lib/signup-mode";

/**
 * Account gates: accounts with a temporary password must change it before anything else,
 * SIGNUP_MODE=invite closes public sign-up, the Control Center routes are super-admin only, and a
 * session the auth server no longer accepts is cleared instead of looping between /login and the app.
 */
const session = { userId: null as string | null, mustChangePassword: false, superAdmin: false };
const checked: boolean[] = [];
vi.mock("@/lib/supabase/proxy", () => ({
  refreshSession: async (_req: NextRequest, _env: unknown, make: () => NextResponse, opts: { checkSuperAdmin?: boolean } = {}) => {
    checked.push(!!opts.checkSuperAdmin);
    return { response: make(), userId: session.userId, mustChangePassword: session.mustChangePassword, superAdmin: opts.checkSuperAdmin ? session.superAdmin : undefined };
  },
}));

const auth = {
  user: { id: "u1", user_metadata: { must_change_password: true } as Record<string, unknown> } as { id: string; user_metadata: Record<string, unknown> } | null,
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
  session.superAdmin = false;
  checked.length = 0;
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

describe("cross-origin routing", () => {
  it("only lets ALLOWED_ORIGINS read /api/health cross-origin (the retired portal's EARLY_ACCESS_URL no longer counts)", async () => {
    vi.stubEnv("ALLOWED_ORIGINS", "https://status.diskarte.ph");
    vi.stubEnv("EARLY_ACCESS_URL", "https://early.diskarte.ph/");
    const from = (origin: string) =>
      proxy(new NextRequest(`${SITE}/api/health`, { headers: { host: "diskarte.onrender.com", "x-forwarded-proto": "https", origin } }));
    const allowed = await from("https://status.diskarte.ph");
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://status.diskarte.ph");
    expect((await from("https://early.diskarte.ph")).headers.get("access-control-allow-origin")).toBeNull();
    expect((await from("https://evil.example")).headers.get("access-control-allow-origin")).toBeNull();
    const preflight = await proxy(
      new NextRequest(`${SITE}/api/health`, { method: "OPTIONS", headers: { host: "diskarte.onrender.com", origin: "https://evil.example" } }),
    );
    expect(preflight.status).toBe(403);
  });
});

describe("invite-only sign-up", () => {
  it("parses SIGNUP_MODE", () => {
    expect(signupPolicy({})).toEqual({ inviteOnly: false });
    expect(signupPolicy({ SIGNUP_MODE: " Invite " })).toEqual({ inviteOnly: true });
    expect(signupPolicy({ SIGNUP_MODE: "open" })).toEqual({ inviteOnly: false });
  });

  it("refuses sign-ups before touching Supabase", async () => {
    vi.stubEnv("SIGNUP_MODE", "invite");
    const form = new FormData();
    for (const [k, v] of Object.entries({ email: "a@b.ph", password: "Diskarte!2026x", confirmPassword: "Diskarte!2026x", username: "juan", displayName: "Juan" })) form.set(k, v);
    const result = await signUpAction({}, form);
    expect(result.error).toMatch(/Sign-ups are paused/);
    expect(result.values?.email).toBe("a@b.ph");
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});

describe("Control Center routes", () => {
  it("sends signed-out visitors to /login", async () => {
    expect((await proxy(req("/admin"))).headers.get("location")).toBe(`${SITE}/login?next=%2Fadmin`);
  });

  it("redirects non-admins to the workspace canvas before anything renders, and refuses the API", async () => {
    session.userId = "u2";
    for (const path of ["/admin", "/tambayan/admin"]) {
      const res = await proxy(req(path));
      expect(res.headers.get("location"), path).toBe(`${SITE}/tambayan`);
    }
    const api = await proxy(req("/api/admin/snapshot"));
    expect(api.status).toBe(403);
    expect(await api.json()).toEqual({ error: "Forbidden" });
  });

  it("lets verified super admins through", async () => {
    session.userId = "u1";
    session.superAdmin = true;
    expect((await proxy(req("/tambayan/admin"))).status).toBe(200);
    expect((await proxy(req("/api/admin/snapshot"))).status).toBe(200);
  });

  it("only asks the database about the role on Control Center paths", async () => {
    session.userId = "u1";
    await proxy(req("/tambayan"));
    await proxy(req("/tambayan/admin"));
    expect(checked).toEqual([false, true]);
  });
});

describe("rejected sessions", () => {
  it("clears a token the auth server no longer accepts instead of bouncing between /login and the app", async () => {
    auth.user = null;
    await expect(requireProfile("/tambayan/abc")).rejects.toMatchObject({ url: "/auth/revoked?next=%2Ftambayan%2Fabc" });
  });
});
