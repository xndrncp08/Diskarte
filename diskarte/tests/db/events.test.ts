// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let juan: string;
let outsider: string;
let serverId: string;
let voice: string;
let text: string;
let event: string;

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
  voice = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'voice' limit 1", [serverId])).id;
  text = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' limit 1", [serverId])).id;
}, 60_000);

const schedule = "insert into public.server_events (server_id, channel_id, name, starts_at) values ($1, $2, $3, now() + interval '1 day') returning id";

describe("scheduled events", () => {
  it("hides private-channel events and RSVPs until channel access is granted", async () => {
    await asUser(db, owner);
    const privateVoice = (await one<{ id: string }>(db, "insert into public.channels (server_id, name, type, is_private) values ($1, 'staff-call', 'voice', true) returning id", [serverId])).id;
    const privateEvent = (await one<{ id: string }>(db, schedule, [serverId, privateVoice, "Private planning"])).id;
    await db.query("insert into public.event_rsvps (event_id, server_id) values ($1, $2)", [privateEvent, serverId]);
    await asUser(db, juan);
    expect(await rows(db, "select id from public.server_events where id = $1", [privateEvent])).toEqual([]);
    expect(await rows(db, "select user_id from public.event_rsvps where event_id = $1", [privateEvent])).toEqual([]);
    expect(await failure(db, "insert into public.event_rsvps (event_id, server_id) values ($1, $2)", [privateEvent, serverId])).toMatch(/row-level security/);
    await asUser(db, owner);
    await db.query("insert into public.channel_access (channel_id, server_id, user_id) values ($1, $2, $3)", [privateVoice, serverId, juan]);
    await asUser(db, juan);
    expect(await rows(db, "select name from public.server_events where id = $1", [privateEvent])).toEqual([{ name: "Private planning" }]);
    await db.query("insert into public.event_rsvps (event_id, server_id) values ($1, $2)", [privateEvent, serverId]);
    await asUser(db, owner);
    await db.query("delete from public.server_events where id = $1", [privateEvent]);
  });
  it("lets moderators schedule in a voice channel of this server, not members", async () => {
    await asUser(db, juan);
    expect(await failure(db, schedule, [serverId, voice, "Game night"])).toMatch(/row-level security/);
    await asUser(db, owner);
    expect(await failure(db, schedule, [serverId, text, "Game night"])).toMatch(/row-level security/);
    expect(await failure(db, "insert into public.server_events (server_id, name, starts_at) values ($1, 'Past', now() - interval '1 day')", [serverId])).toMatch(/row-level security/);
    expect(await failure(db, "insert into public.server_events (server_id, name, starts_at, ends_at) values ($1, 'Bad', now() + interval '2 hours', now() + interval '1 hour')", [serverId])).toMatch(/check constraint/);
    event = (await one<{ id: string }>(db, schedule, [serverId, voice, "Game night"])).id;
    expect(await failure(db, "update public.server_events set server_id = gen_random_uuid() where id = $1", [event])).toMatch(/EVENT_IMMUTABLE_FIELD|foreign key/);
  });

  it("allows moderator edits while preserving RSVPs and denying member or cross-server changes", async () => {
    await asUser(db, owner);
    const editable = (await one<{ id: string }>(db, schedule, [serverId, voice, "Study group"])).id;
    await asUser(db, juan);
    await db.query("insert into public.event_rsvps (event_id, server_id) values ($1, $2)", [editable, serverId]);
    expect(await rows(db, "update public.server_events set name = 'Member takeover' where id = $1 returning id", [editable])).toEqual([]);
    await asUser(db, owner);
    expect(await one(db, "update public.server_events set name = 'Study together', description = 'Bring notes' where id = $1 returning name, description", [editable])).toEqual({ name: "Study together", description: "Bring notes" });
    expect(await rows(db, "select user_id from public.event_rsvps where event_id = $1", [editable])).toEqual([{ user_id: juan }]);
    expect(await failure(db, "update public.server_events set channel_id = $1 where id = $2", [text, editable])).toMatch(/row-level security/);
    const other = (await one<{ id: string }>(db, "select public.create_server('Other community', '') as id")).id;
    const otherVoice = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'voice' limit 1", [other])).id;
    expect(await failure(db, "update public.server_events set channel_id = $1 where id = $2", [otherVoice, editable])).toMatch(/row-level security/);
    await db.query("delete from public.server_events where id = $1", [editable]);
  });

  it("lets members mark themselves interested; outsiders see nothing", async () => {
    await asUser(db, juan);
    expect(await rows(db, "select name from public.server_events")).toEqual([{ name: "Game night" }]);
    await db.query("insert into public.event_rsvps (event_id, server_id) values ($1, $2)", [event, serverId]);
    expect(await failure(db, "insert into public.event_rsvps (event_id, server_id, user_id) values ($1, $2, $3)", [event, serverId, owner])).toMatch(/row-level security/);
    // RLS hides the row from members' updates.
    await db.query("update public.server_events set name = 'mine' where id = $1", [event]);
    expect(await one(db, "select name from public.server_events where id = $1", [event])).toEqual({ name: "Game night" });
    await asUser(db, outsider);
    expect(await rows(db, "select id from public.server_events")).toEqual([]);
    expect(await failure(db, "insert into public.event_rsvps (event_id, server_id) values ($1, $2)", [event, serverId])).toMatch(/row-level security/);
    await asUser(db, owner);
    expect(await rows(db, "select user_id from public.event_rsvps where event_id = $1", [event])).toEqual([{ user_id: juan }]);
    await db.query("delete from public.server_events where id = $1", [event]);
    expect(await rows(db, "select user_id from public.event_rsvps")).toEqual([]);
  });
});
