// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let juan: string;
let maria: string;
let outsider: string;
let serverId: string;
let forum: string;
let post: string;

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  maria = await signUp(db, "maria@diskarte.ph", { username: "maria" });
  outsider = await signUp(db, "out@diskarte.ph", { username: "labas" });
  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  forum = (await one<{ id: string }>(db, "insert into public.channels (server_id, name, type, category) values ($1, 'ideas', 'forum', 'Text Channels') returning id", [serverId])).id;
  for (const user of [juan, maria]) {
    await asUser(db, user);
    await db.query("select public.join_server($1)", [invite_code]);
  }
  await asUser(db, juan);
  post = (await one<{ id: string }>(db, "insert into public.messages (channel_id, author_id, content, title) values ($1, $2, 'Weekly game night?', 'Game night') returning id", [forum, juan])).id;
}, 60_000);

describe("forum tags and solved posts", () => {
  it("lets moderators define tags, deduplicated", async () => {
    await asUser(db, juan);
    expect(await failure(db, "select public.set_forum_settings($1, 'discussion', $2)", [forum, ["Help"]])).toMatch(/NOT_ALLOWED/);
    await asUser(db, owner);
    await db.query("select public.set_forum_settings($1, 'discussion', $2)", [forum, ["Help", " help ", "Events", ""]]);
    expect(await one(db, "select forum_mode, forum_tags from public.channels where id = $1", [forum])).toEqual({ forum_mode: "discussion", forum_tags: ["Help", "Events"] });
    expect(await failure(db, "select public.set_forum_settings($1, 'discussion', $2)", [forum, ["x".repeat(21)]])).toMatch(/INVALID_FORUM_SETTINGS/);
  });

  it("lets the author tag their post and mark it solved, but not someone else's", async () => {
    await asUser(db, juan);
    expect(await failure(db, "select public.set_forum_post($1, $2)", [post, ["Nope"]])).toMatch(/INVALID_TAGS/);
    await db.query("select public.set_forum_post($1, $2, 'solved', true)", [post, ["Events"]]);
    expect(await rows(db, "select tags, status, votes from public.forum_overview($1)", [forum])).toEqual([{ tags: ["Events"], status: "solved", votes: 0 }]);
    expect(await failure(db, "select public.set_forum_post($1, null, 'planned', true)", [post])).toMatch(/INVALID_STATUS/);
    await asUser(db, maria);
    expect(await failure(db, "select public.set_forum_post($1, $2)", [post, ["Help"]])).toMatch(/NOT_ALLOWED/);
    await asUser(db, outsider);
    expect(await failure(db, "select public.set_forum_post($1, $2)", [post, ["Help"]])).toMatch(/POST_NOT_FOUND/);
    expect(await rows(db, "select * from public.forum_overview($1)", [forum])).toHaveLength(0);
  });
});

describe("suggestion boards", () => {
  it("collects one vote per member and only moderators move the status", async () => {
    await asUser(db, owner);
    await db.query("select public.set_forum_settings($1, 'suggestions', $2)", [forum, ["Events"]]);
    await asUser(db, maria);
    expect(await one(db, "select public.toggle_forum_vote($1) as v", [post])).toEqual({ v: true });
    await asUser(db, juan);
    await db.query("select public.toggle_forum_vote($1)", [post]);
    expect(await rows(db, "select votes, voted from public.forum_overview($1)", [forum])).toEqual([{ votes: 2, voted: true }]);
    expect(await one(db, "select public.toggle_forum_vote($1) as v", [post])).toEqual({ v: false });
    expect(await failure(db, "select public.set_forum_post($1, null, 'planned', true)", [post])).toMatch(/NOT_ALLOWED/);
    await asUser(db, owner);
    await db.query("select public.set_forum_post($1, null, 'planned', true)", [post]);
    expect(await failure(db, "select public.set_forum_post($1, null, 'solved', true)", [post])).toMatch(/INVALID_STATUS/);
    expect(await rows(db, "select tags, status, votes from public.forum_overview($1)", [forum])).toEqual([{ tags: ["Events"], status: "planned", votes: 1 }]);
    await asUser(db, outsider);
    expect(await failure(db, "select public.toggle_forum_vote($1)", [post])).toMatch(/POST_NOT_FOUND/);
  });

  it("drops a tag from posts when it's removed, and state goes with the post", async () => {
    await asUser(db, owner);
    await db.query("select public.set_forum_settings($1, 'suggestions', '{}')", [forum]);
    expect(await rows(db, "select tags from public.forum_overview($1)", [forum])).toEqual([{ tags: [] }]);
    await db.query("delete from public.messages where id = $1", [post]);
    expect(await rows(db, "select * from public.forum_overview($1)", [forum])).toHaveLength(0);
  });
});
