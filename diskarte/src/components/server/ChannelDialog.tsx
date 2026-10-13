"use client";

import { useRouter } from "next/navigation";
import { Hash, Lock, Trash2, Volume2 } from "lucide-react";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { createChannelAction, deleteChannelAction, setChannelAccessAction, updateChannelAction } from "@/actions/servers";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { SLOWMODE_OPTIONS } from "@/lib/community";
import { slugifyChannelName, type Channel } from "@/lib/servers";
import type { ChannelType } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

interface ChannelDialogProps {
  open: boolean;
  onClose: () => void;
  channel?: Channel | null;
  defaultType?: ChannelType;
  defaultCategory?: string;
}

export function ChannelDialog(props: ChannelDialogProps) {
  return (
    <Modal open={props.open} onClose={props.onClose} title={props.channel ? "Edit channel" : "Create channel"}>
      <ChannelForm {...props} />
    </Modal>
  );
}

/** Mounted fresh each time the dialog opens, so its state starts from the props. */
function ChannelForm({ onClose, channel, defaultType = "text", defaultCategory }: ChannelDialogProps) {
  const { server, channels, removeChannel, upsertChannel, myRole, members, roles } = useServer();
  const supabase = useSupabase();
  const isAdmin = myRole === "admin";
  const router = useRouter();
  const editing = Boolean(channel);
  const [type, setType] = useState<ChannelType>(channel?.type ?? defaultType);
  const [name, setName] = useState(channel?.name ?? "");
  const [slowmode, setSlowmode] = useState(channel?.slowmode_seconds ?? 0);
  const [verifiedOnly, setVerifiedOnly] = useState(channel?.requires_verification ?? false);
  const [readOnly, setReadOnly] = useState(channel?.read_only ?? false);
  const wasPrivate = channel?.is_private ?? false;
  const [isPrivate, setIsPrivate] = useState(wasPrivate);
  // Who's let in (admins always are): loaded when editing a private channel.
  const [allowedUsers, setAllowedUsers] = useState<ReadonlySet<string>>(() => new Set());
  const [allowedRoles, setAllowedRoles] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (!channel || !wasPrivate || !isAdmin) return;
    void supabase
      .from("channel_access")
      .select("user_id, role_id")
      .eq("channel_id", channel.id)
      .then(({ data }) => {
        if (!data) return;
        setAllowedUsers(new Set(data.flatMap((a) => a.user_id ?? [])));
        setAllowedRoles(new Set(data.flatMap((a) => a.role_id ?? [])));
      });
  }, [supabase, channel, wasPrivate, isAdmin]);
  const toggle = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const categories = Array.from(new Set(channels.map((c) => c.category)));
  // New channels go where that kind already lives (HQ keeps everything under "Diskarte HQ"); the field
  // follows the Text/Voice choice until you type your own category.
  const categoryFor = (kind: ChannelType) => defaultCategory ?? channels.findLast((c) => c.type === kind)?.category ?? (kind === "voice" ? "Voice Channels" : "Text Channels");
  const [category, setCategory] = useState(() => channel?.category ?? categoryFor(type));
  const [categoryEdited, setCategoryEdited] = useState(editing);
  function chooseType(kind: ChannelType) {
    setType(kind);
    if (!categoryEdited) setCategory(categoryFor(kind));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name,
      type,
      category,
      topic: String(form.get("topic") ?? ""),
      slowmodeSeconds: type === "text" ? slowmode : 0,
      requiresVerification: type === "text" && verifiedOnly,
      readOnly: type === "text" && readOnly,
      // Sent only when it changes, so editing other settings never depends on the privacy column.
      ...(isAdmin && isPrivate !== wasPrivate ? { isPrivate } : {}),
    };
    startTransition(async () => {
      const result = channel
        ? await updateChannelAction({ channelId: channel.id, ...payload })
        : await createChannelAction({ serverId: server.id, ...payload });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (result.error) toast.error(result.error);
        return;
      }
      // Show it right away; realtime brings it to everyone else.
      if (result.data?.channel) upsertChannel(result.data.channel);
      const channelId = channel?.id ?? result.data?.channel.id ?? null;
      if (isAdmin && isPrivate && channelId) {
        const access = await setChannelAccessAction({ channelId, serverId: server.id, userIds: [...allowedUsers], roleIds: [...allowedRoles] });
        if (!access.ok) toast.error(access.error ?? "Saved, but couldn't update who's in the channel.");
      }
      toast.success(channel ? "Channel updated." : "Channel created!");
      onClose();
      if (!channel && channelId) router.push(`/tambayan/${server.id}/${channelId}`);
    });
  }

  function remove() {
    if (!channel) return;
    startTransition(async () => {
      const result = await deleteChannelAction({ channelId: channel.id });
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't delete.");
        return;
      }
      removeChannel(channel.id);
      toast.success(`Deleted ${channel.type === "text" ? "#" : ""}${channel.name}.`);
      onClose();
      router.push(`/tambayan/${server.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {!editing && (
        <div role="radiogroup" aria-label="Channel type" className="grid gap-2">
          {(
            [
              ["text", Hash, "Text", "Messages, memes, links at code"],
              ["voice", Volume2, "Voice", "Usap, video at screen share"],
            ] as const
          ).map(([value, Icon, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={type === value}
              onClick={() => chooseType(value)}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                type === value ? "border-sun/60 bg-sun/10" : "border-white/10 bg-white/5 hover:bg-white/10",
              )}
            >
              <Icon className="size-5 text-slate-300" aria-hidden />
              <span>
                <span className="block text-sm font-semibold text-white">{label}</span>
                <span className="block text-xs text-slate-400">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <InputField
        label="Channel name"
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={32}
        required
        data-autofocus
        error={errors.name}
        hint={type === "text" && name ? `Will be #${slugifyChannelName(name) || "…"}` : undefined}
        placeholder={type === "text" ? "ranked-grind" : "Tambayan 2"}
      />
      <div className="space-y-1.5">
        <InputField
          label="Category"
          name="category"
          list="channel-categories"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setCategoryEdited(true);
          }}
          maxLength={32}
          required
          error={errors.category}
        />
        <datalist id="channel-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      {type === "text" && (
        <InputField
          label="Topic (optional)"
          name="topic"
          defaultValue={channel?.topic ?? ""}
          maxLength={256}
          error={errors.topic}
          placeholder="What's this channel about?"
        />
      )}
      {type === "text" && (
        <fieldset className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <legend className="px-1 font-silk text-[11px] uppercase tracking-wider text-sun">Bantay-Bayan</legend>
          <div>
            <p id="slowmode-label" className="text-sm font-semibold text-white">
              Slow mode
            </p>
            <p className="mb-2 text-xs text-slate-400">Seconds members must wait between messages (moderators are exempt).</p>
            <div role="radiogroup" aria-labelledby="slowmode-label" className="flex flex-wrap gap-1">
              {SLOWMODE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={slowmode === o.value}
                  onClick={() => setSlowmode(o.value)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs font-semibold transition-colors pointer-coarse:px-3 pointer-coarse:py-2",
                    slowmode === o.value ? "border-sun bg-sun text-abyss" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <Switch
            checked={verifiedOnly}
            onChange={setVerifiedOnly}
            label="Verified accounts only"
            hint="Members need a confirmed email or phone number to chat here."
          />
          <Switch checked={readOnly} onChange={setReadOnly} label="Read-only (announcements)" hint="Only admins can post; everyone else can read and react." />
        </fieldset>
      )}
      {isAdmin && (
        <fieldset className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <legend className="flex items-center gap-1 px-1 font-silk text-[11px] uppercase tracking-wider text-sun">
            <Lock className="size-3" aria-hidden /> Privacy
          </legend>
          <Switch checked={isPrivate} onChange={setIsPrivate} label="Private channel" hint="Only admins and the people or roles you pick can see it." />
          {isPrivate && (
            <div className="scrollbar-thin max-h-56 space-y-3 overflow-y-auto" data-testid="channel-access">
              {roles.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-300">Roles</p>
                  {roles.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-slate-200 hover:bg-white/5">
                      <input type="checkbox" checked={allowedRoles.has(r.id)} onChange={() => setAllowedRoles((s) => toggle(s, r.id))} className="accent-sun" />
                      <span className="size-2.5 rounded-full" style={{ background: r.color }} aria-hidden />
                      {r.name}
                    </label>
                  ))}
                </div>
              )}
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-300">People</p>
                {members
                  .filter((m) => m.role !== "admin")
                  .map((m) => (
                    <label key={m.user_id} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-slate-200 hover:bg-white/5">
                      <input type="checkbox" checked={allowedUsers.has(m.user_id)} onChange={() => setAllowedUsers((s) => toggle(s, m.user_id))} className="accent-sun" />
                      {m.nickname ?? m.profile.display_name}
                      <span className="text-xs text-slate-500">@{m.profile.username}</span>
                    </label>
                  ))}
              </div>
            </div>
          )}
        </fieldset>
      )}
      <div className="flex items-center justify-between gap-2 pt-1">
        {editing ? (
          <Button variant="danger" size="sm" onClick={remove} disabled={pending}>
            <Trash2 className="size-4" aria-hidden /> Delete
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" loading={pending}>
          {editing ? "Save" : "Create"}
        </Button>
      </div>
    </form>
  );
}
