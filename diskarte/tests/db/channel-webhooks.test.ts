// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let juan: string;
let serverId: string;
let general: string;
let hook: { id: string; token: string };

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  await asUser(db, juan);
  await db.query("select public.join_server($1)", [invite_code]);
  general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' order by position limit 1", [serverId])).id;
}, 60_000);

describe("channel webhooks", () => {
  it("only admins create them, and nobody reads the token back", async () => {
    await asUser(db, juan);
    expect(await failure(db, "select public.save_channel_webhook($1, 'CI')", [general])).toMatch(/NOT_ALLOWED/);
    await asUser(db, owner);
    hook = (await one<{ h: { id: string; token: string } }>(db, "select public.save_channel_webhook($1, 'CI') as h", [general])).h;
    expect(hook.token).toMatch(/^[0-9a-f]{48}$/);
    expect(await rows(db, "select name from public.channel_webhooks")).toEqual([{ name: "CI" }]);
    expect(await failure(db, "select token_hash from public.channel_webhooks")).toBeTruthy();
    await asUser(db, juan);
    expect(await rows(db, "select 1 from public.channel_webhooks")).toHaveLength(0);
  });

  it("posts with the right token, without a session, under its name", async () => {
    await asAnon(db);
    expect(await failure(db, "select public.post_webhook_message($1, 'wrong', 'hi')", [hook.id])).toMatch(/WEBHOOK_NOT_FOUND/);
    const { id } = await one<{ id: string }>(db, "select public.post_webhook_message($1, $2, 'Build passed ✅', 'GitHub') as id", [hook.id, hook.token]);
    await asUser(db, juan);
    expect(await one(db, "select author_id, webhook_id, webhook_name, content from public.messages where id = $1", [id])).toEqual({
      author_id: null, webhook_id: hook.id, webhook_name: "GitHub", content: "Build passed ✅",
    });
    // Signed-in people can't call it.
    expect(await failure(db, "select public.post_webhook_message($1, $2, 'x')", [hook.id, hook.token])).toBeTruthy();
  });

  it("can't be spoofed by a person posting or editing", async () => {
    await asUser(db, juan);
    const { id } = await one<{ id: string }>(db, "insert into public.messages (channel_id, author_id, content, webhook_id, webhook_name) values ($1, $2, 'fake', $3, 'GitHub') returning id", [general, juan, hook.id]);
    expect(await one(db, "select webhook_id, webhook_name from public.messages where id = $1", [id])).toEqual({ webhook_id: null, webhook_name: null });
    expect(await failure(db, "update public.messages set webhook_name = 'GitHub' where id = $1", [id])).toMatch(/WEBHOOK_IMMUTABLE/);
  });

  it("rotating invalidates the old token; deleting keeps past messages' name", async () => {
    await asUser(db, owner);
    const rotated = (await one<{ h: { id: string; token: string } }>(db, "select public.save_channel_webhook($1, 'CI', $2) as h", [general, hook.id])).h;
    expect(rotated.id).toBe(hook.id);
    await asAnon(db);
    expect(await failure(db, "select public.post_webhook_message($1, $2, 'old')", [hook.id, hook.token])).toMatch(/WEBHOOK_NOT_FOUND/);
    await db.query("select public.post_webhook_message($1, $2, 'new')", [hook.id, rotated.token]);
    await asUser(db, owner);
    await db.query("delete from public.channel_webhooks where id = $1", [hook.id]);
    expect(await rows(db, "select webhook_id, webhook_name from public.messages where content = 'new'")).toEqual([{ webhook_id: null, webhook_name: "CI" }]);
  });
});
