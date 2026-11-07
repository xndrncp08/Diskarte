// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

const ANNOUNCEMENTS = "d15ca47e-0000-4000-8000-0000000000a1";
let db: Db;
let admin: string;
let member: string;

const publish = async (id: string, on: string, content = `Notes for ${id}`) => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await db.exec("set role service_role");
  const result = (await one<{ r: string }>(db, "select public.publish_release_announcement($1, $2::date, 'Title', $3) as r", [id, on, content])).r;
  await db.exec("reset role");
  return result;
};
const posts = () => rows<{ content: string; webhook_name: string }>(db, "select content, webhook_name from public.messages where channel_id = $1 and webhook_name = 'Diskarte Updates' order by created_at", [ANNOUNCEMENTS]);

beforeAll(async () => {
  db = await createDb();
  admin = await signUp(db, "admin@diskarte.ph", { username: "kapitan" });
  member = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  await asService(db);
  await db.query("insert into public.platform_admins (user_id, role) values ($1, 'super_admin')", [admin]);
}, 60_000);

describe("release announcements", () => {
  it("posts a release once to Diskarte HQ #announcements as Diskarte Updates", async () => {
    expect(await publish("2026-11-07-help-center", "2026-11-07")).toBe("published");
    expect(await publish("2026-11-07-help-center", "2026-11-07")).toBe("already-published");
    await asService(db);
    expect(await posts()).toEqual([{ content: "Notes for 2026-11-07-help-center", webhook_name: "Diskarte Updates" }]);
  });

  it("never announces an older release after a newer one (a rolled-back deployment)", async () => {
    expect(await publish("2026-11-01-older", "2026-11-01")).toBe("superseded");
    await asService(db);
    expect(await rows(db, "select 1 from public.release_announcements where release_id = '2026-11-01-older'")).toHaveLength(0);
  });

  it("is only callable by the service role, and members can't impersonate it", async () => {
    await asUser(db, member);
    expect(await failure(db, "select public.publish_release_announcement('2026-12-01-fake', '2026-12-01', 'x', 'x')")).toMatch(/permission denied/);
    expect(await failure(db, "insert into public.release_announcements (release_id, released_on, title) values ('2026-12-01-fake', '2026-12-01', 'x')")).toMatch(/permission denied|row-level security/);
    // Members can't post in read-only #announcements, and a webhook name never sticks to a user's post.
    expect(await failure(db, "insert into public.messages (channel_id, author_id, content, webhook_name) values ($1, $2, 'Totally official', 'Diskarte Updates')", [ANNOUNCEMENTS, member])).toBeTruthy();
    expect((await one<{ n: number }>(db, "select count(*)::int as n from public.release_announcements")).n).toBe(1);
  });

  it("lets super admins withdraw a post (kept as withdrawn) or reset it for corrected notes", async () => {
    await asUser(db, member);
    expect(await failure(db, "select public.admin_withdraw_release_announcement('2026-11-07-help-center')")).toMatch(/NOT_AUTHORIZED/);
    await asUser(db, admin);
    await db.query("select public.admin_withdraw_release_announcement('2026-11-07-help-center')");
    await asService(db);
    expect(await posts()).toEqual([]);
    expect(await publish("2026-11-07-help-center", "2026-11-07")).toBe("already-published");
    await asUser(db, admin);
    await db.query("select public.admin_reset_release_announcement('2026-11-07-help-center')");
    expect(await publish("2026-11-07-help-center", "2026-11-07", "Corrected notes")).toBe("published");
    await asService(db);
    expect((await posts()).map((p) => p.content)).toEqual(["Corrected notes"]);
    expect(await rows(db, "select action from public.admin_audit_logs where action like 'release.%' order by created_at")).toEqual([{ action: "release.withdraw" }, { action: "release.reset" }]);
  });

  it("is readable by signed-in people for the What's New status", async () => {
    await asUser(db, member);
    expect(await rows(db, "select release_id from public.release_announcements")).toEqual([{ release_id: "2026-11-07-help-center" }]);
  });

  it("refuses empty or oversized notes", async () => {
    await db.exec("reset role");
    await db.exec("set role service_role");
    expect(await failure(db, "select public.publish_release_announcement('2026-12-02-x', '2026-12-02', 'x', '   ')")).toMatch(/INVALID_CONTENT/);
    await db.exec("reset role");
  });
});
