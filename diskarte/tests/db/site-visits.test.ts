// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createDb, failure, one, signUp, type Db } from "./harness";

let db: Db;
let admin: string;
let juan: string;
const A = "30000000-0000-4000-8000-00000000000a";
const B = "30000000-0000-4000-8000-00000000000b";

beforeAll(async () => {
  db = await createDb();
  admin = await signUp(db, "admin@diskarte.ph", { username: "supremo" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  await asService(db);
  await db.query("insert into public.platform_admins (user_id, role) values ($1, 'super_admin')", [admin]);
}, 60_000);

describe("site visits", () => {
  it("counts each browser once a day, from guests and members, and only super admins read the totals", async () => {
    await asAnon(db);
    await db.query("select public.record_site_visit($1)", [A]);
    await db.query("select public.record_site_visit($1)", [A]);
    expect(await failure(db, "select * from public.site_visits")).toBeTruthy();
    expect(await failure(db, "select public.admin_site_traffic()")).toBeTruthy();

    await asUser(db, juan);
    await db.query("select public.record_site_visit($1)", [A]);
    await db.query("select public.record_site_visit($1)", [B]);
    expect(await failure(db, "select public.admin_site_traffic()")).toMatch(/NOT_AUTHORIZED/);

    await asUser(db, admin);
    const { t } = await one<{ t: { today: number; signed_in_today: number; week: number; month: number; daily: { count: number }[] } }>(db, "select public.admin_site_traffic() as t");
    expect(t).toMatchObject({ today: 2, signed_in_today: 2, week: 2, month: 2 });
    expect(t.daily).toHaveLength(30);
    expect(t.daily.at(-1)?.count).toBe(2);
  });
});
