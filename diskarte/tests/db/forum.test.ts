// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let juan: string;
let serverId: string;
let forum: string;
let general: string;

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' limit 1", [serverId])).id;
  forum = (await one<{ id: string }>(db, "insert into public.channels (server_id, name, type, category) values ($1, 'tulong', 'forum', 'Text Channels') returning id", [serverId])).id;
  await asUser(db, juan);
  await db.query("select public.join_server($1)", [invite_code]);
}, 60_000);

describe("forum channels", () => {
  it("needs slug names like text channels", async () => {
    await asUser(db, owner);
    expect(await failure(db, "insert into public.channels (server_id, name, type, category) values ($1, 'Bad Name', 'forum', 'Text Channels')", [serverId])).toMatch(/channels_name_format/);
  });

  it("makes top-level messages titled posts, with replies in the post's thread", async () => {
    await asUser(db, juan);
    expect(await failure(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, 'walang title')", [forum, juan])).toMatch(/POST_TITLE_REQUIRED/);
    const post = (await one<{ id: string; title: string }>(db, "insert into public.messages (channel_id, author_id, content, title) values ($1, $2, 'Paano mag-setup ng mic?', '  Mic help  ') returning id, title", [forum, juan]));
    expect(post.title).toBe("Mic help");
    const reply = await one<{ title: string | null }>(db, "insert into public.messages (channel_id, author_id, content, thread_id, title) values ($1, $2, 'Settings → Voice', $3, 'ignored') returning title", [forum, owner, post.id]);
    expect(reply.title).toBeNull();
    expect(await one(db, "select thread_reply_count from public.messages where id = $1", [post.id])).toEqual({ thread_reply_count: 1 });
    // Text channels never carry titles.
    expect(await one(db, "insert into public.messages (channel_id, author_id, content, title) values ($1, $2, 'hi', 'nope') returning title", [general, juan])).toEqual({ title: null });
  });

  it("shows up in unreads", async () => {
    await asUser(db, owner);
    expect((await rows<{ channel_id: string }>(db, "select * from public.my_unreads()")).map((r) => Object.values(r)[0])).toContain(forum);
  });
});
