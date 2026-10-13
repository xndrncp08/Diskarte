// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let juan: string;
let maria: string;
let message: string;

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  maria = await signUp(db, "maria@diskarte.ph", { username: "maria" });
  await asUser(db, owner);
  const serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  for (const u of [juan, maria]) {
    await asUser(db, u);
    await db.query("select public.join_server($1)", [invite_code]);
  }
  const general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' order by position limit 1", [serverId])).id;
  await asUser(db, juan);
  message = (await one<{ id: string }>(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, 'first') returning id", [general, juan])).id;
}, 60_000);

describe("edit history", () => {
  it("keeps each replaced text for the author and moderators only", async () => {
    await asUser(db, juan);
    await db.query("update public.messages set content = 'second' where id = $1", [message]);
    await db.query("update public.messages set pinned = pinned where id = $1", [message]);
    await db.query("update public.messages set content = 'third' where id = $1", [message]);
    const history = "select content from public.message_edits where message_id = $1 order by replaced_at, id";
    expect(await rows(db, history, [message])).toEqual([{ content: "first" }, { content: "second" }]);
    expect(await failure(db, "insert into public.message_edits (message_id, server_id, content) select id, server_id, 'fake' from public.messages where id = $1", [message])).toMatch(/permission denied/);

    await asUser(db, owner);
    expect((await rows(db, history, [message])).length).toBe(2);
    await asUser(db, maria);
    expect(await rows(db, history, [message])).toEqual([]);
  });
});
