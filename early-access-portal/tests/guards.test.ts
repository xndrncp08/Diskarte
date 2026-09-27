// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueFormToken, MIN_FILL_MS } from "@/lib/antispam";
import { resetAllLimiters } from "@/lib/rate-limit";

const SECRET = "test-secret-0123456789abcdef0123456789";
const OUTBOX = mkdtempSync(path.join(tmpdir(), "ea-outbox-"));
Object.assign(process.env, {
  SUPABASE_URL: "https://proj.supabase.co",
  SUPABASE_ANON_KEY: "anon-key-that-is-long-enough",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-long-enough",
  PORTAL_SECRET: SECRET,
  APP_URL: "https://diskarte.ph",
  SITE_URL: "https://early.diskarte.ph",
  EMAIL_TRANSPORT: "file",
  EMAIL_OUTBOX_DIR: OUTBOX,
});

// ---- fakes -----------------------------------------------------------------------------------
const state = {
  headers: new Headers({ "x-forwarded-for": "203.0.113.5", "user-agent": "vitest" }),
  insertError: null as null | { code?: string; message: string },
  inserted: [] as Record<string, unknown>[],
  signedIn: null as null | { id: string; email: string },
  isAdmin: false,
  signOut: vi.fn(async () => ({ error: null })),
  signInError: null as null | { message: string },
  rows: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
};

function table(name: string) {
  let filtered = state.rows;
  const api: Record<string, unknown> = {
    insert: async (values: Record<string, unknown>) => {
      state.inserted.push({ table: name, ...values });
      return { error: state.insertError };
    },
    select: () => api,
    in: (_col: string, ids: string[]) => ((filtered = state.rows.filter((r) => ids.includes(r.id as string))), api),
    eq: (col: string, v: unknown) => ((filtered = filtered.filter((r) => r[col] === v)), api),
    neq: () => api,
    update: (values: Record<string, unknown>) => {
      state.updates.push(values);
      for (const r of filtered) Object.assign(r, values);
      return api;
    },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: filtered, error: null }).then(resolve),
  };
  return api;
}

vi.mock("next/headers", () => ({ headers: async () => state.headers, cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => {
  const client = {
    from: (name: string) => table(name),
    rpc: async (fn: string) => (fn === "is_super_admin" ? { data: Boolean(state.signedIn) && state.isAdmin } : { data: null }),
    auth: {
      getUser: async () => ({ data: { user: state.signedIn } }),
      signInWithPassword: async ({ email }: { email: string }) => {
        if (state.signInError) return { error: state.signInError };
        state.signedIn = { id: "admin-1", email };
        return { error: null };
      },
      signOut: state.signOut,
    },
  };
  return {
    createClient: async () => client,
    getSuperAdmin: async () => (state.signedIn && state.isAdmin ? state.signedIn : null),
  };
});
const service = {
  createUser: vi.fn(async ({ email }: { email: string }) => ({ data: { user: { id: `auth-${email}` } }, error: null })),
  updateUserById: vi.fn(async () => ({ data: {}, error: null })),
};
const createServiceClient = vi.fn(() => ({ auth: { admin: service } }));
vi.mock("@/lib/supabase/admin", () => ({ createServiceClient }));
const session = { userId: null as string | null, isSuperAdmin: false };
vi.mock("@/lib/supabase/proxy", () => ({
  checkAdminSession: async (_req: unknown, _env: unknown, make: () => NextResponse) => ({ response: make(), ...session }),
}));

const { submitApplicationAction } = await import("@/app/actions");
const { approveAction, declineAction, resendAction, saveNoteAction } = await import("@/app/admin/actions");
const { adminSignInAction } = await import("@/app/admin/auth-actions");

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const goodForm = () => ({
  formToken: issueFormToken(SECRET, Date.now() - MIN_FILL_MS - 1000),
  fullName: "Juan Dela Cruz",
  email: "Juan@Example.PH",
  preferredUsername: "@juandc",
  communityType: "gaming",
  communityName: "Barangay Valo",
  communitySize: "11-50",
  referralSource: "TikTok",
  reason: "Lilipat na ang squad namin mula Discord, sana makasali kami!",
  consent: "on",
  website: "",
});

beforeEach(() => {
  resetAllLimiters();
  Object.assign(state, { insertError: null, inserted: [], signedIn: null, isAdmin: false, signInError: null, rows: [], updates: [] });
  state.headers = new Headers({ "x-forwarded-for": "203.0.113.5", "user-agent": "vitest" });
  vi.clearAllMocks();
});

// =============================================================================================
describe("public submission", () => {
  it("stores a normalised pending application with a hashed IP (never the raw IP)", async () => {
    const result = await submitApplicationAction({ status: "idle" }, form(goodForm()));
    expect(result).toEqual({ status: "success", firstName: "Juan" });
    const row = state.inserted[0];
    expect(row).toMatchObject({ table: "waitlist_applications", full_name: "Juan Dela Cruz", email: "juan@example.ph", preferred_username: "juandc", community_type: "gaming", user_agent: "vitest" });
    expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain("203.0.113.5");
    expect(row).not.toHaveProperty("status");
  });

  it("silently swallows honeypot submissions", async () => {
    expect(await submitApplicationAction({ status: "idle" }, form({ ...goodForm(), website: "http://casino.example" }))).toMatchObject({ status: "success" });
    expect(state.inserted).toHaveLength(0);
  });

  it("rejects forms submitted too fast or with a forged token", async () => {
    expect(await submitApplicationAction({ status: "idle" }, form({ ...goodForm(), formToken: issueFormToken(SECRET) }))).toMatchObject({ status: "error", error: expect.stringMatching(/bilis/) });
    expect(await submitApplicationAction({ status: "idle" }, form({ ...goodForm(), formToken: "123.forged" }))).toMatchObject({ status: "error", error: expect.stringMatching(/expire/) });
    expect(state.inserted).toHaveLength(0);
  });

  it("returns field errors and keeps what the applicant typed", async () => {
    const result = await submitApplicationAction({ status: "idle" }, form({ ...goodForm(), reason: "maikli", consent: "" }));
    expect(result.status).toBe("error");
    expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual(["consent", "reason"]);
    expect(result.values?.fullName).toBe("Juan Dela Cruz");
  });

  it("answers duplicates exactly like new applications (no email enumeration)", async () => {
    state.insertError = { code: "23505", message: "duplicate key value violates unique constraint" };
    expect(await submitApplicationAction({ status: "idle" }, form(goodForm()))).toEqual({ status: "success", firstName: "Juan" });
  });

  it("maps database flood protection and rate-limits per IP", async () => {
    state.insertError = { message: "TOO_MANY_APPLICATIONS" };
    expect(await submitApplicationAction({ status: "idle" }, form(goodForm()))).toMatchObject({ status: "error", error: expect.stringMatching(/daming nag-a-apply/) });
    state.insertError = null;
    for (let i = 0; i < 4; i++) await submitApplicationAction({ status: "idle" }, form(goodForm()));
    expect(await submitApplicationAction({ status: "idle" }, form(goodForm()))).toMatchObject({ status: "error", error: expect.stringMatching(/network mo/) });
    state.headers = new Headers({ "x-forwarded-for": "198.51.100.1" });
    expect((await submitApplicationAction({ status: "idle" }, form(goodForm()))).status).toBe("success");
  });
});

// =============================================================================================
describe("admin authorization", () => {
  const ID = "5b1f7c1e-8a44-4c55-9d2b-5f6a3e2d1c00";

  it("refuses every review action without a super admin session — and never touches the service role", async () => {
    for (const run of [() => approveAction([ID]), () => declineAction([ID], ""), () => resendAction(ID), () => saveNoteAction(ID, "x")]) {
      expect(await run()).toMatchObject({ ok: false, message: expect.stringMatching(/admin access/) });
    }
    state.signedIn = { id: "u1", email: "user@diskarte.ph" }; // signed in, but not a super admin
    expect(await approveAction([ID])).toMatchObject({ ok: false });
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(service.createUser).not.toHaveBeenCalled();
  });

  it("approves as a super admin: confirmed account, first-login flag, credentials emailed", async () => {
    state.signedIn = { id: "admin-1", email: "boss@diskarte.ph" };
    state.isAdmin = true;
    state.rows = [{ id: ID, full_name: "Maria Clara", email: "maria@example.ph", preferred_username: null, status: "pending", email_attempts: 0 }];
    const result = await approveAction([ID]);
    expect(result).toMatchObject({ ok: true, message: "1 approved" });
    expect(service.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "maria@example.ph", email_confirm: true, user_metadata: expect.objectContaining({ must_change_password: true }) }),
    );
    const password = (service.createUser.mock.calls[0] as unknown as [{ password: string }])[0].password;
    expect(state.rows[0]).toMatchObject({ status: "approved", approved_user_id: "auth-maria@example.ph" });
    const [file] = readdirSync(OUTBOX).filter((f) => readFileSync(path.join(OUTBOX, f), "utf8").includes("maria@example.ph"));
    const mail = JSON.parse(readFileSync(path.join(OUTBOX, file), "utf8"));
    expect(mail.subject).toMatch(/Maligayang Pagdating/);
    expect(mail.text).toContain(password);
    expect(JSON.stringify(result)).not.toContain(password);
  });

  it("validates batch input", async () => {
    state.signedIn = { id: "admin-1", email: "boss@diskarte.ph" };
    state.isAdmin = true;
    expect(await approveAction([])).toMatchObject({ ok: false });
    expect(await approveAction(["not-a-uuid"])).toMatchObject({ ok: false });
    expect(await approveAction(Array.from({ length: 51 }, () => ID))).toMatchObject({ ok: false, message: expect.stringMatching(/50/) });
  });

  it("signs non-admins straight back out of the portal", async () => {
    const result = await adminSignInAction({}, form({ email: "user@diskarte.ph", password: "Whatever!2026" }));
    expect(result).toEqual({ error: "Walang admin access ang account na 'to." });
    expect(state.signOut).toHaveBeenCalled();
  });

  it("gives one vague error for bad credentials and redirects admins to a safe path", async () => {
    state.signInError = { message: "Invalid login credentials" };
    expect(await adminSignInAction({}, form({ email: "x@y.ph", password: "nope" }))).toEqual({ error: "Mali ang email o password." });
    state.signInError = null;
    state.isAdmin = true;
    await expect(adminSignInAction({}, form({ email: "boss@diskarte.ph", password: "Secret!2026x", next: "//evil.example" }))).rejects.toMatchObject({ url: "/admin" });
  });
});

// =============================================================================================
describe("proxy route guard", () => {

  async function hit(pathname: string, method = "GET") {
    const { proxy } = await import("@/proxy");
    return proxy(new NextRequest(`https://early.diskarte.ph${pathname}`, { method, headers: { "x-forwarded-for": "192.0.2.1" } }));
  }

  beforeEach(() => {
    session.userId = null;
    session.isSuperAdmin = false;
  });

  it("sends signed-out visitors to the admin login, remembering where they were going", async () => {
    const res = await hit("/admin?status=all");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://early.diskarte.ph/admin/login?next=%2Fadmin%3Fstatus%3Dall");
  });

  it("bounces signed-in non-admins with an explanation", async () => {
    session.userId = "u1";
    const res = await hit("/admin");
    expect(res.headers.get("location")).toBe("https://early.diskarte.ph/admin/login?error=not_admin");
  });

  it("lets super admins through with no-store and a CSP", async () => {
    session.userId = "admin-1";
    session.isSuperAdmin = true;
    const res = await hit("/admin");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-security-policy")).toMatch(/script-src 'self' 'nonce-/);
    expect((await hit("/admin/login")).headers.get("location")).toBe("https://early.diskarte.ph/admin");
  });

  it("leaves the public page open and rate-limits admin login attempts", async () => {
    expect((await hit("/")).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await hit("/admin/login", "POST")).status).not.toBe(429);
    const blocked = await hit("/admin/login", "POST");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });
});
