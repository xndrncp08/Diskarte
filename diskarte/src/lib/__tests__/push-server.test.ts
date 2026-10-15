// @vitest-environment node
import { createDecipheriv,createECDH,hkdfSync,randomBytes,randomUUID } from "node:crypto";
import webpush from "web-push";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { allowPush,safePushPath,validPushEndpoint } from "../push-policy";
import { DEFAULT_PUSH_PREFS } from "../notify-prefs";
import { authorizedPushJob,dispatchPush,pushConfig,pushFailure,pushPayload,type PushJob } from "../push-server";
const keys=webpush.generateVAPIDKeys(),peer=createECDH("prime256v1");peer.generateKeys();const auth=randomBytes(16);
const prefs={push:{...DEFAULT_PUSH_PREFS,enabled:true},servers:{},dms:true};
const event:PushJob={id:randomUUID(),userId:randomUUID(),kind:"dm",serverId:null,channelId:null,prefs,title:"Private sender",body:"Private message",href:`/tambayan/dm/${randomUUID()}`,tag:"dm:conversation",timestamp:Date.now(),expiresAt:new Date(Date.now()+3600000).toISOString(),attempt:1,subscription:{endpoint:"https://fcm.googleapis.com/fcm/send/valid",keys:{p256dh:peer.getPublicKey().toString("base64url"),auth:auth.toString("base64url")}}};
beforeEach(()=>{vi.stubEnv("VAPID_PUBLIC_KEY",keys.publicKey);vi.stubEnv("VAPID_PRIVATE_KEY",keys.privateKey);vi.stubEnv("VAPID_SUBJECT","mailto:ops@example.test");vi.stubEnv("PUSH_DISPATCH_SECRET","x".repeat(43));vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","server-only-test-key");});
afterEach(()=>vi.unstubAllEnvs());
it("validates complete VAPID configuration, constant-time machine auth and vendor endpoints",()=>{
 expect(pushConfig()?.publicKey).toBe(keys.publicKey);expect(authorizedPushJob(`Bearer ${"x".repeat(43)}`,"x".repeat(43))).toBe(true);expect(authorizedPushJob("Bearer wrong","x".repeat(43))).toBe(false);
 vi.stubEnv("VAPID_PRIVATE_KEY",webpush.generateVAPIDKeys().privateKey);expect(pushConfig()).toBeNull();
 for(const url of ["https://localhost/x","https://169.254.169.254/metadata","https://fcm.googleapis.com.evil.test/x","http://fcm.googleapis.com/x","https://fcm.googleapis.com:123/x","https://user:pass@fcm.googleapis.com/x"])expect(validPushEndpoint(url)).toBe(false);
 for(const url of ["https://web.push.apple.com/Q/test","https://updates.push.services.mozilla.com/wpush/v2/test",event.subscription.endpoint])expect(validPushEndpoint(url)).toBe(true);
 for(const path of ["https://evil.test/","//evil.test/","/\\evil.test/","/admin"])expect(safePushPath(path)).toBe("/tambayan");
});
it("enforces synchronized preferences, timezone-aware quiet hours, DND, channel and server mutes",()=>{
 expect(allowPush({},"dm",null,null)).toBe(false);expect(allowPush(prefs,"dm",null,null)).toBe(true);expect(allowPush({...prefs,dms:false},"dm",null,null)).toBe(false);
 expect(allowPush({...prefs,push:{...prefs.push,events:{...prefs.push.events,friend:false}}},"friend",null,null)).toBe(false);
 const quiet={...prefs,push:{...prefs.push,timeZone:"Asia/Manila"},quietHours:{enabled:true,start:1320,end:480}};
 expect(allowPush(quiet,"mention",null,null,new Date("2026-10-15T14:00:00Z"))).toBe(false);expect(allowPush(quiet,"mention",null,null,new Date("2026-10-16T00:00:00Z"))).toBe(true);
 expect(allowPush({...prefs,doNotDisturbUntil:Date.now()+10000},"call",null,null)).toBe(false);
 expect(allowPush({...prefs,servers:{s:{muted:true}}},"mention","s",null)).toBe(false);expect(allowPush({...prefs,servers:{s:{level:"nothing"}}},"event","s",null)).toBe(false);
 expect(allowPush({...prefs,channels:{c:{muted:true}}},"reply",null,"c")).toBe(false);expect(allowPush({...prefs,channels:{c:{muted:true,muteUntil:1}}},"reply",null,"c")).toBe(true);
 expect(pushPayload(event)).toMatchObject({title:"Diskarte",body:"You have new activity. Open Diskarte to view it."});
 expect(JSON.stringify(pushPayload(event))).not.toContain("Private");expect(pushPayload({...event,prefs:{...prefs,push:{...prefs.push,previews:true}}})).toMatchObject({title:"Private sender",body:"Private message"});
});
it("encrypts a genuine aes128gcm Web Push request with VAPID, decryptable only by the device key",()=>{
 const payload=JSON.stringify(pushPayload(event));
 const request=webpush.generateRequestDetails(event.subscription,payload,{vapidDetails:{subject:"mailto:ops@example.test",publicKey:keys.publicKey,privateKey:keys.privateKey},contentEncoding:"aes128gcm",TTL:120});
 expect(request.headers.Authorization).toMatch(/^vapid t=/);expect(request.headers["Content-Encoding"]).toBe("aes128gcm");
 const encoded=request.body!;expect(encoded).toBeInstanceOf(Buffer);const body=Buffer.from(encoded),salt=body.subarray(0,16),length=body[20],sender=body.subarray(21,21+length),cipher=body.subarray(21+length);
 const ikm=Buffer.from(hkdfSync("sha256",peer.computeSecret(sender),auth,Buffer.concat([Buffer.from("WebPush: info\0"),peer.getPublicKey(),sender]),32));
 const aes=Buffer.from(hkdfSync("sha256",ikm,salt,Buffer.from("Content-Encoding: aes128gcm\0"),16)),nonce=Buffer.from(hkdfSync("sha256",ikm,salt,Buffer.from("Content-Encoding: nonce\0"),12));
 const decipher=createDecipheriv("aes-128-gcm",aes,nonce);decipher.setAuthTag(cipher.subarray(-16));const clear=Buffer.concat([decipher.update(cipher.subarray(0,-16)),decipher.final()]);
 expect(clear[clear.length-1]).toBe(2);expect(clear.subarray(0,-1).toString()).toBe(payload);expect(body.toString()).not.toContain("Diskarte");
});
function database(job:unknown=event){const ack:Record<string,unknown>[]=[];return {ack,client:{rpc:vi.fn(async(name:string,args:Record<string,unknown>)=>{if(name==="claim_push_jobs")return{data:[{id:event.id,lease:"lease"}],error:null};if(name==="prepare_push_job")return{data:job,error:null};if(name==="finish_push_job")ack.push(args);return{data:null,error:null};})}};}
it("dispatches prepared messages only, skips revoked or muted events and removes expired endpoints",async()=>{
 const db=database();const send=vi.fn(async()=>({statusCode:201,body:"",headers:{}}));expect(await dispatchPush(db.client as never,send)).toMatchObject({sent:1});expect(db.ack[0]).toMatchObject({p_result:"sent"});expect(send).toHaveBeenCalledOnce();
 for(const job of [null,{...event,prefs:{}}]){const suppressed=database(job);send.mockClear();await dispatchPush(suppressed.client as never,send);expect(send).not.toHaveBeenCalled();expect(suppressed.ack[0]).toMatchObject({p_result:"skipped"});}
 const expired=database();await dispatchPush(expired.client as never,vi.fn(async()=>{throw {statusCode:410};}));expect(expired.ack[0]).toMatchObject({p_result:"expired",p_status:410});
});
it("backs off transient failures and honors provider Retry-After without persisting error bodies",()=>{
 const first=pushFailure({statusCode:503,body:"private secret"},1),later=pushFailure({statusCode:503},5);expect(later.delay).toBeGreaterThan(first.delay);
 expect(pushFailure({statusCode:429,headers:{"retry-after":"300"}})).toMatchObject({result:"retry",delay:300});expect(pushFailure({statusCode:400})).toMatchObject({result:"failed"});expect(JSON.stringify(first)).not.toContain("private");
});
