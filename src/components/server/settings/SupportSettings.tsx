"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { updateSupportAction } from "@/actions/moderation";
import { useServer } from "@/components/providers/ServerProvider";
import { Button } from "@/components/ui/Button";
import { InputField, TextareaField } from "@/components/ui/Field";

/** GCash / Maya numbers and a thank-you note shown in the "Suportahan" dialog. */
export function SupportSettings() {
  const { server } = useServer();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateSupportAction({
        serverId: server.id,
        gcashNumber: String(form.get("gcash") ?? ""),
        mayaNumber: String(form.get("maya") ?? ""),
        supportNote: String(form.get("note") ?? ""),
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (result.error) toast.error(result.error);
        return;
      }
      setErrors({});
      toast.success("Na-save ang support details. Salamat, lodi! 💙");
    });
  }

  return (
    <form onSubmit={save} className="space-y-4" data-testid="support-settings">
      <p className="text-sm text-slate-400">
        Ipakita sa members kung saan pwedeng mag-ambag para sa tambayan (server costs, tournaments, pa-load sa events). Manual ang pag-verify ng donations:
        bigyan ng badge ang supporters sa member list.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <InputField label="GCash number" name="gcash" inputMode="tel" autoComplete="off" placeholder="09XX XXX XXXX" defaultValue={server.gcash_number ?? ""} error={errors.gcashNumber} />
        <InputField label="Maya number" name="maya" inputMode="tel" autoComplete="off" placeholder="09XX XXX XXXX" defaultValue={server.maya_number ?? ""} error={errors.mayaNumber} />
      </div>
      <TextareaField label="Message para sa supporters" name="note" rows={3} maxLength={280} defaultValue={server.support_note} placeholder="Salamat sa suporta! Lahat ng ambag ay para sa server at monthly tournament." error={errors.supportNote} />
      <Button type="submit" loading={pending}>
        I-save
      </Button>
    </form>
  );
}
