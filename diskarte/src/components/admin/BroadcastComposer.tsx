"use client";

import { Bold, Code2, Eye, Hash, Heading2, Link2, List, Megaphone, PencilLine, Pin, PinOff, Quote, Send } from "lucide-react";
import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { dispatchBroadcastAction, retractBroadcastAction } from "@/actions/admin";
import { BannerCard, TONE_ICON, TONE_STYLE } from "@/components/broadcast/BroadcastBanner";
import { MessageMarkdown } from "@/components/chat/MessageMarkdown";
import { useMe } from "@/components/providers/MeProvider";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { Button } from "@/components/ui/Button";
import { confirmAction } from "@/components/ui/ConfirmHost";
import { Switch } from "@/components/ui/Switch";
import {
  BODY_MAX,
  BROADCAST_TARGETS,
  BROADCAST_TONE_LABEL,
  BROADCAST_TONES,
  broadcastMarkdown,
  isStickyLive,
  STICKY_DURATIONS,
  TITLE_MAX,
  type AdminSnapshot,
  type BroadcastTarget,
  type BroadcastTone,
} from "@/lib/admin";
import { cn } from "@/lib/utils";
import { formatAbsolute, formatAgo } from "./format";
import { SectionLabel, Segmented, SELECT } from "./primitives";

const CALLOUT_KEYWORD: Record<BroadcastTone, string> = { info: "INFO", success: "SUCCESS", warning: "WARNING", critical: "CRITICAL" };

interface Draft {
  title: string;
  body: string;
  tone: BroadcastTone;
  targets: BroadcastTarget[];
  sticky: boolean;
  stickyHours: number | null;
}

const EMPTY: Draft = { title: "", body: "", tone: "info", targets: ["announcements"], sticky: false, stickyHours: 24 };

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/10 hover:text-white pointer-coarse:size-10">
      {children}
    </button>
  );
}

/**
 * The Global Announcement Dispatcher: compose a structured update (headers, callout boxes, code
 * blocks), preview exactly how it renders, and broadcast it to Diskarte HQ's #announcements and/or
 * #global-lounge. Every connected canvas receives it live; flag it sticky to pin a banner on all of them.
 */
export function BroadcastComposer({ snapshot, now, onChanged }: { snapshot: AdminSnapshot; now: number; onChanged: () => void }) {
  const { me } = useMe();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const body = useRef<HTMLTextAreaElement>(null);
  const ids = { title: useId(), body: useId() };
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  /** Wraps the selection (or inserts a template) in the body textarea, keeping the caret sensible. */
  const insert = (before: string, after = "", placeholder = "") => {
    const el = body.current;
    const start = el?.selectionStart ?? draft.body.length;
    const end = el?.selectionEnd ?? draft.body.length;
    const selected = draft.body.slice(start, end) || placeholder;
    const next = draft.body.slice(0, start) + before + selected + after + draft.body.slice(end);
    set("body", next.slice(0, BODY_MAX));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };
  const lineStart = (prefix: string, placeholder: string) => {
    const el = body.current;
    const start = el?.selectionStart ?? draft.body.length;
    const needsBreak = start > 0 && draft.body[start - 1] !== "\n";
    insert(`${needsBreak ? "\n" : ""}${prefix}`, "", placeholder);
  };

  const toggleTarget = (t: BroadcastTarget) =>
    set("targets", draft.targets.includes(t) ? draft.targets.filter((x) => x !== t) : BROADCAST_TARGETS.filter((x) => x === t || draft.targets.includes(x)));

  const dispatch = () => {
    const where = draft.targets.map((t) => `#${t}`).join(" and ");
    confirmAction({
      title: `Broadcast to ${where}?`,
      body: draft.sticky ? "It posts right away and pins a banner on every signed-in canvas." : "It posts right away and every connected canvas sees it live.",
      confirmLabel: "Broadcast",
      onConfirm: () =>
        new Promise<boolean>((resolve) =>
          start(async () => {
            const result = await dispatchBroadcastAction(draft);
            if (!result.ok) {
              setErrors(result.fieldErrors ?? {});
              toast.error(result.error ?? "The broadcast didn't go out.");
              resolve(false);
              return;
            }
            toast.success(`Broadcast sent to ${where}.`);
            setDraft(EMPTY);
            setErrors({});
            setMode("write");
            onChanged();
            resolve(true);
          }),
        ),
    });
  };

  const retract = (id: string, title: string) =>
    confirmAction({
      title: "Take the banner down?",
      body: `"${title}" stops showing on every canvas. The channel posts stay.`,
      confirmLabel: "Take down",
      onConfirm: async () => {
        const result = await retractBroadcastAction({ broadcastId: id });
        if (result.ok) {
          toast.success("Banner taken down.");
          onChanged();
        } else toast.error(result.error ?? "Couldn't take it down.");
        return result.ok;
      },
    });

  const ready = draft.title.trim() && draft.body.trim() && draft.targets.length > 0;

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      <section aria-label="Compose broadcast" className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel className="flex items-center gap-1.5">
            <Megaphone className="size-3.5" aria-hidden /> Global announcement
          </SectionLabel>
          <Segmented
            label="Composer view"
            value={mode}
            onChange={setMode}
            options={[
              { value: "write", label: "Write", icon: <PencilLine className="size-3.5" aria-hidden /> },
              { value: "preview", label: "Preview", icon: <Eye className="size-3.5" aria-hidden /> },
            ]}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor={ids.title} className="flex justify-between font-silk text-[10px] uppercase tracking-wider text-slate-400">
            Title <span className="tabular-nums text-slate-500">{draft.title.length}/{TITLE_MAX}</span>
          </label>
          <input
            id={ids.title}
            value={draft.title}
            maxLength={TITLE_MAX}
            onChange={(e) => set("title", e.target.value)}
            placeholder="v2.1 — Control Center, faster voice and more"
            aria-invalid={!!errors.title || undefined}
            className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none placeholder:font-normal placeholder:text-slate-500 focus:border-sun/70 focus:ring-2 focus:ring-sun/20"
            data-testid="broadcast-title"
          />
          {errors.title && <p className="text-xs text-red-300">{errors.title}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Tone" value={draft.tone} onChange={(t) => set("tone", t)} options={BROADCAST_TONES.map((t) => ({ value: t, label: BROADCAST_TONE_LABEL[t], icon: <span className={TONE_STYLE[t]}>{TONE_ICON[t]}</span> }))} />
        </div>

        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Channels</legend>
          {BROADCAST_TARGETS.map((t) => (
            <label
              key={t}
              className={cn(
                "flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sun/40 pointer-coarse:h-11",
                draft.targets.includes(t) ? "border-sun/40 bg-sun/10 text-sun" : "border-white/10 text-slate-400 hover:text-white",
              )}
            >
              <input type="checkbox" className="sr-only" checked={draft.targets.includes(t)} onChange={() => toggleTarget(t)} />
              <Hash className="size-3.5" aria-hidden />
              {t}
            </label>
          ))}
          {errors.targets && <p className="text-xs text-red-300">{errors.targets}</p>}
        </fieldset>

        {mode === "write" ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor={ids.body} className="font-silk text-[10px] uppercase tracking-wider text-slate-400">
                Message
              </label>
              <span className="text-[10px] tabular-nums text-slate-500">
                {draft.body.length}/{BODY_MAX}
              </span>
            </div>
            <div className="overflow-hidden rounded-lg border border-white/10 bg-black/40 focus-within:border-sun/70 focus-within:ring-2 focus-within:ring-sun/20">
              <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-white/[0.06] px-1 py-0.5">
                <ToolButton label="Heading" onClick={() => lineStart("### ", "Section")}>
                  <Heading2 className="size-3.5" aria-hidden />
                </ToolButton>
                <ToolButton label="Bold" onClick={() => insert("**", "**", "bold")}>
                  <Bold className="size-3.5" aria-hidden />
                </ToolButton>
                <ToolButton label="Bulleted list" onClick={() => lineStart("- ", "Item")}>
                  <List className="size-3.5" aria-hidden />
                </ToolButton>
                <ToolButton label="Link" onClick={() => insert("[", "](https://)", "link text")}>
                  <Link2 className="size-3.5" aria-hidden />
                </ToolButton>
                <ToolButton label="Callout box" onClick={() => lineStart(`> [!${CALLOUT_KEYWORD[draft.tone]}]\n> `, "Heads up: what everyone should know")}>
                  <Quote className="size-3.5" aria-hidden />
                </ToolButton>
                <ToolButton label="Code block" onClick={() => lineStart("```\n", "code")}>
                  <Code2 className="size-3.5" aria-hidden />
                </ToolButton>
              </div>
              <textarea
                ref={body}
                id={ids.body}
                value={draft.body}
                maxLength={BODY_MAX}
                onChange={(e) => set("body", e.target.value)}
                rows={8}
                placeholder={"### What's new\n- Super Admin Control Center\n\n> [!INFO]\n> Maintenance tonight at 23:00 PHT."}
                aria-invalid={!!errors.body || undefined}
                className="block w-full resize-y bg-transparent px-3 py-2 font-mono text-[13px] leading-relaxed text-slate-100 outline-none placeholder:text-slate-600"
                data-testid="broadcast-body"
              />
            </div>
            {errors.body && <p className="text-xs text-red-300">{errors.body}</p>}
          </div>
        ) : (
          <div className="space-y-2" data-testid="broadcast-preview">
            {draft.sticky && draft.title.trim() && <BannerCard broadcast={draft} preview />}
            <div className="flex gap-3 rounded-xl border border-white/[0.06] bg-midnight/60 p-3">
              <UserAvatar profile={me} size={36} />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-semibold text-white">{me.display_name}</span>
                  <span className="ml-2 text-xs text-slate-500">in #{draft.targets[0] ?? "announcements"}</span>
                </p>
                {draft.title.trim() || draft.body.trim() ? (
                  <MessageMarkdown content={broadcastMarkdown(draft.title || "Untitled", draft.body || " ")} />
                ) : (
                  <p className="text-sm text-slate-500">Nothing to preview yet.</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2 rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <Switch checked={draft.sticky} onChange={(v) => set("sticky", v)} label="Sticky global banner" hint="Pin it along the top of every signed-in canvas." />
          {draft.sticky && (
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Show for
              <select className={SELECT} value={String(draft.stickyHours ?? "forever")} onChange={(e) => set("stickyHours", e.target.value === "forever" ? null : Number(e.target.value))}>
                {STICKY_DURATIONS.map((d) => (
                  <option key={d.label} value={String(d.hours ?? "forever")}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={dispatch} disabled={!ready || pending} loading={pending} data-testid="broadcast-send">
            <Send className="size-4" aria-hidden /> Broadcast
          </Button>
        </div>
      </section>

      <section aria-labelledby="recent-broadcasts" className="space-y-1.5">
        <SectionLabel id="recent-broadcasts">Recent broadcasts</SectionLabel>
        {snapshot.broadcasts.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing broadcast yet.</p>
        ) : (
          <ul className="space-y-1">
            {snapshot.broadcasts.map((b) => {
              const live = isStickyLive(b, now);
              return (
                <li key={b.id} className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2" data-testid="broadcast-row">
                  <span className={cn("shrink-0", TONE_STYLE[b.tone])}>{TONE_ICON[b.tone]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{b.title}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {b.targets.map((t) => `#${t}`).join(" · ")} · <span className="tabular-nums" title={formatAbsolute(b.created_at)}>{formatAgo(b.created_at, now)}</span>
                    </span>
                  </span>
                  {live ? (
                    <Button size="sm" variant="ghost" onClick={() => retract(b.id, b.title)} aria-label={`Take down banner: ${b.title}`}>
                      <PinOff className="size-3.5" aria-hidden /> Take down
                    </Button>
                  ) : b.sticky ? (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500">
                      <Pin className="size-3" aria-hidden /> Banner ended
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
