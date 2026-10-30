"use client";

import { Switch } from "@/components/ui/Switch";
import { useRouter } from "next/navigation";
import {
  Ban,
  ClipboardList,
  HeartHandshake,
  ImagePlus,
  Link,
  Palette,
  Shield,
  SlidersHorizontal,
  Smile,
  Trash2,
  Users,
  Volume2,
} from "lucide-react";
import {
  useId,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { deleteServerAction, updateServerAction } from "@/actions/servers";
import { useMe } from "@/components/providers/MeProvider";
import { useServer } from "@/components/providers/ServerProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { ServerIcon } from "@/components/shell/ServerIcon";
import { Button } from "@/components/ui/Button";
import { InputField, TextareaField } from "@/components/ui/Field";
import { FloatingWindow } from "@/components/ui/FloatingWindow";
import { hasRole, SERVER_CATEGORIES } from "@/lib/servers";
import { uploadPublicImage } from "@/lib/uploads";
import { cn } from "@/lib/utils";
import { AuditLogPanel } from "./settings/AuditLogPanel";
import { AutomodSettings } from "./settings/AutomodSettings";
import { BansPanel } from "./settings/BansPanel";
import { InvitesPanel } from "@/components/server/settings/InvitesPanel";
import { EmojiSettings } from "@/components/server/settings/EmojiSettings";
import { RolesSettings } from "./settings/RolesSettings";
import { SoundboardSettings } from "./settings/SoundboardSettings";
import { SupportSettings } from "./settings/SupportSettings";
import { ExportSettings } from "./settings/ExportSettings";

export type SettingsTab =
  | "overview"
  | "roles"
  | "automod"
  | "audit"
  | "bans"
  | "invites"
  | "emoji"
  | "soundboard"
  | "support";

const TABS: { id: SettingsTab; label: string; adminOnly: boolean }[] = [
  { id: "overview", label: "Overview", adminOnly: true },
  { id: "roles", label: "Roles", adminOnly: true },
  { id: "automod", label: "Bantay-Bayan", adminOnly: true },
  { id: "audit", label: "Audit log", adminOnly: false },
  { id: "bans", label: "Bans", adminOnly: false },
  { id: "invites", label: "Invites", adminOnly: false },
  { id: "emoji", label: "Emoji", adminOnly: true },
  { id: "soundboard", label: "Soundboard", adminOnly: true },
  { id: "support", label: "Support", adminOnly: true },
];

/**
 * Server settings in a draggable floating window (admins see every tab; moderators get the audit log
 * and bans). Non-modal, so moderators can keep an eye on chat while they work.
 */
export function ServerSettingsDialog({
  open,
  onClose,
  initialTab = "overview",
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}) {
  return (
    <FloatingWindow
      id="server-settings"
      open={open}
      onClose={onClose}
      title="Server settings"
      icon={<SlidersHorizontal aria-hidden />}
      className="h-[min(46rem,calc(100dvh-2rem))] w-[min(64rem,calc(100vw-2rem))]"
      bodyClassName="md:overflow-hidden"
    >
      <SettingsTabs
        key={initialTab}
        initialTab={initialTab}
        onClose={onClose}
      />
    </FloatingWindow>
  );
}

function SettingsTabs({
  initialTab,
  onClose,
}: {
  initialTab: SettingsTab;
  onClose: () => void;
}) {
  const { myRole, server } = useServer();
  const isAdmin = myRole === "admin";
  const tabs = TABS.filter((t) =>
    t.adminOnly ? isAdmin : hasRole(myRole, "moderator"),
  );
  const [tab, setTab] = useState<SettingsTab>(
    tabs.some((t) => t.id === initialTab)
      ? initialTab
      : (tabs[0]?.id ?? "audit"),
  );
  const baseId = useId();

  const icons = {
    overview: Palette,
    roles: Users,
    automod: Shield,
    audit: ClipboardList,
    bans: Ban,
    invites: Link,
    emoji: Smile,
    soundboard: Volume2,
    support: HeartHandshake,
  };
  const panels: Record<SettingsTab, ReactNode> = {
    overview: <ServerSettingsForm onClose={onClose} />,
    roles: <RolesSettings />,
    automod: <AutomodSettings />,
    audit: <AuditLogPanel />,
    bans: <BansPanel />,
    invites: <InvitesPanel />,
    emoji: <EmojiSettings />,
    soundboard: <SoundboardSettings />,
    support: <SupportSettings />,
  };

  return (
    <div className="admin-settings-layout">
      <div className="admin-settings-navigation">
        <div className="admin-settings-identity">
          <ServerIcon server={server} size={36} />
          <div>
            <p className="section-kicker">MANAGE YOUR TAMBAYAN</p>
            <strong>{server.name}</strong>
          </div>
        </div>
        <div
          role="tablist"
          aria-label="Settings sections"
          className="admin-settings-tabs scrollbar-thin flex gap-1 overflow-x-auto"
          onKeyDown={(e) => {
            const step = {
              ArrowRight: 1,
              ArrowDown: 1,
              ArrowLeft: -1,
              ArrowUp: -1,
            }[e.key];
            const i = tabs.findIndex((t) => t.id === tab);
            const index = step
              ? (i + step + tabs.length) % tabs.length
              : e.key === "Home"
                ? 0
                : e.key === "End"
                  ? tabs.length - 1
                  : null;
            if (index === null || !tabs.length) return;
            e.preventDefault();
            const next = tabs[index];
            setTab(next.id);
            document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
          }}
        >
          {tabs.map((t) => {
            const Icon = icons[t.id];
            return (
              <button
                key={t.id}
                id={`${baseId}-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={`${baseId}-panel`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2.5 shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors pointer-coarse:py-2.5",
                  tab === t.id
                    ? "bg-sun text-abyss"
                    : "text-slate-300 hover:bg-white/10",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div
        className="admin-settings-panel"
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${tab}`}
      >
        {panels[tab]}
      </div>
    </div>
  );
}

function ServerSettingsForm({ onClose }: { onClose: () => void }) {
  const { server } = useServer();
  const { me } = useMe();
  const supabase = useSupabase();
  const router = useRouter();
  const [iconUrl, setIconUrl] = useState<string | null>(server.icon_url);
  const [isPublic, setIsPublic] = useState(server.is_public ?? false);
  const [category, setCategory] = useState(server.category ?? "other");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const isOwner = server.owner_id === me.id;

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      setIconUrl(
        await uploadPublicImage(supabase, `servers/${server.id}`, "icon", file),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateServerAction({
        serverId: server.id,
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? ""),
        iconUrl,
        ...(isPublic !== (server.is_public ?? false) ? { isPublic } : {}),
        ...(category !== (server.category ?? "other") ? { category } : {}),
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (result.error) toast.error(result.error);
        return;
      }
      toast.success("Server settings saved.");
      router.refresh();
      onClose();
    });
  }

  function destroy() {
    startTransition(async () => {
      const result = await deleteServerAction({
        serverId: server.id,
        confirmName,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (result.error) toast.error(result.error);
        return;
      }
      toast.success(`Deleted ${server.name}.`);
      onClose();
      router.replace("/tambayan");
      router.refresh();
    });
  }

  return (
    <>
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-center gap-4">
          <ServerIcon
            server={{ ...server, icon_url: iconUrl }}
            size={64}
            active
          />
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={upload}
              aria-label="Upload server icon"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInput.current?.click()}
              loading={uploading}
            >
              <ImagePlus className="size-4" aria-hidden /> Upload icon
            </Button>
            {iconUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIconUrl(null)}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
        <InputField
          label="Name"
          name="name"
          defaultValue={server.name}
          minLength={2}
          maxLength={64}
          required
          error={errors.name}
        />
        <TextareaField
          label="Description"
          name="description"
          defaultValue={server.description}
          maxLength={280}
          rows={3}
          error={errors.description}
        />
        {!server.is_system && (
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <Switch
              checked={isPublic}
              onChange={setIsPublic}
              label="Show in Explore"
              hint="Anyone on Diskarte can find this server and join without an invite. Bans still apply."
            />
            <label className="block text-sm font-semibold text-white">
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm font-normal text-white"
              >
                {SERVER_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            {errors.category && (
              <p className="text-xs text-red-300">{errors.category}</p>
            )}
          </div>
        )}
        <Button type="submit" loading={pending} disabled={uploading}>
          Save
        </Button>
      </form>

      {isOwner && <ExportSettings />}
      {isOwner && (
        <div className="mt-8 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="font-silk text-[11px] uppercase tracking-wider text-red-300">
            Danger zone
          </p>
          <p className="mt-1 text-sm text-slate-300">
            Every channel and message will be erased. Type{" "}
            <strong className="text-white">{server.name}</strong> to confirm.
          </p>
          <div className="mt-3 flex gap-2">
            <InputField
              label="Server name"
              wrapperClassName="flex-1 [&>label]:sr-only"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              error={errors.confirmName}
            />
            <Button
              variant="danger"
              onClick={destroy}
              disabled={confirmName.trim() !== server.name.trim() || pending}
            >
              <Trash2 className="size-4" aria-hidden /> Delete
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
