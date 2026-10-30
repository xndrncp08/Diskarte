// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let juan: string;
let maria: string;
let serverId: string;
let general: string;
let invite: string;

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  maria = await signUp(db, "maria@diskarte.ph", { username: "maria" }, { verified: false });
  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  invite = (await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId])).invite_code;
  general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' order by position limit 1", [serverId])).id;
}, 60_000);

describe("welcome messages", () => {
  it("greets new members in the chosen channel once an admin sets a template", async () => {
    await asUser(db, juan);
    await db.query("select public.join_server($1)", [invite]);
    await asUser(db, owner);
    expect(await rows(db, "select 1 from public.messages where webhook_name = 'Welcome'")).toHaveLength(0);
    await db.query("update public.servers set welcome_channel_id = $2, welcome_message = 'Mabuhay {user}! Welcome sa {server}.' where id = $1", [serverId, general]);
    await db.query("update public.channels set requires_verification = true, slowmode_seconds = 60 where id = $1", [general]);

    // An unverified joiner still joins and is greeted (their own rules don't apply to the greeting).
    await asUser(db, maria);
    await db.query("select public.join_server($1)", [invite]);
    expect(await one(db, "select auth.uid() as uid")).toEqual({ uid: maria });
    expect(await rows(db, "select author_id, webhook_name, content from public.messages where channel_id = $1 and webhook_name is not null", [general])).toEqual([
      { author_id: null, webhook_name: "Welcome", content: "Mabuhay @maria! Welcome sa Barkada." },
    ]);
  });

  it("still lets people post normally afterwards (no lingering system marker)", async () => {
    await asUser(db, owner);
    const { id } = await one<{ id: string }>(db, "insert into public.messages (channel_id, author_id, content, webhook_name) values ($1, $2, 'hi', 'Welcome') returning id", [general, owner]);
    expect(await one(db, "select webhook_name from public.messages where id = $1", [id])).toEqual({ webhook_name: null });
  });
});
