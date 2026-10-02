"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { deleteAccountAction } from "@/actions/account";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { clearOutbox } from "@/lib/outbox";

/** Settings → Danger zone: permanent account deletion behind a type-your-username confirmation. */
export function DangerZone({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-red-500/40 bg-red-500/[0.06] p-5" aria-labelledby="danger-zone-title" data-testid="danger-zone">
      <h2 id="danger-zone-title" className="mb-1 flex items-center gap-2 font-pixel text-[10px] text-red-300">
        <AlertTriangle className="size-3.5" aria-hidden /> DANGER ZONE
      </h2>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-white">Delete account</p>
          <p className="text-sm text-slate-400">Permanently remove your profile, uploads and sign-in. This can&apos;t be undone.</p>
        </div>
        <Button variant="danger" onClick={() => setOpen(true)} className="shrink-0">
          <Trash2 className="size-4" aria-hidden /> Delete account
        </Button>
      </div>
      <DeleteAccountDialog open={open} onClose={() => setOpen(false)} username={username} />
    </section>
  );
}

export function DeleteAccountDialog({ open, onClose, username }: { open: boolean; onClose: () => void; username: string }) {
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const descId = useId();
  const matches = confirm.trim().replace(/^@/, "").toLowerCase() === username.toLowerCase();

  function close() {
    if (pending) return;
    setConfirm("");
    setError(null);
    onClose();
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!matches || pending) return;
    setError(null);
    startTransition(async () => {
      clearOutbox();
      // On success the action signs out and redirects, so it only returns on failure.
      const result = await deleteAccountAction({ confirm });
      setError(result.fieldErrors?.confirm ?? result.error ?? "Couldn't delete your account. Try again.");
    });
  }

  return (
    <Modal open={open} onClose={close} title="Delete your account?" className="max-w-lg">
      <form onSubmit={submit} className="space-y-4" aria-describedby={descId}>
        <div id={descId} className="space-y-2 text-sm text-slate-300">
          <p>This permanently deletes:</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-400">
            <li>your profile, friends, DMs and server memberships</li>
            <li>your uploaded avatar, banner and attachments (and the messages that carried them)</li>
            <li>your sign-in — you&apos;ll be signed out everywhere</li>
          </ul>
          <p className="text-slate-400">
            Servers you own pass to their most senior member; servers where you&apos;re the only member are deleted. Your other messages stay, shown as
            from a deleted user.
          </p>
        </div>
        <InputField
          label={`Type your username (${username}) to confirm`}
          name="confirm"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={error}
          data-autofocus
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={!matches} loading={pending}>
            <Trash2 className="size-4" aria-hidden /> Delete my account
          </Button>
        </div>
      </form>
    </Modal>
  );
}
