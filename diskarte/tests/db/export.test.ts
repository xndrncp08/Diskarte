// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createDb, failure, one, signUp, type Db } from "./harness";

let db: Db;
let juan: string;
let maria: string;

beforeAll(async () => {
  db = await createDb();
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  maria = await signUp(db, "maria@diskarte.ph", { username: "maria" });
  await asUser(db, juan);
  const serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' limit 1", [serverId])).id;
  await db.query("insert into public.messages (channel_id, author_id, content) values ($1, $2, 'Kumusta kayo?')", [general, juan]);
  await db.query("select public.send_friend_request('maria')");
  await db.query("insert into public.user_notes (target_id, note) values ($1, 'classmate')", [maria]);
  await asUser(db, maria);
  await db.query("insert into public.messages (channel_id, author_id, content) select id, $1, 'not juan' from public.channels where false", [maria]);
}, 60_000);

describe("data export", () => {
  it("gives me my own data only", async () => {
    await asUser(db, juan);
    const { data } = await one<{ data: Record<string, unknown> }>(db, "select public.export_my_data() as data");
    expect((data.profile as { username: string }).username).toBe("juan");
    expect(data.servers).toEqual([expect.objectContaining({ name: "Diskarte HQ", owner: false }), expect.objectContaining({ name: "Barkada", role: "admin", owner: true })]);
    expect(data.messages).toEqual([expect.objectContaining({ content: "Kumusta kayo?", channel: "general", server: "Barkada" })]);
    expect(data.friends).toEqual([expect.objectContaining({ username: "maria", status: "pending", requested_by_me: true })]);
    expect(data.notes).toEqual([expect.objectContaining({ about: "maria", note: "classmate" })]);
    expect(data.direct_messages).toEqual([]);

    await asUser(db, maria);
    const other = await one<{ data: Record<string, unknown> }>(db, "select public.export_my_data() as data");
    expect(other.data.messages).toEqual([]);
    expect(other.data.notes).toEqual([]);

    await asAnon(db);
    expect(await failure(db, "select public.export_my_data()")).toMatch(/permission denied|NOT_AUTHENTICATED/);
  });
});
