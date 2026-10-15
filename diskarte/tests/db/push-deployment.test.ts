// @vitest-environment node
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect,it } from "vitest";
import { asService,asUser,createDb,failure,one,signUp } from "./harness";
const setup=readFileSync(new URL("../../docs/sql/enable-web-push.sql",import.meta.url),"utf8").replace(/^create extension.*$/gm,"");
it("validates network setup, coalesces transactional wakes, tolerates failed wakes and disables dispatch without deleting data",async()=>{
 const db=await createDb();
 // pg_net, pg_cron and Vault belong to Supabase; stub their interfaces, execute the actual installer.
 await db.exec(`create schema net; create schema cron; create schema vault;
 create table vault.decrypted_secrets(name text primary key,decrypted_secret text);
 create table net.requests(id bigint generated always as identity primary key,url text);
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$ declare result bigint; begin insert into net.requests(url) values(url) returning id into result; return result; end $$;
 create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;`);
 const url="https://diskarte-ten.vercel.app/api/push/dispatch",secret="test-only-".repeat(5);
 for(const [target,token,invalid] of [[null,null,"url"],[url.replace("https:","http:"),secret,"url"],[`${url}/`,secret,"url"],[url,null,"secret"],[url,"too-short","secret"]] as const){
  await db.exec("delete from vault.decrypted_secrets");
  if(target!==null)await db.query("insert into vault.decrypted_secrets values('diskarte_push_url',$1)",[target]);
  if(token!==null)await db.query("insert into vault.decrypted_secrets values('diskarte_push_secret',$1)",[token]);
  await expect(db.exec(setup)).rejects.toMatchObject({message:"PUSH_WAKE_NOT_CONFIGURED",detail:expect.stringContaining(`Vault secret diskarte_push_${invalid}`),hint:expect.stringContaining("Supabase Vault")});
  await db.exec("rollback");
  expect(await one(db,"select enabled from private_push.configuration where singleton")).toEqual({enabled:false});
 }
 await db.exec("delete from vault.decrypted_secrets");
 await db.query("insert into vault.decrypted_secrets values('diskarte_push_url',$1),('diskarte_push_secret',$2)",[url,secret]);
 await db.exec(setup);expect(await one(db,"select count(*)::int as count from net.requests")).toEqual({count:0});
 const user=await signUp(db,"push-installer@example.test",{username:"push_installer"});await asService(db);
 const session=(await one<{id:string}>(db,"insert into auth.sessions(user_id) values($1) returning id",[user])).id;
 await db.query("insert into private_push.subscriptions(user_id,session_id,device_id,endpoint,p256dh,auth_key,label) values($1,$2,$3,'https://fcm.googleapis.com/fcm/send/install','key','auth','Test')",[user,session,randomUUID()]);
 await db.exec("begin");
 for(let i=0;i<2;i++)await db.query("insert into private_push.outbox(user_id,kind,source_id,dedupe_key,expires_at) values($1,'test',$2,$3,now()+interval '1 hour')",[user,randomUUID(),`install:${i}`]);
 await db.exec("commit");expect(await one(db,"select count(*)::int as count from net.requests")).toEqual({count:1});
 expect(await one(db,"select url from net.requests")).toEqual({url});
 await db.exec("delete from vault.decrypted_secrets");
 await db.query("insert into private_push.outbox(user_id,kind,source_id,dedupe_key,expires_at) values($1,'test',$2,'wake-failure',now()+interval '1 hour')",[user,randomUUID()]);
 expect(await one(db,"select count(*)::int as count from private_push.outbox")).toEqual({count:3});
 await db.exec("update private_push.configuration set enabled=false");expect(await one(db,"select count(*)::int as count from public.claim_push_jobs(20)")).toEqual({count:0});
 await asUser(db,user);expect(await failure(db,"select private_push.wake()")).toMatch(/permission denied/);expect(await one(db,"select public.push_ready() as ready")).toEqual({ready:false});
 await db.close();
});
