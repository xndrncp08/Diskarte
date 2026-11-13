// @vitest-environment node
// Rehearses docs/sql/production-catchup.sql on a database rebuilt with production's history (every
// migration except the ones production never received) and holding data like production's.
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, one, rows, signUp, type Db } from "./harness";

const bundle = fs.readFileSync(path.join(__dirname, "../../docs/sql/production-catchup.sql"), "utf8");
const missing = ["20261014030000", "20261014040000", "20261014050000", "20261014060000", "20261014070000", "20261014080000", "20261014090000", "20261107000000"];
// The bundle's own fingerprint query, so the test compares exactly what production will.
const fingerprintSql = bundle.match(/create temp view catchup_fingerprint as\n([\s\S]*?);\n/)![1];

let db: Db;
let juan: string;
let maria: string;
let serverId: string;
let eventId: string;

async function fingerprint(target: Db) {
  return Object.fromEntries((await rows<{ cat: string; n: number; h: string }>(target, fingerprintSql)).map((r) => [r.cat, `${r.n}:${r.h}`]));
}

/** Runs the bundle; on failure ends the aborted transaction, like a fresh SQL-editor connection would. */
async function apply(sql = bundle) {
  await asService(db);
  try {
    await db.exec(sql);
    return null;
  } catch (err) {
    await db.exec("rollback");
    return err instanceof Error ? err.message : String(err);
  }
}

async function snapshot() {
  await asService(db);
  return {
    dms: await rows(db, "select id, conversation_id, author_id, content, created_at from public.direct_messages order by id"),
    events: await rows(db, "select id, name, starts_at from public.server_events order by id"),
    rsvps: await rows(db, "select event_id, user_id from public.event_rsvps order by event_id, user_id"),
    fingerprint: await fingerprint(db),
  };
}

beforeAll(async () => {
  db = await createDb({ skip: missing });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  maria = await signUp(db, "maria@diskarte.ph", { username: "maria" });
  await asUser(db, juan);
  await db.query("select public.send_friend_request('maria')");
  await asUser(db, maria);
  await db.query("select public.respond_friend_request($1, true)", [juan]);
  await asUser(db, juan);
  const conversation = (await one<{ id: string }>(db, "select public.open_dm($1) as id", [maria])).id;
  await db.query("insert into public.direct_messages (conversation_id, content) values ($1, 'kumusta')", [conversation]);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  eventId = (await one<{ id: string }>(db, "insert into public.server_events (server_id, name, starts_at) values ($1, 'Laro', now() + interval '1 day') returning id", [serverId])).id;
  await asUser(db, maria);
  await db.query("select public.join_server($1)", [invite_code]);
  for (const u of [juan, maria]) {
    await asUser(db, u);
    await db.query("insert into public.event_rsvps (event_id, server_id) values ($1, $2)", [eventId, serverId]);
  }
}, 60_000);

describe("production catch-up bundle", () => {
  it("rolls back completely when anything fails before COMMIT", async () => {
    const before = await snapshot();
    expect(await apply(bundle.replace(/\ncommit;\s*$/, "\nselect 1 / 0;\ncommit;\n"))).toMatch(/division by zero/);
    expect(await snapshot()).toEqual(before);
  });

  it("brings the schema to exactly the full-migration schema without losing rows", async () => {
    const before = await snapshot();
    expect(await apply()).toBeNull();
    const after = await snapshot();
    expect(after.fingerprint).toEqual(await fingerprint(await createDb()));
    expect(after.dms).toEqual(before.dms);
    expect(after.events).toEqual(before.events);
    expect(after.rsvps).toEqual(before.rsvps);
    expect(await one(db, "select rsvp_count, capacity from public.server_events where id = $1", [eventId])).toEqual({ rsvp_count: 2, capacity: null });
    expect(await rows(db, "select * from public.release_announcements")).toEqual([]);
  });

  it("restores the features that needed the missing schema", async () => {
    await asUser(db, juan);
    const exported = await one<{ data: { direct_messages: { content: string; attachments: unknown[] }[] } }>(db, "select public.export_my_data() as data");
    expect(exported.data.direct_messages).toEqual([expect.objectContaining({ content: "kumusta", attachments: [] })]);
    expect(await rows(db, "select name, rsvp_count, interested from public.list_server_events($1)", [serverId])).toEqual([{ name: "Laro", rsvp_count: 2, interested: true }]);
    await asService(db);
    expect(await one(db, "select has_function_privilege('authenticated', 'public.export_my_data_base()', 'execute') as ok")).toEqual({ ok: false });
  });

  it("refuses to run a second time and changes nothing", async () => {
    const before = await snapshot();
    expect(await apply()).toMatch(/catch-up preflight failed: schema differs in/);
    expect(await snapshot()).toEqual(before);
  });
});
