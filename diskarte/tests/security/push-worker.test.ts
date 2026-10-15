// @vitest-environment node
import { readFileSync } from "node:fs";
import { createContext,runInContext } from "node:vm";
import { randomUUID } from "node:crypto";
import { expect,it,vi } from "vitest";
const userId=randomUUID();
function worker(){
 const handlers:Record<string,((event:unknown)=>void)[]>={};const show=vi.fn(async(title:string,options:NotificationOptions)=>{void title;void options;}),close=vi.fn();const client={url:"https://diskarte.test/tambayan",navigate:vi.fn(async()=>client),focus:vi.fn(async()=>undefined),postMessage:vi.fn()};
 const context=createContext({URL,Response,initialUser:userId,self:{location:{origin:"https://diskarte.test"},addEventListener:(type:string,handler:(event:unknown)=>void)=>{(handlers[type]??=[]).push(handler);},registration:{showNotification:show,getNotifications:async()=>[{close}]},navigator:{setAppBadge:vi.fn(),clearAppBadge:vi.fn()},clients:{matchAll:async()=>[client],openWindow:vi.fn()}}});
 runInContext(readFileSync(new URL("../../public/sw.js",import.meta.url),"utf8"),context);
 // The browser E2E separately exercises real IndexedDB across a worker-only delivery.
 runInContext("let state={userId:initialUser,seen:[],latest:{}}; pushStore=async(change)=>change?(state=change(state)):state;",context);
 const emit=async(type:string,event:Record<string,unknown>)=>{const pending:Promise<unknown>[]=[];for(const handler of handlers[type])handler({...event,waitUntil:(p:Promise<unknown>)=>pending.push(p)});await Promise.all(pending);};
 return{show,close,client,emit};
}
const payload=()=>({version:1,id:randomUUID(),userId,title:"Private sender",body:"Private body",tag:"dm:one",href:"/tambayan/dm/one",timestamp:Date.now(),badge:2});
it("shows server payloads, deduplicates persistent event IDs, replaces conversation tags and rejects malformed payloads",async()=>{
 const w=worker(),data=payload();await w.emit("push",{data:{json:()=>data}});await w.emit("push",{data:{json:()=>data}});expect(w.show).toHaveBeenCalledOnce();
 expect(w.show.mock.calls[0]).toEqual(["Private sender",expect.objectContaining({tag:"dm:one",renotify:false,data:expect.objectContaining({href:"/tambayan/dm/one"})})]);
 await w.emit("push",{data:{json:()=>({...payload(),href:"https://evil.test/"})}});expect(w.show.mock.calls[1][1]).toMatchObject({data:{href:"/tambayan"}});
 await w.emit("push",{data:{json:()=>({body:"bad"})}});expect(w.show).toHaveBeenCalledTimes(2);
});
it("clears notifications and bindings on logout and never shows a prior account's private content",async()=>{
 const w=worker();const reply=vi.fn();await w.emit("message",{data:{type:"PUSH_BIND",userId:null},ports:[{postMessage:reply}]});expect(reply).toHaveBeenCalledWith({ok:true});expect(w.close).toHaveBeenCalled();
 await w.emit("push",{data:{json:payload}});expect(w.show).toHaveBeenCalledWith("Diskarte",expect.objectContaining({body:"Open Diskarte to check for updates."}));
 expect(JSON.stringify(w.show.mock.calls)).not.toContain("Private");
});
it("opens safe same-origin notification targets and supports dismiss actions",async()=>{
 const w=worker(),close=vi.fn();await w.emit("notificationclick",{notification:{close,data:{userId,href:"/tambayan/dm/example?message=target"}},action:"open"});expect(w.client.navigate).toHaveBeenCalledWith("https://diskarte.test/tambayan/dm/example?message=target");expect(w.client.focus).toHaveBeenCalled();
 w.client.navigate.mockClear();await w.emit("notificationclick",{notification:{close,data:{href:"https://evil.test"}},action:"dismiss"});expect(w.client.navigate).not.toHaveBeenCalled();
 await w.emit("notificationclick",{notification:{close,data:{userId:randomUUID(),href:"/tambayan/private"}},action:"open"});expect(w.client.navigate).toHaveBeenCalledWith("https://diskarte.test/tambayan");
});
