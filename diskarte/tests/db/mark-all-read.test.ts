// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let juan: string;
let a: string;
let b: string;

const unread = async () => rows<{ channel_id: string }>(db, "select channel_id from public.my_unreads() where last_message_at > read_at");

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  await asUser(db, owner);
  const s1 = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const s2 = (await one<{ id: string }>(db, "select public.create_server('Tropa', '') as id")).id;
  a = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' limit 1", [s1])).id;
  b = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' limit 1", [s2])).id;
  for (const s of [s1, s2]) {
    const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [s]);
    await asUser(db, juan);
    await db.query("select public.join_server($1)", [invite_code]);
    await asUser(db, owner);
  }
  // Joined well before the messages (PGlite's clock can give back-to-back statements the same time).
  await asService(db);
  await db.query("update public.members set joined_at = joined_at - interval '1 minute' where user_id = $1", [juan]);
  await asUser(db, owner);
  await db.query("insert into public.messages (channel_id, author_id, content) values ($1, $2, 'hello'), ($3, $2, 'hi')", [a, owner, b]);
}, 60_000);

describe("mark as read", () => {
  it("marks one server, then everything", async () => {
    await asUser(db, juan);
    expect((await unread()).map((r) => r.channel_id).sort()).toEqual([a, b].sort());
    const s1 = (await one<{ server_id: string }>(db, "select server_id from public.channels where id = $1", [a])).server_id;
    await db.query("select public.mark_all_read($1)", [s1]);
    expect((await unread()).map((r) => r.channel_id)).toEqual([b]);
    await db.query("select public.mark_all_read()");
    expect(await unread()).toEqual([]);
  });
});
