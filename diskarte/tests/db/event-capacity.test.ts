// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";
let db:Db, owner:string, member:string, outsider:string, server:string, event:string;
beforeAll(async()=>{
  db=await createDb(); owner=await signUp(db,"event-owner@test.ph");member=await signUp(db,"event-member@test.ph");outsider=await signUp(db,"event-other@test.ph");
  await asUser(db,owner);server=(await one<{id:string}>(db,"select public.create_server('Capacity','') id")).id;
  const invite=(await one<{invite_code:string}>(db,"select invite_code from public.servers where id=$1",[server])).invite_code;
  event=(await one<{id:string}>(db,"insert into public.server_events(server_id,name,starts_at,capacity) values($1,'Workshop',now()+interval '1 day',1) returning id",[server])).id;
  await asUser(db,member);await db.query("select public.join_server($1)",[invite]);
});
describe("bounded event RSVPs",()=>{
  it("enforces capacity atomically, handles ignored duplicates and releases cancelled RSVPs",async()=>{
    await asUser(db,member);await db.query("insert into public.event_rsvps(event_id,server_id) values($1,$2)",[event,server]);
    await db.query("insert into public.event_rsvps(event_id,server_id) values($1,$2) on conflict do nothing",[event,server]);
    expect(await one(db,"select rsvp_count from public.server_events where id=$1",[event])).toEqual({rsvp_count:1});
    await asUser(db,owner);
    expect(await failure(db,"insert into public.event_rsvps(event_id,server_id) values($1,$2)",[event,server])).toMatch(/EVENT_FULL/);
    expect(await rows(db,"select user_id from public.event_rsvps where event_id=$1",[event])).toEqual([{user_id:member}]);
    expect(await failure(db,"update public.server_events set rsvp_count=0 where id=$1",[event])).toMatch(/EVENT_COUNT_IMMUTABLE/);
    await asUser(db,member);await db.query("delete from public.event_rsvps where event_id=$1",[event]);
    await asUser(db,owner);await db.query("insert into public.event_rsvps(event_id,server_id) values($1,$2)",[event,server]);
    expect(await one(db,"select rsvp_count from public.server_events where id=$1",[event])).toEqual({rsvp_count:1});
  });
  it("returns canonical counts and only the caller's interest, respecting private channels",async()=>{
    await asUser(db,owner);
    const channel=(await one<{id:string}>(db,"insert into public.channels(server_id,name,type,is_private) values($1,'staff','voice',true) returning id",[server])).id;
    await db.query("insert into public.server_events(server_id,channel_id,name,starts_at) values($1,$2,'Staff only',now()+interval '1 day')",[server,channel]);
    expect(await rows(db,"select name,rsvp_count,interested from public.list_server_events($1)",[server])).toContainEqual({name:"Workshop",rsvp_count:1,interested:true});
    await asUser(db,member);
    expect(await rows(db,"select name,rsvp_count,interested from public.list_server_events($1)",[server])).toEqual([{name:"Workshop",rsvp_count:1,interested:false}]);
    await asUser(db,outsider);expect(await rows(db,"select * from public.list_server_events($1)",[server])).toEqual([]);
  });
  it("rejects invalid limits and limits below existing interest",async()=>{
    await asUser(db,owner);
    expect(await failure(db,"update public.server_events set capacity=0 where id=$1",[event])).toMatch(/check constraint/);
    await db.query("update public.server_events set capacity=2 where id=$1",[event]);
    await asUser(db,member);await db.query("insert into public.event_rsvps(event_id,server_id) values($1,$2)",[event,server]);
    await asUser(db,owner);
    expect(await failure(db,"update public.server_events set capacity=1 where id=$1",[event])).toMatch(/event_capacity_bound/);
    expect(await failure(db,"insert into public.server_events(server_id,name,starts_at,rsvp_count) values($1,'Fake',now()+interval '1 day',5)",[server])).toMatch(/EVENT_COUNT_IMMUTABLE/);
  });
});
