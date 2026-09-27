// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let admin: string;
let regular: string;

const IP = "a".repeat(64);

async function apply(fields: Record<string, unknown> = {}, as: "anon" | string = "anon") {
  if (as === "anon") await asAnon(db);
  else await asUser(db, as);
  const values = {
    full_name: "  Juan   Dela Cruz ",
    email: ` Juan.${Math.random().toString(36).slice(2, 8)}@Example.PH `,
    preferred_username: "@Juan_DC",
    community_type: "gaming",
    community_name: "Barangay Gamers",
    community_size: "11-50",
    referral_source: "TikTok",
    reason: "Gusto naming lumipat mula Discord para sa aming Valorant squad.",
    ip_hash: null,
    user_agent: "vitest",
    ...fields,
  };
  const cols = Object.keys(values);
  const params = cols.map((_, i) => `$${i + 1}`).join(", ");
  return failure(db, `insert into public.waitlist_applications (${cols.join(", ")}) values (${params})`, Object.values(values));
}

async function latest() {
  await asService(db);
  return one<Record<string, unknown>>(db, "select * from public.waitlist_applications order by created_at desc, id desc limit 1");
}

beforeAll(async () => {
  db = await createDb();
  admin = await signUp(db, "admin@diskarte.ph", { username: "bossing" });
  regular = await signUp(db, "user@diskarte.ph", { username: "tropa" });
  await asService(db);
  await db.query("insert into public.platform_admins (user_id, note) values ($1, 'founder')", [admin]);
}, 60_000);

describe("public applications", () => {
  it("lets anonymous visitors apply, normalising their input and forcing a pending review", async () => {
    expect(await apply()).toBeNull();
    const row = await latest();
    expect(row).toMatchObject({ full_name: "Juan Dela Cruz", preferred_username: "juan_dc", status: "pending", email_attempts: 0 });
    expect(row.email).toMatch(/^juan\.[a-z0-9]+@example\.ph$/);
  });

  it("cannot set review fields or read anything back", async () => {
    await asAnon(db);
    expect(
      await failure(db, "insert into public.waitlist_applications (full_name, email, community_type, reason, status) values ('Hacker', 'h@x.ph', 'other', 'I would like to approve myself please', 'approved')"),
    ).toMatch(/permission denied/);
    expect(await failure(db, "select * from public.waitlist_applications")).toMatch(/permission denied/);
    await asUser(db, regular);
    expect(await rows(db, "select * from public.waitlist_applications")).toHaveLength(0);
    expect(await failure(db, "update public.waitlist_applications set status = 'approved'")).toBeNull(); // RLS: 0 rows
    await asService(db);
    expect(await rows(db, "select 1 from public.waitlist_applications where status = 'approved'")).toHaveLength(0);
  });

  it("rejects duplicates (case-insensitive) and invalid input", async () => {
    expect(await apply({ email: "dup@diskarte.ph" })).toBeNull();
    expect(await apply({ email: "  DUP@Diskarte.ph " })).toMatch(/waitlist_applications_email_key/);
    expect(await apply({ reason: "too short" })).toMatch(/check/);
    expect(await apply({ community_type: "cult" })).toMatch(/check/);
    expect(await apply({ email: "not-an-email" })).toMatch(/check/);
    expect(await apply({ preferred_username: "no spaces allowed" })).toMatch(/check/);
  });

  it("caps applications per IP hash", async () => {
    for (let i = 0; i < 5; i++) expect(await apply({ ip_hash: IP })).toBeNull();
    expect(await apply({ ip_hash: IP })).toMatch(/TOO_MANY_APPLICATIONS/);
    expect(await apply({ ip_hash: "b".repeat(64) })).toBeNull();
  });
});

describe("super admin review", () => {
  let id: string;

  beforeAll(async () => {
    await apply({ email: "review@diskarte.ph" });
    await asService(db);
    id = (await one<{ id: string }>(db, "select id from public.waitlist_applications where email = 'review@diskarte.ph'")).id;
  });

  it("recognises super admins", async () => {
    await asUser(db, admin);
    expect((await one<{ ok: boolean }>(db, "select public.is_super_admin() ok")).ok).toBe(true);
    await asUser(db, regular);
    expect((await one<{ ok: boolean }>(db, "select public.is_super_admin() ok")).ok).toBe(false);
    expect(await rows(db, "select * from public.platform_admins")).toHaveLength(0);
    expect(await failure(db, "insert into public.platform_admins (user_id) values ($1)", [regular])).toMatch(/permission denied/);
    await asAnon(db);
    expect(await failure(db, "select public.is_super_admin()")).toMatch(/permission denied/);
  });

  it("lets super admins read everything and see stats", async () => {
    await asUser(db, admin);
    expect((await rows(db, "select id from public.waitlist_applications")).length).toBeGreaterThan(5);
    const stats = (await one<{ s: { pending: number; approved: number; last7: { count: number }[] } }>(db, "select public.waitlist_stats() s")).s;
    expect(stats.pending).toBeGreaterThan(5);
    expect(stats.approved).toBe(0);
    expect(stats.last7).toHaveLength(7);
    expect(stats.last7.at(-1)!.count).toBeGreaterThan(5);
    await asUser(db, regular);
    expect(await failure(db, "select public.waitlist_stats()")).toMatch(/NOT_AUTHORIZED/);
  });

  it("follows the review state machine and stamps the reviewer", async () => {
    await asUser(db, admin);
    await db.query("update public.waitlist_applications set status = 'declined', decline_reason = 'Puno pa' where id = $1", [id]);
    let row = await one<Record<string, unknown>>(db, "select status, reviewed_by, reviewed_at, decline_reason from public.waitlist_applications where id = $1", [id]);
    expect(row).toMatchObject({ status: "declined", reviewed_by: admin, decline_reason: "Puno pa" });
    expect(row.reviewed_at).not.toBeNull();

    await db.query("update public.waitlist_applications set status = 'approved', approved_user_id = $2 where id = $1", [id, regular]);
    row = await one(db, "select status, decline_reason, approved_user_id from public.waitlist_applications where id = $1", [id]);
    expect(row).toMatchObject({ status: "approved", decline_reason: null, approved_user_id: regular });

    expect(await failure(db, "update public.waitlist_applications set status = 'pending' where id = $1", [id])).toMatch(/INVALID_TRANSITION/);
    expect(await failure(db, "update public.waitlist_applications set status = 'declined' where id = $1", [id])).toMatch(/INVALID_TRANSITION/);
    // Delivery bookkeeping on approved rows is allowed.
    await db.query("update public.waitlist_applications set email_sent_at = now(), email_attempts = 1 where id = $1", [id]);
    expect(await failure(db, "update public.waitlist_applications set email_attempts = 0 where id = $1", [id])).toMatch(/IMMUTABLE/);
  });

  it("keeps applicant data immutable, even for admins", async () => {
    await asUser(db, admin);
    expect(await failure(db, "update public.waitlist_applications set email = 'x@y.ph' where id = $1", [id])).toMatch(/permission denied/);
    await asService(db);
    expect(await failure(db, "update public.waitlist_applications set reason = 'rewritten by someone else entirely' where id = $1", [id])).toMatch(/APPLICATION_IMMUTABLE_FIELD/);
  });

  it("only attaches accounts and decline reasons in the right states", async () => {
    await apply({ email: "states@diskarte.ph" });
    await asUser(db, admin);
    const pending = (await one<{ id: string }>(db, "select id from public.waitlist_applications where email = 'states@diskarte.ph'")).id;
    expect(await failure(db, "update public.waitlist_applications set approved_user_id = $2 where id = $1", [pending, regular])).toMatch(/ACCOUNT_ONLY_WHEN_APPROVED/);
    expect(await failure(db, "update public.waitlist_applications set decline_reason = 'nope' where id = $1", [pending])).toMatch(/DECLINE_REASON_ONLY_WHEN_DECLINED/);
    await db.query("update public.waitlist_applications set status = 'declined' where id = $1", [pending]);
    await db.query("update public.waitlist_applications set status = 'pending' where id = $1", [pending]);
    expect(await one(db, "select status, reviewed_by from public.waitlist_applications where id = $1", [pending])).toEqual({ status: "pending", reviewed_by: null });
  });

  it("lets super admins delete applications (and nobody else)", async () => {
    await apply({ email: "delete-me@diskarte.ph" });
    await asUser(db, regular);
    await db.query("delete from public.waitlist_applications where email = 'delete-me@diskarte.ph'");
    await asService(db);
    expect(await rows(db, "select 1 from public.waitlist_applications where email = 'delete-me@diskarte.ph'")).toHaveLength(1);
    await asUser(db, admin);
    await db.query("delete from public.waitlist_applications where email = 'delete-me@diskarte.ph'");
    await asService(db);
    expect(await rows(db, "select 1 from public.waitlist_applications where email = 'delete-me@diskarte.ph'")).toHaveLength(0);
  });
});
