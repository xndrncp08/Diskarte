// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let juan: string;
let outsider: string;
let general: string;
let message: string;
let messageAt: string;

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  outsider = await signUp(db, "out@diskarte.ph", { username: "outsider" });
  await asUser(db, owner);
  const serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  await asUser(db, juan);
  await db.query("select public.join_server($1)", [invite_code]);
  await asUser(db, owner);
  general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' order by position limit 1", [serverId])).id;
  ({ id: message, created_at: messageAt } = await one<{ id: string; created_at: string }>(db, "insert into public.messages (channel_id, server_id, author_id, content) values ($1, $2, $3, 'save me') returning id, created_at", [general, serverId, owner]));
}, 60_000);

describe("saved messages", () => {
  it("lets you save what you can read, privately", async () => {
    await asUser(db, juan);
    await db.query("insert into public.saved_messages (message_id) values ($1)", [message]);
    expect(await rows(db, "select message_id from public.saved_messages")).toEqual([{ message_id: message }]);
    await asUser(db, owner);
    expect(await rows(db, "select 1 from public.saved_messages")).toHaveLength(0);
    await asUser(db, outsider);
    expect(await failure(db, "insert into public.saved_messages (message_id) values ($1)", [message])).toBeTruthy();
  });

  it("marks a channel unread from a message on", async () => {
    await asUser(db, juan);
    await db.query("select public.mark_channel_read($1)", [general]);
    await db.query("select public.mark_channel_unread($1, $2)", [general, messageAt]);
    const u = await one<{ last_message_at: string; read_at: string }>(db, "select last_message_at, read_at from public.my_unreads() where channel_id = $1", [general]);
    expect(new Date(u.last_message_at) > new Date(u.read_at)).toBe(true);
  });
});
