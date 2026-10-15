"use client";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { BellOff, HeadphoneOff, MicOff, MonitorUp, Volume2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useServerPresence, useServerSpeaking } from "@/components/providers/PresenceProvider";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { Button } from "@/components/ui/Button";
import { FloatingPortal, useFloating } from "@/components/ui/floating";
import { InertWhenExiting } from "@/components/ui/InertWhenExiting";
import { Modal } from "@/components/ui/Modal";
import { Popover } from "@/components/ui/Popover";
import { Tooltip } from "@/components/ui/Tooltip";
import { useVoicePreview } from "@/hooks/useVoicePreview";
import { readNotifyPrefs, serverNotify, subscribeNotifyPrefs, DEFAULT_NOTIFY_PREFS } from "@/lib/notify-prefs";
import { useSyncExternalStore } from "react";
import type { Server } from "@/lib/servers";
import { ServerIcon } from "./ServerIcon";

type Target = { server: Server; anchor: HTMLElement; sheet: boolean; keyboard: boolean };
type Controller = { show(server: Server, anchor: HTMLElement, keyboard?: boolean): void; close(): void; delay(): void; hold(): void; id: string; serverId?: string };
const Context = createContext<Controller | null>(null);
export function useVoiceActivityPreview() { return useContext(Context)!; }
export function VoiceActivityPreviewProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const hold = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; }, []);
  const close = useCallback(() => { hold(); setTarget(null); }, [hold]);
  const delay = useCallback(() => { hold(); timer.current = setTimeout(close, 220); }, [close, hold]);
  const show = useCallback((server: Server, anchor: HTMLElement, keyboard = false) => {
    hold(); const next = { server, anchor, keyboard, sheet: matchMedia("(hover: none), (max-width: 767px)").matches };
    setTarget(next);
  }, [hold]);
  useEffect(() => () => hold(), [hold]);
  useEffect(() => {
    if (!target) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector('[data-floating="voice-profile"]:not([inert])')) { event.stopPropagation(); close(); (target.anchor.matches("a,button") ? target.anchor : target.anchor.querySelector<HTMLElement>("a,button"))?.focus(); } };
    const down = (event: PointerEvent) => { if (!(event.target as Element).closest(`[data-voice-preview], [data-floating="voice-profile"]`) && !target.anchor.contains(event.target as Node)) close(); };
    const lost = () => { if (document.visibilityState === "hidden") close(); };
    document.addEventListener("keydown", key); document.addEventListener("pointerdown", down); document.addEventListener("visibilitychange", lost);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", down); document.removeEventListener("visibilitychange", lost); };
  }, [target, close]);
  return <Context.Provider value={{ show, close, delay, hold, id, serverId: target?.server.id }}>
    {children}
    {target?.sheet ? <Modal open title={`Voice activity in ${target.server.name}`} onClose={close} className="absolute inset-x-0 bottom-0 max-w-none rounded-b-none pb-[max(1.5rem,env(safe-area-inset-bottom))]"><div data-voice-preview><PreviewContent key={target.server.id} server={target.server} onOpen={close} /></div></Modal> : <FloatingPortal><AnimatePresence>{target && <DesktopPreview key={target.server.id} target={target} id={id} close={close} hold={hold} delay={delay} />}</AnimatePresence></FloatingPortal>}
  </Context.Provider>;
}

/** The existing server context menu supplies the touch long-press entry; keyboard uses Right Arrow. */
export function VoicePreviewTrigger({ server, children }: { server: Server; children: (props: { "aria-haspopup": "dialog"; "aria-expanded": boolean; "aria-controls"?: string; "aria-description": string }) => ReactNode }) {
  const control = useVoiceActivityPreview();
  const anchor = useRef<HTMLSpanElement>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <span ref={anchor} className="inline-flex" onPointerEnter={(event) => {
    if (event.pointerType !== "mouse" || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    cancel(); control.hold(); const element = anchor.current; timer.current = setTimeout(() => { if (element) control.show(server, element); }, 280);
  }} onPointerLeave={() => { cancel(); control.delay(); }} onFocus={() => { control.hold(); }} onBlur={(event) => { if (!event.relatedTarget?.closest?.('[data-voice-preview], [data-floating="voice-profile"]')) control.delay(); }} onKeyDown={(event) => {
    if (event.key === "ArrowRight" && anchor.current) { event.preventDefault(); cancel(); control.show(server, anchor.current, true); }
    if (event.key === "Escape") { cancel(); control.close(); }
  }}>
    {children({ "aria-haspopup": "dialog", "aria-expanded": control.serverId === server.id, "aria-controls": control.serverId === server.id ? control.id : undefined, "aria-description": "Press Right Arrow for live voice activity. Long-press for server options on touch screens." })}
  </span>;
}
function DesktopPreview({ target, id, close, hold, delay }: { target: Target; id: string; close(): void; hold(): void; delay(): void }) {
  const anchor = useRef<HTMLElement | null>(target.anchor), panel = useRef<HTMLDivElement>(null);
  const { style } = useFloating(true, anchor, panel, { side: "right", align: "start", offset: 12 });
  useEffect(() => {
    if (!target.keyboard) return;
    const frame = requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("button,a")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return <InertWhenExiting ref={panel} id={id} role="dialog" aria-label={`Voice activity in ${target.server.name}`} data-voice-preview data-floating="voice-preview" style={style} initial={{ opacity: 0, scale: .98, x: -4 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: .98 }} transition={{ duration: .13 }} className="glass-strong z-50 w-80 overflow-y-auto rounded-2xl p-4 shadow-2xl shadow-black/35" onPointerEnter={hold} onPointerLeave={delay} onFocus={hold} onBlur={(event) => { if (!event.relatedTarget?.closest?.('[data-voice-preview], [data-floating="voice-profile"]')) delay(); }}>
    <button type="button" onClick={close} aria-label="Close voice preview" className="float-right flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10"><X className="size-4" /></button>
    <PreviewContent server={target.server} onOpen={close} />
  </InertWhenExiting>;
}
function PreviewContent({ server, onOpen }: { server: Server; onOpen(): void }) {
  const { data, problem, reconnecting, retry } = useVoicePreview(server.id);
  const presence = useServerPresence(server.id), speaking = useServerSpeaking(server.id);
  const prefs = useSyncExternalStore(subscribeNotifyPrefs, readNotifyPrefs, () => DEFAULT_NOTIFY_PREFS);
  return <div className="space-y-4">
    <header className="flex items-center gap-3 pr-5"><ServerIcon server={server} /><div className="min-w-0"><h2 className="truncate font-bold text-white">{server.name}</h2><p className="flex items-center gap-1 text-xs text-slate-400">Live voice activity {serverNotify(prefs, server.id).muted && <BellOff className="size-3.5" aria-label="Server notifications muted" />}</p></div></header>
    {problem ? <div role="alert" className="space-y-2 text-sm text-amber-200"><p>{problem}</p><Button variant="secondary" onClick={retry}>Retry voice activity</Button></div> : !data ? <p role="status" className="animate-pulse py-4 text-sm text-slate-400">Checking voice channels…</p> : <>
      {reconnecting && <div className="space-y-1 text-xs text-amber-200"><p role="status">Live updates reconnecting.</p><Button variant="secondary" onClick={retry}>Refresh voice activity</Button></div>}
      {!data.channels.length && <p className="py-4 text-sm text-slate-400">No active voice channels you can view. Tara, start a tambayan.</p>}
      <ul className="space-y-4" aria-label="Active voice channels">{data.channels.map((channel) => <li key={channel.id} className="space-y-2 rounded-xl border border-white/10 bg-white/[.03] p-3">
        <Link href={`/tambayan/${server.id}/${channel.id}`} onClick={onOpen} className="flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-white hover:text-sun"><Volume2 className="size-4 shrink-0 text-signal-green" aria-hidden /><span className="min-w-0 flex-1 truncate">{channel.name}</span><span className="text-xs tabular-nums text-slate-400" aria-label={`${channel.count} connected participants`}>{channel.count}</span></Link>
        <div className="flex flex-wrap items-center gap-1">{channel.participants.map((participant) => {
          const state = presence.get(participant.id), sameChannel = state?.voice_channel_id === channel.id;
          const talking = sameChannel && speaking.has(participant.id) && !participant.muted;
          return <Popover key={participant.id} label={`${participant.profile.display_name}'s profile`} side="right" testId="voice-profile" className="p-0" trigger={({ ref, toggle, ...props }) => { const { open, ...aria } = props; void open; return <Tooltip label={participant.profile.display_name} side="top"><button type="button" ref={ref} onClick={toggle} {...aria} aria-label={`View ${participant.profile.display_name}'s profile`} className="relative flex size-11 items-center justify-center rounded-full"><UserAvatar profile={participant.profile} size={32} speaking={talking} />{talking && <span aria-label="Speaking" className="absolute right-0 top-0 size-2 animate-pulse rounded-full bg-signal-green motion-reduce:animate-none" />}{sameChannel && state.deafened ? <HeadphoneOff className="absolute bottom-0 right-0 size-3.5 rounded bg-abyss text-slate-300" aria-label="Deafened" /> : participant.muted ? <MicOff className="absolute bottom-0 right-0 size-3.5 rounded bg-abyss text-slate-300" aria-label="Microphone muted" /> : null}{participant.screen && <MonitorUp className="absolute left-0 top-0 size-3.5 rounded bg-abyss text-signal-green" aria-label="Sharing screen" />}</button></Tooltip>; }}><ProfileCard profile={participant.profile} className="w-full" /></Popover>;
        })}{channel.count > channel.participants.length && <span className="flex size-9 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-slate-300" aria-label={`${channel.count - channel.participants.length} more participants`}>+{channel.count - channel.participants.length}</span>}</div>
        {!!channel.streamers.length && <p className="flex items-start gap-1.5 text-xs text-signal-green"><MonitorUp className="size-3.5 shrink-0" aria-hidden /><span className="break-words">Streaming: {channel.streamers.map((stream) => stream.name).join(", ")}</span></p>}
      </li>)}</ul>
      {data.limited && <p className="text-xs text-slate-400">Showing the first 30 active channels. Open the server for more.</p>}
    </>}
    <Link href={`/tambayan/${server.id}`} onClick={onOpen} className="inline-flex min-h-11 items-center text-sm font-semibold text-sun">Open Tambayan</Link>
  </div>;
}
