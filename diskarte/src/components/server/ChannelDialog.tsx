"use client";

import { useRouter } from "next/navigation";
import { Hash, Trash2, Volume2 } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { createChannelAction, deleteChannelAction, updateChannelAction } from "@/actions/servers";
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
  const { server, channels, removeChannel } = useServer();
  const router = useRouter();
  const editing = Boolean(channel);
  const [type, setType] = useState<ChannelType>(channel?.type ?? defaultType);
  const [name, setName] = useState(channel?.name ?? "");
  const [slowmode, setSlowmode] = useState(channel?.slowmode_seconds ?? 0);
  const [verifiedOnly, setVerifiedOnly] = useState(channel?.requires_verification ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const categories = Array.from(new Set(channels.map((c) => c.category)));
  const fallbackCategory = defaultCategory ?? (type === "voice" ? "Voice Channels" : "Text Channels");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name,
      type,
      category: String(form.get("category") ?? ""),
      topic: String(form.get("topic") ?? ""),
      slowmodeSeconds: type === "text" ? slowmode : 0,
      requiresVerification: type === "text" && verifiedOnly,
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
      toast.success(channel ? "Channel updated." : "Channel created!");
      onClose();
      if (!channel && result.data && "channelId" in result.data) router.push(`/tambayan/${server.id}/${result.data.channelId}`);
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
              onClick={() => setType(value)}
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
        hint={type === "text" && name ? `Magiging #${slugifyChannelName(name) || "…"}` : undefined}
        placeholder={type === "text" ? "ranked-grind" : "Tambayan 2"}
      />
      <div className="space-y-1.5">
        <InputField
          label="Category"
          name="category"
          list="channel-categories"
          defaultValue={channel?.category ?? fallbackCategory}
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
