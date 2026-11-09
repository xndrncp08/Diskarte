// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let mod: string;
let ana: string;
let ben: string;
let serverId: string;
let code: string;

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "owner" });
  mod = await signUp(db, "mod@diskarte.ph", { username: "moderator" });
  ana = await signUp(db, "ana@diskarte.ph", { username: "ana" });
  ben = await signUp(db, "ben@diskarte.ph", { username: "ben" });
  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Kanto') as id")).id;
  code = (await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId])).invite_code;
  await asService(db);
  await db.query("insert into public.members (server_id, user_id, role) values ($1, $2, 'moderator')", [serverId, mod]);
}, 60_000);

describe("membership screening", () => {
  it("only admins set it up, and the questions are validated", async () => {
    await asUser(db, mod);
    expect(await failure(db, "select public.set_join_screening($1, $2, true)", [serverId, JSON.stringify(["Hi?"])])).toMatch(/NOT_ALLOWED/);
    await asUser(db, owner);
    expect(await failure(db, "select public.set_join_screening($1, $2, false)", [serverId, JSON.stringify(["1", "2", "3", "4", "5", "6"])])).toMatch(/INVALID_QUESTIONS/);
    await db.query("select public.set_join_screening($1, $2, false)", [serverId, JSON.stringify(["  What do you play? ", ""])]);
    expect(await one(db, "select join_questions, join_approval from public.servers where id = $1", [serverId])).toEqual({ join_questions: ["What do you play?"], join_approval: false });
  });

  it("sends invite joins through the questions, then joins straight away without approval", async () => {
    await asUser(db, ana);
    expect(await failure(db, "select public.join_server($1)", [code])).toMatch(/SCREENING_REQUIRED/);
    const form = (await one<{ f: Record<string, unknown> }>(db, "select public.join_screening($1) as f", [code])).f;
    expect(form).toEqual(expect.objectContaining({ name: "Kanto", questions: ["What do you play?"], approval: false, member: false, request_status: null }));
    expect(await failure(db, "select public.request_to_join($1, null, $2)", [code, JSON.stringify([])])).toMatch(/INVALID_ANSWERS/);
    expect(await one(db, "select public.request_to_join($1, null, $2) as s", [code, JSON.stringify(["Valorant"])])).toEqual({ s: "joined" });
    expect(await one(db, "select public.is_server_member($1) as m", [serverId])).toEqual({ m: true });
  });

  it("files a pending request that only a moderator can approve", async () => {
    await asUser(db, owner);
    await db.query("select public.set_join_screening($1, $2, true)", [serverId, JSON.stringify(["Why join?"])]);
    await asUser(db, ben);
    expect(await one(db, "select public.request_to_join($1, null, $2) as s", [code, JSON.stringify(["Barkada ko kayo"])])).toEqual({ s: "pending" });
    expect(await one(db, "select public.is_server_member($1) as m", [serverId])).toEqual({ m: false });
    expect(await rows(db, "select status from public.join_requests")).toEqual([{ status: "pending" }]);

    // Other members don't see applications; moderators do, with the answers.
    await asUser(db, ana);
    expect(await rows(db, "select 1 from public.join_requests where user_id = $1", [ben])).toHaveLength(0);
    expect(await failure(db, "select public.decide_join_request($1, $2, true)", [serverId, ben])).toMatch(/NOT_ALLOWED/);
    await asUser(db, mod);
    expect(await rows(db, "select answers from public.join_requests where status = 'pending'")).toEqual([{ answers: ["Barkada ko kayo"] }]);
    await db.query("select public.decide_join_request($1, $2, true)", [serverId, ben]);
    expect(await failure(db, "select public.decide_join_request($1, $2, true)", [serverId, ben])).toMatch(/JOIN_REQUEST_NOT_FOUND/);
    expect(await one(db, "select action from public.audit_logs where server_id = $1 order by id desc limit 1", [serverId])).toEqual({ action: "member.approve" });
    await asUser(db, ben);
    expect(await one(db, "select public.is_server_member($1) as m", [serverId])).toEqual({ m: true });
  });

  it("makes a rejected applicant wait before asking again, and keeps answers in their export", async () => {
    const cara = await signUp(db, "cara@diskarte.ph", { username: "cara" });
    await asUser(db, cara);
    await db.query("select public.request_to_join($1, null, $2)", [code, JSON.stringify(["Wala lang"])]);
    await asUser(db, mod);
    await db.query("select public.decide_join_request($1, $2, false)", [serverId, cara]);
    await asUser(db, cara);
    expect(await failure(db, "select public.request_to_join($1, null, $2)", [code, JSON.stringify(["Please"])])).toMatch(/JOIN_REQUEST_REJECTED/);
    const { data } = await one<{ data: { join_requests: unknown[] } }>(db, "select public.export_my_data() as data");
    expect(data.join_requests).toEqual([expect.objectContaining({ server: "Kanto", answers: ["Wala lang"], status: "rejected" })]);
  });

  it("lets only moderators watch the live join queue", async () => {
    const topic = `db:join-requests:${serverId}`;
    await asUser(db, mod);
    expect(await one(db, "select public.can_access_realtime_topic($1) as ok", [topic])).toEqual({ ok: true });
    await asUser(db, ana);
    expect(await one(db, "select public.can_access_realtime_topic($1) as ok", [topic])).toEqual({ ok: false });
  });

  it("doesn't reveal anything for a bad code", async () => {
    await asUser(db, ana);
    expect(await failure(db, "select public.join_screening('NOPE123456')")).toMatch(/INVITE_NOT_FOUND/);
    expect(await failure(db, "select public.join_screening(null, $1)", [serverId])).toMatch(/INVITE_NOT_FOUND/);
  });
});
