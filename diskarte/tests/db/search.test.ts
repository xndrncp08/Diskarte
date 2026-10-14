// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let juan: string;
let outsider: string;
let serverId: string;
let general: string;
let secret: string;
let dm: string;

const search = async (user: string, query: string, opts: { channel?: string; author?: string } = {}) => {
  await asUser(db, user);
  return (await rows<{ content: string }>(db, "select content from public.search_messages($1, $2, $3, $4)", [serverId, query, opts.channel ?? null, opts.author ?? null])).map((r) => r.content);
};

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  outsider = await signUp(db, "out@diskarte.ph", { username: "outsider" });
  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  await asUser(db, juan);
  await db.query("select public.join_server($1)", [invite_code]);
  await asUser(db, owner);
  general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' order by position limit 1", [serverId])).id;
  secret = (await one<{ id: string }>(db, "insert into public.channels (server_id, name, type, is_private) values ($1, 'secret', 'text', true) returning id", [serverId])).id;
  for (const [user, channel, content] of [
    [owner, general, "Kumain na ba kayo ng adobo?"],
    [juan, general, "Adobong manok yung luto ko"],
    [juan, general, "Laro tayo Valorant mamaya"],
    [owner, secret, "Secret adobo recipe"],
  ]) {
    await asUser(db, user);
    await db.query("insert into public.messages (channel_id, server_id, author_id, content) values ($1, $2, $3, $4)", [channel, serverId, user, content]);
  }
  await asUser(db, owner);
  await db.query("select public.send_friend_request('juan')");
  await asUser(db, juan);
  await db.query("select public.respond_friend_request($1, true)", [owner]);
  dm = (await one<{ id: string }>(db, "select public.open_dm($1) id", [owner])).id;
  await db.query("insert into public.direct_messages (conversation_id, author_id, content) values ($1, $2, 'Private adobo shopping list')", [dm, juan]);
}, 60_000);

describe("message search", () => {
  it("globally searches permitted channels and DMs with dates and sender filters", async () => {
    await asUser(db, juan);
    const found = await rows<{ content: string; source: string }>(db, "select content, source from public.search_all_messages('adob')");
    expect(found.map((r) => r.content)).toEqual(["Private adobo shopping list", "Adobong manok yung luto ko", "Kumain na ba kayo ng adobo?"]);
    expect(found[0].source).toBe("dm");
    expect(await rows(db, "select id from public.search_all_messages('adob', p_after => now() + interval '1 day')")).toEqual([]);
    expect(await rows(db, "select id from public.search_all_messages('adob', p_kind => 'image')")).toEqual([]);
    expect(await rows(db, "select id from public.search_all_messages('')")).toEqual([]);
    expect(await rows(db, "select id from public.search_all_messages('adob', p_server => $1, p_author => $2)", [serverId, juan])).toHaveLength(1);
    await asUser(db, outsider);
    expect(await rows(db, "select id from public.search_all_messages('adob')")).toEqual([]);
  });

  it("does not skip messages sharing a timestamp at a page boundary", async () => {
    await asUser(db, owner);
    await db.query("insert into public.messages (channel_id, server_id, author_id, content) values ($1, $2, $3, 'Keyset first'), ($1, $2, $3, 'Keyset second')", [general, serverId, owner]);
    const first = await one<{ id: string; created_at: string }>(db, "select id, created_at::text from public.search_all_messages('keyset', p_limit => 1)");
    const next = await one<{ id: string }>(db, "select id from public.search_all_messages('keyset', p_cursor_date => $1, p_cursor_id => $2, p_limit => 1)", [first.created_at, first.id]);
    expect(next.id).not.toBe(first.id);
    expect(await rows(db, "select id from public.search_all_messages('keyset', p_cursor_date => $1, p_cursor_id => $2)", [first.created_at, next.id])).toEqual([]);
  });
  it("finds words by prefix, newest first, only in channels you can read", async () => {
    expect(await search(juan, "adob")).toEqual(["Adobong manok yung luto ko", "Kumain na ba kayo ng adobo?"]);
    expect(await search(owner, "adobo recipe")).toEqual(["Secret adobo recipe"]);
    expect(await search(juan, "recipe")).toEqual([]);
  });

  it("filters by author and channel, and lists someone's messages with no words", async () => {
    expect(await search(owner, "adob", { author: juan })).toEqual(["Adobong manok yung luto ko"]);
    expect(await search(owner, "", { author: juan })).toHaveLength(2);
    expect(await search(owner, "", {})).toEqual([]); // nothing to search for
    expect(await search(owner, "adobo", { channel: secret })).toEqual(["Secret adobo recipe"]);
  });

  it("shows nothing to people outside the server, and shrugs at punctuation", async () => {
    expect(await search(outsider, "adobo")).toEqual([]);
    expect(await search(juan, "'); drop table messages; --")).toEqual([]);
    expect(await search(juan, "valorant!!")).toEqual(["Laro tayo Valorant mamaya"]);
  });
});
