// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { TrackSource } from "livekit-server-sdk";
import { createFakeSupabase } from "../../../tests/fixtures/fake-supabase";
import { SERVER_ID, channels, makeProfile, OWNER_ID } from "../../../tests/fixtures/server";
const rooms=vi.hoisted(()=>({listRooms:vi.fn(),listParticipants:vi.fn()}));
vi.mock("livekit-server-sdk",async(importOriginal)=>({...await importOriginal<typeof import("livekit-server-sdk")>(),RoomServiceClient:vi.fn(function(){return rooms;})}));
vi.mock("@/lib/env",()=>({getPublicEnv:()=>({livekitUrl:"wss://test.livekit.cloud"}),getServerEnv:()=>({livekitApiKey:"key",livekitApiSecret:"secret"})}));
const {getVoicePreview}=await import("../voice-preview-server");
const visible=channels[2], secret="20000000-0000-4000-8000-000000000099";
const tables:Record<string,unknown[]>={};const fake=createFakeSupabase(tables);
beforeEach(()=>{tables.channels=[visible];tables.members=[{server_id:SERVER_ID,user_id:OWNER_ID}];tables.profiles=[makeProfile(OWNER_ID,"Kapitan")];rooms.listRooms.mockReset().mockResolvedValue([{name:`voice:${visible.id}`,numParticipants:2},{name:`voice:${secret}`,numParticipants:1}]);rooms.listParticipants.mockReset().mockResolvedValue([{identity:OWNER_ID,tracks:[{source:TrackSource.SCREEN_SHARE,muted:false},{source:TrackSource.MICROPHONE,muted:false}]},{identity:OWNER_ID,tracks:[{source:TrackSource.SCREEN_SHARE,muted:false}]}]);});
it("queries only RLS-visible room names, deduplicates identities and derives media from LiveKit",async()=>{
 const value=await getVoicePreview(fake.client as never,SERVER_ID);
 expect(rooms.listRooms).toHaveBeenCalledWith([`voice:${visible.id}`]);
 expect(rooms.listParticipants).not.toHaveBeenCalledWith(`voice:${secret}`);
 expect(value.channels).toHaveLength(1);expect(value.channels[0]).toMatchObject({count:1,participants:[{id:OWNER_ID,screen:true,muted:true}],streamers:[{id:OWNER_ID,name:"Kapitan"}]});
});
it("removes revoked channels and ignores identities that are not current community members",async()=>{
 rooms.listParticipants.mockImplementation(async()=>{tables.channels=[];return [{identity:OWNER_ID,tracks:[]},{identity:"injected-name",tracks:[]}];});
 expect((await getVoicePreview(fake.client as never,SERVER_ID)).channels).toEqual([]);
 tables.channels=[visible];tables.members=[];rooms.listParticipants.mockResolvedValue([{identity:OWNER_ID,tracks:[]}]);
 expect((await getVoicePreview(fake.client as never,SERVER_ID)).channels).toEqual([]);
});
it("bounds avatar output while preserving counts for hundreds of connected members",async()=>{
 const ids=Array.from({length:250},(_,i)=>`00000000-0000-4000-8000-${String(i).padStart(12,"0")}`);
 tables.members=ids.map((user_id)=>({server_id:SERVER_ID,user_id}));tables.profiles=ids.map((id)=>makeProfile(id,"Member"));rooms.listParticipants.mockResolvedValue(ids.map((identity)=>({identity,tracks:[]})));
 const value=await getVoicePreview(fake.client as never,SERVER_ID);expect(value.channels[0].count).toBe(250);expect(value.channels[0].participants).toHaveLength(8);
});
it("does not discover verification-gated channels for an unverified viewer",async()=>{
 tables.channels=[{...visible,requires_verification:true}];expect((await getVoicePreview(fake.client as never,SERVER_ID,false)).channels).toEqual([]);expect(rooms.listRooms).not.toHaveBeenCalled();
});
it("reads live participants even when a just-created room's summary count still reports zero",async()=>{
 rooms.listRooms.mockResolvedValue([{name:`voice:${visible.id}`,numParticipants:0}]);
 expect((await getVoicePreview(fake.client as never,SERVER_ID)).channels[0].count).toBe(1);
});
