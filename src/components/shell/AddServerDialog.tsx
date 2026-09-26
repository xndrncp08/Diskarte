"use client";

import { useRouter } from "next/navigation";
import { Compass, Sparkles } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { createServerAction, joinServerAction } from "@/actions/servers";
import { Button } from "@/components/ui/Button";
import { InputField, TextareaField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

type Tab = "create" | "join";

export function AddServerDialog({ open, onClose, initialTab = "create" }: { open: boolean; onClose: () => void; initialTab?: Tab }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function close() {
    setErrors({});
    onClose();
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createServerAction({ name: String(form.get("name") ?? ""), description: String(form.get("description") ?? "") });
      if (!result.ok || !result.data) {
        setErrors(result.fieldErrors ?? {});
        if (result.error) toast.error(result.error);
        return;
      }
      toast.success("Bagong tambayan, bagong tropa! 🎉");
      close();
      router.push(`/tambayan/${result.data.serverId}`);
      router.refresh();
    });
  }

  function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await joinServerAction({ invite: String(form.get("invite") ?? "") });
      if (!result.ok || !result.data) {
        setErrors(result.fieldErrors ?? {});
        if (result.error) toast.error(result.error);
        return;
      }
      toast.success("Welcome sa tambayan!");
      close();
      router.push(`/tambayan/${result.data.serverId}`);
      router.refresh();
    });
  }

  return (
    <Modal open={open} onClose={close} title={tab === "create" ? "Gumawa ng Tambayan" : "Sumali sa Tambayan"} description="Ang tambayan mo ang bahay ng barkada — chat, voice at screen share.">
      <div role="tablist" aria-label="Create or join" className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-black/40 p-1">
        {(
          [
            ["create", "Gumawa", Sparkles],
            ["join", "Sumali", Compass],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => {
              setTab(key);
              setErrors({});
            }}
            className={cn("flex items-center justify-center gap-2 rounded-md py-1.5 text-sm font-semibold transition-colors", tab === key ? "bg-sun text-abyss" : "text-slate-300 hover:bg-white/10")}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {tab === "create" ? (
        <form onSubmit={submitCreate} className="space-y-4" role="tabpanel">
          <InputField label="Pangalan ng tambayan" name="name" required minLength={2} maxLength={64} placeholder="Barkada HQ" error={errors.name} data-autofocus />
          <TextareaField label="Description (optional)" name="description" maxLength={280} rows={2} placeholder="Tambayan ng mga ranked grinders" error={errors.description} />
          <p className="text-xs text-slate-500">May kasama nang #general, #chika, #lfg-valorant at dalawang voice channels.</p>
          <Button type="submit" className="w-full" loading={pending}>
            Gawin na!
          </Button>
        </form>
      ) : (
        <form onSubmit={submitJoin} className="space-y-4" role="tabpanel">
          <InputField
            label="Invite link o code"
            name="invite"
            required
            placeholder="https://diskarte.app/invite/ABCD234XYZ"
            hint="Humingi ng invite sa kaibigan mo."
            error={errors.invite}
            data-autofocus
          />
          <Button type="submit" className="w-full" loading={pending}>
            Sali na
          </Button>
        </form>
      )}
    </Modal>
  );
}
