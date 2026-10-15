import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MeProvider } from "@/components/providers/MeProvider";
import { PresenceProvider } from "@/components/providers/PresenceProvider";
import { VoiceActivityPreviewProvider, VoicePreviewTrigger, useVoiceActivityPreview } from "@/components/shell/VoiceActivityPreview";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { makeProfile, OWNER_ID, server, SERVER_ID, presenceFor } from "../fixtures/server";
const fake=createFakeSupabase();
vi.mock("@/components/providers/RuntimeConfig",()=>({useSupabase:()=>fake.client}));
const channel="20000000-0000-4000-8000-000000000003", peer="00000000-0000-4000-8000-00000000000b";
const response=()=>({channels:[{id:channel,name:"Tambayan 1",count:13,participants:[{id:peer,profile:makeProfile(peer,"Maria"),muted:false,screen:true}],streamers:[{id:peer,name:"Maria"}]}],limited:false});
const request=vi.fn(async(input: RequestInfo | URL)=>{ void input; return Response.json(response()); });
function Trigger({name=server.name,id=SERVER_ID}:{name?:string;id?:string}){
 const control=useVoiceActivityPreview();
 return <><VoicePreviewTrigger server={{...server,name,id}}>{(props)=><a href={`/tambayan/${id}`} {...props}>{name}</a>}</VoicePreviewTrigger><button onClick={(e)=>control.show({...server,name,id},e.currentTarget,true)}>Preview {name}</button></>;
}
function View(){return <MeProvider profile={makeProfile(OWNER_ID,"Me")}><PresenceProvider><VoiceActivityPreviewProvider><Trigger/><Trigger name="Other server" id="10000000-0000-4000-8000-000000000002"/></VoiceActivityPreviewProvider></PresenceProvider></MeProvider>;}
beforeEach(()=>{vi.stubGlobal("fetch",request);request.mockReset();request.mockImplementation(async()=>Response.json(response()));vi.spyOn(window,"matchMedia").mockImplementation((query)=>({matches:query.includes("hover: hover"),media:query,addEventListener(){},removeEventListener(){}} as unknown as MediaQueryList));});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it("opens on hover, retains pointer travel, renders real snapshot counts and profiles, then cleans up",async()=>{
 const view=render(<View/>);const icon=screen.getByRole("link",{name:server.name});
 fireEvent.pointerEnter(icon,{pointerType:"mouse"});
 const dialog=await screen.findByRole("dialog",{name:`Voice activity in ${server.name}`});
 fireEvent.pointerLeave(icon,{pointerType:"mouse"});fireEvent.pointerEnter(dialog,{pointerType:"mouse"});
 expect(await screen.findByLabelText("13 connected participants")).toBeInTheDocument();
 expect(screen.getByLabelText("12 more participants")).toHaveTextContent("+12");
 expect(screen.getByText("Streaming: Maria")).toBeInTheDocument();
 expect(screen.getByRole("link",{name:/Tambayan 1/})).toHaveAttribute("href",`/tambayan/${SERVER_ID}/${channel}`);
 await userEvent.setup().click(screen.getByRole("button",{name:"View Maria's profile"}));
 expect(await screen.findByTestId("profile-card")).toHaveTextContent("@maria");
 fireEvent.keyDown(document,{key:"Escape"});
 await waitFor(()=>expect(screen.queryByTestId("profile-card")).toBeNull());
 expect(screen.getByRole("dialog",{name:`Voice activity in ${server.name}`})).toBeInTheDocument();
 fireEvent.keyDown(document,{key:"Escape"});
 await waitFor(()=>expect(screen.queryByRole("dialog",{name:`Voice activity in ${server.name}`})).toBeNull());
 await waitFor(()=>expect(fake.client.removeChannel).toHaveBeenCalled());
 view.unmount();
});
it("keyboard opening never navigates or joins and Escape restores the trigger",async()=>{
 render(<View/>);const link=screen.getByRole("link",{name:server.name});link.focus();fireEvent.keyDown(link,{key:"ArrowRight"});
 expect(await screen.findByLabelText("13 connected participants")).toBeInTheDocument();
 fireEvent.keyDown(document,{key:"Escape"});await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());expect(link).toHaveFocus();
 expect(request.mock.calls.every((args)=>!String(args[0]).includes("/token"))).toBe(true);
});
it("switches quickly, reuses presence and reconciles authoritative joins and leaves",async()=>{
 render(<View/>);await userEvent.setup().click(screen.getByRole("button",{name:`Preview ${server.name}`}));
 expect(await screen.findByLabelText("13 connected participants")).toBeInTheDocument();
 await waitFor(()=>expect(fake.joined(`server:${SERVER_ID}`)).toBeDefined());
 const active=fake.channels.filter((channel)=>channel.name===`server:${SERVER_ID}`&&channel.subscribed&&!channel.removing);
 expect(active).toHaveLength(1);
 act(()=>{fake.syncPresence(`server:${SERVER_ID}`,{[peer]:[presenceFor(peer,{voice_channel_id:channel,screen:true})]});fake.emitBroadcast(`server:${SERVER_ID}`,"speaking",{user_id:peer,speaking:true});});
 expect(await screen.findByLabelText("Speaking")).toBeInTheDocument();
 request.mockImplementation(async()=>Response.json({channels:[],limited:false}));
 act(()=>fake.syncPresence(`server:${SERVER_ID}`,{}));
 expect(await screen.findByText(/No active voice channels/,{},{timeout:3000})).toBeInTheDocument();
 await userEvent.setup().click(screen.getByRole("button",{name:"Preview Other server"}));
 expect(await screen.findByRole("dialog",{name:"Voice activity in Other server"})).toBeInTheDocument();
 expect(screen.queryByRole("dialog",{name:`Voice activity in ${server.name}`})).toBeNull();
});
it("uses a safe-area sheet for touch and reports failures without stale participants",async()=>{
 vi.mocked(window.matchMedia).mockImplementation((query)=>({matches:query.includes("hover: none"),media:query,addEventListener(){},removeEventListener(){}} as unknown as MediaQueryList));
 request.mockImplementation(async()=>new Response(null,{status:403}));
 render(<View/>);await userEvent.setup().click(screen.getByRole("button",{name:`Preview ${server.name}`}));
 expect(await screen.findByRole("alert")).toHaveTextContent("Access to this server changed");
 expect(screen.getByRole("dialog")).toHaveClass("bottom-0");expect(screen.queryByLabelText("13 connected participants")).toBeNull();
});
