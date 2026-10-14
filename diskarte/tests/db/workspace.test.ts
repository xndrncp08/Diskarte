// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db; let owner: string; let member: string; let outsider: string; let channel: string; let secret: string; let server: string;
beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  member = await signUp(db, "member@diskarte.ph", { username: "juan" });
  outsider = await signUp(db, "outsider@diskarte.ph", { username: "dayo" });
  await asUser(db, owner);
  server = (await one<{ id: string }>(db, "select public.create_server('Workspace', '') id")).id;
  const invite = (await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [server])).invite_code;
  channel = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' limit 1", [server])).id;
  secret = (await one<{ id: string }>(db, "insert into public.channels(server_id,name,type,is_private) values ($1,'staff','text',true) returning id", [server])).id;
  await asUser(db, member); await db.query("select public.join_server($1)", [invite]);
});
const save = "select * from public.save_workspace_document($1, 'note', 'Shared notes', $2::jsonb, $3, $4)";
describe("collaborative workspace", () => {
  it("enforces channel privacy and prevents silent concurrent overwrites", async () => {
    await asUser(db, owner);
    const note = await one<{ id: string; revision: number }>(db, save, [channel, '{"text":"First draft"}', null, 0]);
    await db.query(save, [secret, '{"text":"Private plans"}', null, 0]);
    await asUser(db, member);
    expect(await rows(db, "select title from public.workspace_documents")).toHaveLength(1);
    expect(await failure(db, save, [secret, '{"text":"Intrusion"}', null, 0])).toMatch(/WORKSPACE_FORBIDDEN/);
    await db.query(save, [channel, '{"text":"Member edit"}', note.id, note.revision]);
    await asUser(db, owner);
    expect(await failure(db, save, [channel, '{"text":"Stale edit"}', note.id, note.revision])).toMatch(/WORKSPACE_CONFLICT/);
    expect(await one(db, "select content, revision from public.workspace_documents where id = $1", [note.id])).toMatchObject({ content: { text: "Member edit" }, revision: 2 });
    expect(await failure(db, save, [channel, '{"text":"Null revision"}', note.id, null])).toMatch(/WORKSPACE_INVALID/);
    await asUser(db, outsider);
    expect(await rows(db, "select * from public.workspace_documents")).toEqual([]);
    expect(await failure(db, "select public.delete_workspace_document($1, 2)", [note.id])).toMatch(/WORKSPACE_FORBIDDEN/);
  });
  it("validates board data, enforces timeouts, and sets shared timers using the database clock", async () => {
    await asUser(db, owner);
    expect(await failure(db, "select public.save_workspace_document($1,'board','Tasks','{\"cards\":[{\"id\":\"wrong\",\"title\":\"x\",\"status\":\"todo\"}]}')", [channel])).toMatch(/WORKSPACE_INVALID/);
    const timer = await one<{ id: string }>(db, "select id from public.save_workspace_document($1,'focus','Study','{\"goal\":\"Math\",\"minutes\":25}')", [channel]);
    const running = await one<{ content: { endsAt: string }; revision: number }>(db, "select content,revision from public.save_workspace_document($1,'focus','Study','{\"goal\":\"Math\",\"minutes\":25}', $2, 1, 'start')", [channel, timer.id]);
    expect(Date.parse(running.content.endsAt) - Date.now()).toBeGreaterThan(24 * 60000);
    expect(running.revision).toBe(2);
    await db.query("select public.timeout_member($1,$2,10,'test')", [server, member]);
    await asUser(db, member);
    expect(await failure(db, save, [channel, '{"text":"Timed out"}', null, 0])).toMatch(/WORKSPACE_FORBIDDEN/);
    expect(await failure(db, "update public.workspace_documents set title = 'Bypass'")).toMatch(/permission denied/);
  });
});
