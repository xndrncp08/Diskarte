// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let juan: string;
let serverId: string;
let general: string;
let voice: string;

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  await asUser(db, juan);
  await db.query("select public.join_server($1)", [invite_code]);
  general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' order by position limit 1", [serverId])).id;
  voice = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'voice' limit 1", [serverId])).id;
}, 60_000);

describe("recurring announcements", () => {
  it("computes the next local run, daily or on a weekday", async () => {
    // Wed 2026-10-28 10:00 UTC = 18:00 in Manila.
    const next = async (weekday: number | null, time: string) =>
      (await one<{ t: string }>(db, "select to_char(public.announcement_next_run($1, $2::time, 'Asia/Manila', '2026-10-28T10:00:00Z') at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as t", [weekday, time])).t;
    expect(await next(null, "20:00")).toBe("2026-10-28 12:00"); // later today
    expect(await next(null, "09:00")).toBe("2026-10-29 01:00"); // tomorrow
    expect(await next(1, "09:00")).toBe("2026-11-02 01:00"); // next Monday
    expect(await next(3, "18:00")).toBe("2026-11-04 10:00"); // exactly now → next week
  });

  it("only admins manage them, in text channels, with a real time zone", async () => {
    const insert = (channel: string, tz = "Asia/Manila") =>
      db.query("insert into public.server_announcements (server_id, channel_id, content, at_time, time_zone) values ($1, $2, 'Kumusta, barkada!', '09:00', $3)", [serverId, channel, tz]);
    await asUser(db, juan);
    expect(await failure(db, "insert into public.server_announcements (server_id, channel_id, content, at_time, time_zone) values ($1, $2, 'x', '09:00', 'UTC')", [serverId, general])).toBeTruthy();
    await asUser(db, owner);
    expect(await failure(db, "insert into public.server_announcements (server_id, channel_id, content, at_time, time_zone) values ($1, $2, 'x', '09:00', 'UTC')", [serverId, voice])).toMatch(/NOT_A_TEXT_CHANNEL/);
    expect(await failure(db, "insert into public.server_announcements (server_id, channel_id, content, at_time, time_zone) values ($1, $2, 'x', '09:00', 'Mars/Olympus')", [serverId, general])).toMatch(/INVALID_TIME_ZONE/);
    await insert(general);
    await asUser(db, juan);
    expect(await rows(db, "select 1 from public.server_announcements")).toHaveLength(0);
  });

  it("posts due announcements once, as Announcement, and schedules the next run", async () => {
    await asService(db);
    await db.query("update public.server_announcements set next_run_at = now() - interval '1 minute'");
    expect(await one(db, "select public.run_due_announcements() as n")).toEqual({ n: 1 });
    expect(await one(db, "select public.run_due_announcements() as n")).toEqual({ n: 0 });
    expect(await rows(db, "select author_id, webhook_name, content from public.messages where webhook_name = 'Announcement'")).toEqual([
      { author_id: null, webhook_name: "Announcement", content: "Kumusta, barkada!" },
    ]);
    const a = await one<{ next_run_at: Date; last_run_at: Date | null }>(db, "select next_run_at, last_run_at from public.server_announcements");
    expect(a.last_run_at).not.toBeNull();
    expect(a.next_run_at.getTime()).toBeGreaterThan(Date.now());
    // Signed-in people can't trigger runs.
    await asUser(db, owner);
    expect(await failure(db, "select public.run_due_announcements()")).toBeTruthy();
  });
});
