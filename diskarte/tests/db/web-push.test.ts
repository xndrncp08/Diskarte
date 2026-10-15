// @vitest-environment node
import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { asAnon, asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";
let db:Db, alice:string,bob:string,eve:string, server:string,channel:string,conversation:string;
const bDevice=randomUUID(), cDevice=randomUUID();
const key=createECDH("prime256v1");key.generateKeys();const publicKey=key.getPublicKey().toString("base64url"),auth=randomBytes(16).toString("base64url");
async function session(user:string){await asService(db);const id=(await one<{id:string}>(db,"insert into auth.sessions(user_id) values($1) returning id",[user])).id;await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:id})]);await asUser(db,user);return id;}
async function register(device:string,path=device){return one(db,"select public.register_push($1,$2,$3,$4,'Test browser') as id",[device,`https://fcm.googleapis.com/fcm/send/${path}`,publicKey,auth]);}
async function dm(content="Private message",extra=""){await asUser(db,alice);return (await one<{id:string}>(db,`insert into public.direct_messages(conversation_id,author_id,content${extra?",invite_server_id":""}) values($1,$2,$3${extra?",$4":""}) returning id`,[conversation,alice,content,...extra?[extra]:[]])).id;}
async function claim(){await asService(db);return rows<{id:string;lease:string}>(db,"select * from public.claim_push_jobs(50)");}
async function prepare(job:{id:string;lease:string}){return (await one<{job:Record<string,unknown>|null}>(db,"select public.prepare_push_job($1,$2) as job",[job.id,job.lease])).job;}
beforeAll(async()=>{
 db=await createDb();alice=await signUp(db,"push-alice@example.test",{username:"push_alice"});bob=await signUp(db,"push-bob@example.test",{username:"push_bob"});eve=await signUp(db,"push-eve@example.test",{username:"push_eve"});
 await asUser(db,alice);server=(await one<{id:string}>(db,"select public.create_server('Push community','') as id")).id;
 channel=(await one<{id:string}>(db,"select id from public.channels where server_id=$1 and type='text' limit 1",[server])).id;
 await asService(db);await db.query("insert into public.members(server_id,user_id) values($1,$2)",[server,bob]);
 await db.query("insert into public.friendships(user_low,user_high,requested_by,status) values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'accepted')",[alice,bob]);
 await asUser(db,alice);conversation=(await one<{id:string}>(db,"select public.open_dm($1) as id",[bob])).id;
 await asService(db);await db.exec("update private_push.configuration set enabled=true");
});
beforeEach(async()=>{await asService(db);await db.exec("delete from private_push.outbox; delete from private_push.subscriptions; delete from public.user_blocks");await session(bob);await register(bDevice);});
it("isolates subscriptions, validates endpoints, and binds each registration to an authenticated session",async()=>{
 const devices=await rows(db,"select * from public.list_push_devices()");expect(devices).toHaveLength(1);expect(devices[0]).not.toHaveProperty("endpoint");
 expect(await failure(db,"select * from private_push.subscriptions")).toMatch(/permission denied/);
 expect(await failure(db,"select public.register_push($1,'https://127.0.0.1/private',$2,$3,'bad')",[cDevice,publicKey,auth])).toMatch(/PUSH_INVALID/);
 expect(await failure(db,"select * from public.claim_push_jobs(20)")).toMatch(/permission denied/);
 await session(eve);expect(await rows(db,"select * from public.list_push_devices()")).toEqual([]);
 await db.query("select public.remove_push_device($1)",[bDevice]);await asService(db);expect(await rows(db,"select id from private_push.subscriptions")).toHaveLength(1);
 await asAnon(db);expect(await failure(db,"select public.list_push_devices()")).toMatch(/permission denied/);
 await asUser(db,bob);await db.query("select set_config('request.jwt.claims','{}',false)");expect(await failure(db,"select public.register_push($1,$2,$3,$4,'No session')",[cDevice,'https://fcm.googleapis.com/fcm/send/new',publicKey,auth])).toMatch(/PUSH_FORBIDDEN/);
});
it("queues real DMs transactionally for multiple devices, suppresses duplicates, and rechecks membership and blocks",async()=>{
 await register(cDevice);const id=await dm();const jobs=await claim();expect(jobs).toHaveLength(2);
 const job=await prepare(jobs[0]);expect(job).toMatchObject({kind:"dm",userId:bob,body:"Private message",href:`/tambayan/dm/${conversation}?message=${id}`,attempt:1});
 expect(await rows(db,"select * from public.claim_push_jobs(20)")).toEqual([]);
 await db.query("select private_push.enqueue($1,$2,'dm',$3,$4)",[bob,alice,id,`dm:${id}`]);expect(await rows(db,"select id from private_push.outbox")).toHaveLength(1);
 await db.query("insert into public.user_blocks(blocker_id,blocked_id) values($1,$2)",[bob,alice]);expect(await prepare(jobs[0])).toBeNull();
 await db.exec("delete from public.user_blocks");await db.query("delete from public.dm_participants where conversation_id=$1 and user_id=$2",[conversation,bob]);expect(await prepare(jobs[1])).toBeNull();
 await db.query("insert into public.dm_participants(conversation_id,user_id) values($1,$2)",[conversation,bob]);
});
it("leases retry attempts and rejects stale acknowledgements while revocation cascades device jobs",async()=>{
 await dm();const [job]=await claim();await db.query("select public.finish_push_job($1,$2,'retry',503,'provider_unavailable',30)",[job.id,job.lease]);
 expect(await rows(db,"select * from public.claim_push_jobs(20)")).toEqual([]);
 await db.exec("update private_push.deliveries set next_attempt_at=now()-interval '1 second'");const [retry]=await claim();expect(retry.lease).not.toBe(job.lease);expect((await prepare(retry))?.attempt).toBe(2);
 await db.query("select public.finish_push_job($1,$2,'sent',201,'ok')",[job.id,job.lease]);expect(await one(db,"select status from private_push.deliveries")).toEqual({status:"sending"});
 await db.query("select public.finish_push_job($1,$2,'sent',201,'ok')",[retry.id,retry.lease]);expect(await one(db,"select status,attempts from private_push.deliveries")).toEqual({status:"sent",attempts:2});
 expect(await rows(db,"select code from private_push.attempts")).toHaveLength(2);
 await db.exec("delete from auth.sessions where id in(select session_id from private_push.subscriptions)");expect(await rows(db,"select id from private_push.subscriptions")).toEqual([]);expect(await one(db,"select subscription_id from private_push.deliveries")).toEqual({subscription_id:null});expect(await prepare(retry)).toBeNull();
});
it("keeps restricted channel mentions private and reconciles access changes before delivery",async()=>{
 await asUser(db,alice);const secret=(await one<{id:string}>(db,"insert into public.channels(server_id,name,type,is_private) values($1,'staff-push','text',true) returning id",[server])).id;
 await db.query("insert into public.messages(channel_id,author_id,content) values($1,$2,'@push_bob secret')",[secret,alice]);expect(await claim()).toEqual([]);
 await asUser(db,alice);await db.query("insert into public.channel_access(channel_id,server_id,user_id) values($1,$2,$3)",[secret,server,bob]);
 await db.query("insert into public.messages(channel_id,author_id,content) values($1,$2,'@push_bob allowed')",[secret,alice]);const jobs=await claim();expect(jobs).toHaveLength(1);expect(await prepare(jobs[0])).toMatchObject({kind:"mention",channelId:secret});
 await db.query("delete from public.channel_access where channel_id=$1",[secret]);expect(await prepare(jobs[0])).toBeNull();
});
it("notifies an authorized role once when the same message also replies and mentions a username",async()=>{
 await asUser(db,alice);const role=(await one<{id:string}>(db,"insert into public.server_roles(server_id,name) values($1,'Study team') returning id",[server])).id;
 await db.query("insert into public.member_roles(server_id,user_id,role_id) values($1,$2,$3)",[server,bob,role]);
 await asUser(db,bob);const root=(await one<{id:string}>(db,"insert into public.messages(channel_id,author_id,content) values($1,$2,'Root') returning id",[channel,bob])).id;
 await asUser(db,alice);await db.query("insert into public.messages(channel_id,author_id,content,reply_to_id) values($1,$2,'@{Study team} @push_bob reply',$3)",[channel,alice,root]);
 expect(await claim()).toHaveLength(1);
});
it("queues invitations, friend requests, calls and moderation notices from trusted source events",async()=>{
 await dm("Join our community",server);let jobs=await claim();expect(await prepare(jobs[0])).toMatchObject({kind:"invitation"});
 await asUser(db,alice);await db.query("select public.ring_call('dm',$1)",[conversation]);jobs=await claim();expect(await prepare(jobs[0])).toMatchObject({kind:"call"});
 await asService(db);await db.query("insert into public.member_warnings(server_id,user_id,moderator_id,reason) values($1,$2,$3,'Test moderation')",[server,bob,alice]);jobs=await claim();expect(await prepare(jobs[0])).toMatchObject({kind:"moderation"});
 await db.query("delete from public.friendships where requested_by=$1",[alice]);await asUser(db,alice);await db.query("select public.send_friend_request('push_bob')");jobs=await claim();expect(await prepare(jobs[0])).toMatchObject({kind:"friend"});
 await asService(db);await db.query("update public.friendships set status='accepted' where requested_by=$1",[alice]);
});
it("generates RSVP reminders once, excludes withdrawn interest, and limits test pushes to one's own device",async()=>{
 await asUser(db,alice);const event=(await one<{id:string}>(db,"insert into public.server_events(server_id,name,starts_at) values($1,'Study soon',now()+interval '10 minutes') returning id",[server])).id;
 await asUser(db,bob);await db.query("insert into public.event_rsvps(event_id,server_id) values($1,$2)",[event,server]);
 await asService(db);await db.exec("select public.tick_push(); select public.tick_push()");const jobs=await claim();expect(jobs).toHaveLength(1);expect(await prepare(jobs[0])).toMatchObject({kind:"event"});
 await db.query("delete from public.event_rsvps where event_id=$1",[event]);expect(await prepare(jobs[0])).toBeNull();
 await asUser(db,bob);await db.query("select public.request_push_test($1)",[bDevice]);expect(await failure(db,"select public.request_push_test($1)",[bDevice])).toMatch(/PUSH_RATE_LIMIT/);
 await session(eve);expect(await failure(db,"select public.request_push_test($1)",[bDevice])).toMatch(/PUSH_FORBIDDEN/);
});
it("delivers group DMs to each subscribed participant and stops when that participant leaves",async()=>{
 await session(eve);await register(cDevice);await asService(db);
 const group=(await one<{id:string}>(db,"insert into public.dm_conversations(kind,name,owner_id) values('group','Study crew',$1) returning id",[alice])).id;
 for(const user of [alice,bob,eve])await db.query("insert into public.dm_participants(conversation_id,user_id) values($1,$2)",[group,user]);
 await asUser(db,alice);await db.query("insert into public.direct_messages(conversation_id,author_id,content) values($1,$2,'Group update')",[group,alice]);
 const jobs=await claim();expect(jobs).toHaveLength(2);const payloads=await Promise.all(jobs.map(prepare));expect(new Set(payloads.map((p)=>p?.userId))).toEqual(new Set([bob,eve]));
 await db.query("delete from public.dm_participants where conversation_id=$1 and user_id=$2",[group,eve]);
 expect(await prepare(jobs[payloads.findIndex((p)=>p?.userId===eve)])).toBeNull();
});
