"use client";

import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";
import { deleteServerAction, updateServerAction } from "@/actions/servers";
import { useMe } from "@/components/providers/MeProvider";
import { useServer } from "@/components/providers/ServerProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { ServerIcon } from "@/components/shell/ServerIcon";
import { Button } from "@/components/ui/Button";
import { InputField, TextareaField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { uploadPublicImage } from "@/lib/uploads";

export function ServerSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Tambayan settings" className="max-w-lg">
      <ServerSettingsForm onClose={onClose} />
    </Modal>
  );
}

function ServerSettingsForm({ onClose }: { onClose: () => void }) {
  const { server } = useServer();
  const { me } = useMe();
  const supabase = useSupabase();
  const router = useRouter();
  const [iconUrl, setIconUrl] = useState<string | null>(server.icon_url);
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
      setIconUrl(await uploadPublicImage(supabase, `servers/${server.id}`, "icon", file));
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
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (result.error) toast.error(result.error);
        return;
      }
      toast.success("Na-save ang tambayan settings.");
      router.refresh();
      onClose();
    });
  }

  function destroy() {
    startTransition(async () => {
      const result = await deleteServerAction({ serverId: server.id, confirmName });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (result.error) toast.error(result.error);
        return;
      }
      toast.success(`Paalam, ${server.name}.`);
      onClose();
      router.replace("/tambayan");
      router.refresh();
    });
  }

  return (
    <>
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-center gap-4">
          <ServerIcon server={{ ...server, icon_url: iconUrl }} size={64} active />
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={upload}
              aria-label="Upload server icon"
            />
            <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()} loading={uploading}>
              <ImagePlus className="size-4" aria-hidden /> Upload icon
            </Button>
            {iconUrl && (
              <Button variant="ghost" size="sm" onClick={() => setIconUrl(null)}>
                Remove
              </Button>
            )}
          </div>
        </div>
        <InputField label="Pangalan" name="name" defaultValue={server.name} minLength={2} maxLength={64} required error={errors.name} />
        <TextareaField label="Description" name="description" defaultValue={server.description} maxLength={280} rows={3} error={errors.description} />
        <Button type="submit" loading={pending} disabled={uploading}>
          I-save
        </Button>
      </form>

      {isOwner && (
        <div className="mt-8 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="font-silk text-[11px] uppercase tracking-wider text-red-300">Danger zone</p>
          <p className="mt-1 text-sm text-slate-300">
            Mabubura ang lahat ng channels at messages. I-type ang <strong className="text-white">{server.name}</strong> para kumpirmahin.
          </p>
          <div className="mt-3 flex gap-2">
            <InputField
              label="Server name"
              wrapperClassName="flex-1 [&>label]:sr-only"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              error={errors.confirmName}
            />
            <Button variant="danger" onClick={destroy} disabled={confirmName.trim() !== server.name.trim() || pending}>
              <Trash2 className="size-4" aria-hidden /> Delete
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
