// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let juan: string;
let outsider: string;
let serverId: string;
let general: string;
const file = (n: number) => `3f2a1c4e-8b7d-4e6f-9a0b-${String(n).padStart(12, "0")}`;

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  outsider = await signUp(db, "out@diskarte.ph", { username: "outsider" });
  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' limit 1", [serverId])).id;
  await asUser(db, juan);
  await db.query("select public.join_server($1)", [invite_code]);
}, 60_000);

const add = (name: string, n: number, ext = "png", server = serverId) =>
  db.query("insert into public.server_emojis (server_id, name, path) values ($1, $2, $3)", [server, name, `${server}/${file(n)}.${ext}`]);

describe("server emoji", () => {
  it("lets admins add emoji with a valid :name: and image path, not members", async () => {
    await asUser(db, juan);
    expect(await failure(db, "insert into public.server_emojis (server_id, name, path) values ($1, 'pogi', $2)", [serverId, `${serverId}/${file(1)}.png`])).toMatch(/row-level security/);
    expect(await failure(db, "insert into storage.objects (bucket_id, name) values ('emoji', $1)", [`${serverId}/${file(1)}.png`])).toMatch(/row-level security/);
    await asUser(db, owner);
    await db.query("insert into storage.objects (bucket_id, name) values ('emoji', $1)", [`${serverId}/${file(1)}.png`]);
    await add("pogi", 1);
    expect(await failure(db, "insert into public.server_emojis (server_id, name, path) values ($1, 'pogi', $2)", [serverId, `${serverId}/${file(2)}.png`])).toMatch(/duplicate key/);
    expect(await failure(db, "insert into public.server_emojis (server_id, name, path) values ($1, 'Bad Name', $2)", [serverId, `${serverId}/${file(3)}.png`])).toMatch(/check constraint/);
    expect(await failure(db, "insert into public.server_emojis (server_id, name, path) values ($1, 'svg', $2)", [serverId, `${serverId}/${file(4)}.svg`])).toMatch(/check constraint/);
  });

  it("is visible to members (and usable as a reaction), not outsiders", async () => {
    await asUser(db, juan);
    expect(await rows(db, "select name from public.server_emojis")).toEqual([{ name: "pogi" }]);
    const msg = (await one<{ id: string }>(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, 'ang :pogi: mo') returning id", [general, juan])).id;
    await db.query("insert into public.reactions (message_id, user_id, emoji) values ($1, $2, ':pogi:')", [msg, juan]);
    await asUser(db, outsider);
    expect(await rows(db, "select name from public.server_emojis")).toEqual([]);
  });

  it("caps a server at 50", async () => {
    await asUser(db, owner);
    for (let i = 10; i < 59; i++) await add(`e${i}`, i);
    expect(await failure(db, "insert into public.server_emojis (server_id, name, path) values ($1, 'onemore', $2)", [serverId, `${serverId}/${file(99)}.png`])).toMatch(/TOO_MANY_EMOJI/);
  });
});
