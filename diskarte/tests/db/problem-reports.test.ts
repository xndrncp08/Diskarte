// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let admin: string;
let juan: string;
let maria: string;

const file = (description = "The chat froze when I opened #general.") =>
  one<{ id: string }>(db, "insert into public.problem_reports (category, description, page_url) values ('bug', $1, '/tambayan') returning id", [description]);

beforeAll(async () => {
  db = await createDb();
  admin = await signUp(db, "admin@diskarte.ph", { username: "supremo" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  maria = await signUp(db, "maria@diskarte.ph", { username: "maria" });
  await asService(db);
  await db.query("insert into public.platform_admins (user_id, role) values ($1, 'super_admin')", [admin]);
}, 60_000);

describe("problem reports", () => {
  it("files a report as the signed-in user, always open, and only they and super admins can read it", async () => {
    await asUser(db, juan);
    const { id } = await file();
    const mine = await one<{ reporter_id: string; status: string }>(db, "select reporter_id, status from public.problem_reports where id = $1", [id]);
    expect(mine).toEqual({ reporter_id: juan, status: "open" });

    await asUser(db, maria);
    expect(await rows(db, "select 1 from public.problem_reports where id = $1", [id])).toHaveLength(0);
    await asUser(db, admin);
    expect(await rows(db, "select 1 from public.problem_reports where id = $1", [id])).toHaveLength(1);
  });

  it("won't let a reporter pick someone else as reporter, set the status, or edit afterwards", async () => {
    await asUser(db, juan);
    expect(await failure(db, "insert into public.problem_reports (reporter_id, category, description) values ($1, 'bug', 'Pretending to be Maria here.')", [maria])).toBeTruthy();
    expect(await failure(db, "insert into public.problem_reports (category, description, status) values ('bug', 'Marking my own report resolved.', 'resolved')")).toBeTruthy();
    expect(await failure(db, "update public.problem_reports set description = 'edited later on' where reporter_id = $1", [juan])).toBeTruthy();
    expect(await failure(db, "insert into public.problem_reports (category, description) values ('bug', 'short')")).toBeTruthy();
  });

  it("caps each person at five reports an hour", async () => {
    await asUser(db, maria);
    for (let i = 0; i < 5; i++) await file(`Problem number ${i} happened again.`);
    expect(await failure(db, "insert into public.problem_reports (category, description) values ('other', 'One report too many this hour.')")).toMatch(/REPORT_RATE_LIMITED/);
  });

  it("lets only super admins triage, and logs it", async () => {
    await asUser(db, juan);
    const { id } = await file("Voice keeps cutting out in Tambayan 1.");
    expect(await failure(db, "select public.admin_set_report_status($1, 'resolved')", [id])).toMatch(/NOT_AUTHORIZED/);

    await asUser(db, admin);
    await db.query("select public.admin_set_report_status($1, 'sent', 'https://github.com/xndrncp08/Diskarte/issues/1')", [id]);
    const report = await one<{ status: string; issue_url: string }>(db, "select status, issue_url from public.problem_reports where id = $1", [id]);
    expect(report).toEqual({ status: "sent", issue_url: "https://github.com/xndrncp08/Diskarte/issues/1" });
    expect(await rows(db, "select 1 from public.admin_audit_logs where action = 'report.sent' and details->>'report_id' = $1", [id])).toHaveLength(1);
    expect(await failure(db, "select public.admin_set_report_status($1, 'deleted')", [id])).toMatch(/INVALID_STATUS/);
    expect(await failure(db, "select public.admin_set_report_status($1, 'sent', 'https://evil.example/x')", [id])).toBeTruthy();
  });
});
