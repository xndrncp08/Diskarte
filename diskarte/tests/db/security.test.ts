// @vitest-environment node
// Adversarial checks: every statement here is an attack that RLS, grants or guard triggers must stop.
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let alice: string; // owner
let bob: string; // member
let mallory: string; // outsider
let serverId: string;
let general: string;
let aliceMessage: string;
const U = "abcdef01-2345-4678-89ab-cdef01234567";

beforeAll(async () => {
  db = await createDb();
  alice = await signUp(db, "alice@diskarte.ph");
  bob = await signUp(db, "bob@diskarte.ph");
  mallory = await signUp(db, "mallory@diskarte.ph");
  await asUser(db, alice);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Secure HQ') as id")).id;
  const code = (await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId])).invite_code;
  general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and name = 'general'", [serverId])).id;
  aliceMessage = (await one<{ id: string }>(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, 'secret plans') returning id", [general, alice])).id;
  await asUser(db, bob);
  await db.query("select public.join_server($1)", [code]);
}, 60_000);

const attachment = (owner: string, overrides: Record<string, unknown> = {}) => ({
  path: `${serverId}/${general}/${owner}/${U}.png`,
  name: "photo.png",
  size: 1024,
  type: "image/png",
  ...overrides,
});

async function sendWith(user: string, attachments: unknown[]) {
  await asUser(db, user);
  return failure(db, "insert into public.messages (channel_id, author_id, content, attachments) values ($1, $2, 'x', $3)", [general, user, JSON.stringify(attachments)]);
}

describe("profiles", () => {
  it("cannot be edited by other users", async () => {
    await asUser(db, mallory);
    const changed = await rows(db, "update public.profiles set display_name = 'pwned', bio = 'pwned' where id = $1 returning id", [alice]);
    expect(changed).toHaveLength(0);
    await asService(db);
    expect((await one<{ display_name: string }>(db, "select display_name from public.profiles where id = $1", [alice])).display_name).not.toBe("pwned");
  });

  it("cannot have their id rewritten", async () => {
    await asUser(db, mallory);
    expect(await failure(db, "update public.profiles set id = $1 where id = $2", [alice, mallory])).toMatch(/PROFILE_IMMUTABLE_FIELD|row-level security|duplicate key/);
  });

  it("reject javascript: and non-https avatar URLs", async () => {
    await asUser(db, mallory);
    for (const url of ["javascript:alert(1)", "http://evil.example/a.png", 'https://x.y/a.png" onerror="alert(1)']) {
      expect(await failure(db, "update public.profiles set avatar_url = $1 where id = $2", [url, mallory])).toMatch(/check constraint/);
    }
  });
});

describe("data isolation", () => {
  it("outsiders can't read a server's messages even when filtering by id", async () => {
    await asUser(db, mallory);
    expect(await rows(db, "select * from public.messages where id = $1", [aliceMessage])).toHaveLength(0);
    expect(await rows(db, "select * from public.messages where server_id = $1", [serverId])).toHaveLength(0);
    expect(await rows(db, "select * from public.reactions where server_id = $1", [serverId])).toHaveLength(0);
  });

  it("outsiders can't post into a server by guessing a channel id", async () => {
    await asUser(db, mallory);
    expect(await failure(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, 'spam')", [general, mallory])).toMatch(/row-level security/);
  });

  it("members can't move or re-attribute existing messages", async () => {
    await asUser(db, alice);
    expect(await failure(db, "update public.messages set author_id = $1 where id = $2", [bob, aliceMessage])).toMatch(/MESSAGE_IMMUTABLE_FIELD/);
    await asUser(db, bob);
    const edited = await rows(db, "update public.messages set content = 'forged' where id = $1 returning id", [aliceMessage]);
    // Bob can see the row (member) but the guard blocks editing someone else's message.
    expect(edited).toHaveLength(0);
  });

  it("signed-out clients are denied outright", async () => {
    await asAnon(db);
    expect(await failure(db, "select * from public.messages")).toMatch(/permission denied/);
    expect(await failure(db, "insert into public.messages (channel_id, content) values ($1, 'anon')", [general])).toMatch(/permission denied/);
    expect(await failure(db, "select public.create_server('anon server')")).toMatch(/permission denied/);
  });
});

describe("SQL injection resistance", () => {
  it("treats hostile RPC arguments as data", async () => {
    await asUser(db, mallory);
    expect(await failure(db, "select public.join_server($1)", ["' OR 1=1; --"])).toMatch(/INVITE_NOT_FOUND/);
    expect((await one<{ ok: boolean }>(db, "select public.username_available($1) as ok", ["x'; drop table public.profiles; --"])).ok).toBe(false);
    await asService(db);
    expect(await rows(db, "select 1 from public.profiles")).not.toHaveLength(0);
  });

  it("stores markup verbatim as inert text (rendering escapes it)", async () => {
    await asUser(db, bob);
    const payload = '<img src=x onerror="alert(document.cookie)"><script>alert(1)</script>';
    const saved = await one<{ content: string }>(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, $3) returning content", [general, bob, payload]);
    expect(saved.content).toBe(payload);
  });
});

describe("attachment guardrails", () => {
  it("accepts an allow-listed file in the uploader's folder", async () => {
    expect(await sendWith(bob, [attachment(bob)])).toBeNull();
  });

  it.each([
    ["HTML", { type: "text/html", path: `${U}.html` }],
    ["SVG", { type: "image/svg+xml", path: `${U}.svg` }],
    ["oversized", { size: 10 * 1024 * 1024 + 1 }],
    ["zero-byte", { size: 0 }],
    ["user-chosen filename", { path: "evil.png" }],
    ["path traversal", { path: `../../${U}.png` }],
    ["double extension", { path: `${U}.png.html` }],
    ["string size", { size: "1024" }],
  ])("rejects %s attachments", async (_label, override) => {
    const o = override as Record<string, unknown>;
    const path = typeof o.path === "string" && !o.path.includes("/") ? `${serverId}/${general}/${bob}/${o.path}` : o.path;
    expect(await sendWith(bob, [attachment(bob, { ...o, ...(path ? { path } : {}) })])).toMatch(/INVALID_ATTACHMENT/);
  });

  it("rejects files that live in someone else's folder", async () => {
    expect(await sendWith(bob, [attachment(alice)])).toMatch(/INVALID_ATTACHMENT/);
  });

  it("storage refuses non-UUID object names and traversal", async () => {
    await asUser(db, bob);
    for (const name of [`${serverId}/${general}/${bob}/evil.html`, `${serverId}/${general}/${bob}/../${alice}/${U}.png`, `${serverId}/${general}/${bob}/${U}.exe`]) {
      expect(await failure(db, "insert into storage.objects (bucket_id, name) values ('attachments', $1)", [name])).toMatch(/row-level security/);
    }
    expect(await failure(db, "insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${bob}/../../${alice}/avatar-${U}.png`])).toMatch(/row-level security/);
  });

  it("outsiders can't read attachments", async () => {
    await asUser(db, bob);
    await db.query("insert into storage.objects (bucket_id, name) values ('attachments', $1)", [`${serverId}/${general}/${bob}/${U}.png`]);
    await asUser(db, mallory);
    expect(await rows(db, "select * from storage.objects where bucket_id = 'attachments'")).toHaveLength(0);
  });

  it("buckets enforce size and MIME allow-lists", async () => {
    await asService(db);
    const bucket = await one<{ file_size_limit: number; allowed_mime_types: string[] }>(db, "select file_size_limit, allowed_mime_types from storage.buckets where id = 'attachments'");
    expect(Number(bucket.file_size_limit)).toBe(10 * 1024 * 1024);
    expect(bucket.allowed_mime_types.sort()).toEqual(["audio/mpeg", "image/gif", "image/jpeg", "image/png", "image/webp", "video/mp4"]);
  });
});
