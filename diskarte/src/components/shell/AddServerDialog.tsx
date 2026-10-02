"use client";

import { useRouter } from "next/navigation";
import { Compass, Sparkles } from "lucide-react";
import { useId, useState, useTransition, type FormEvent } from "react";
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
  const tabsId = useId();
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
      toast.success("Server created! 🎉");
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
      toast.success("Welcome to the server!");
      close();
      router.push(`/tambayan/${result.data.serverId}`);
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={tab === "create" ? "Create a server" : "Join a server"}
      description="Your server is home base for your crew — chat, voice and screen share."
    >
      <div role="tablist" aria-label="Create or join" className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-black/40 p-1">
        {(
          [
            ["create", "Create", Sparkles],
            ["join", "Join", Compass],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`${tabsId}-${key}-tab`}
            aria-selected={tab === key}
            aria-controls={`${tabsId}-panel`}
            tabIndex={tab === key ? 0 : -1}
            onKeyDown={(e) => {
              // Roving tabindex: arrows switch between the two tabs.
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const next = key === "create" ? "join" : "create";
              setTab(next);
              setErrors({});
              document.getElementById(`${tabsId}-${next}-tab`)?.focus();
            }}
            onClick={() => {
              setTab(key);
              setErrors({});
            }}
            className={cn(
              "flex items-center justify-center gap-2 rounded-md py-1.5 text-sm font-semibold transition-colors",
              tab === key ? "bg-sun text-abyss" : "text-slate-300 hover:bg-white/10",
            )}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}-tab`}>
        {tab === "create" ? (
          <form onSubmit={submitCreate} className="space-y-4">
            <InputField
              label="Server name"
              name="name"
              required
              minLength={2}
              maxLength={64}
              placeholder="Barkada HQ"
              error={errors.name}
              data-autofocus
            />
            <TextareaField
              label="Description (optional)"
              name="description"
              maxLength={280}
              rows={2}
              placeholder="Home of the ranked grinders"
              error={errors.description}
            />
            <p className="text-xs text-slate-500">Comes with #general, #chika, #lfg-valorant and two voice channels.</p>
            <Button type="submit" className="w-full" loading={pending}>
              Create server
            </Button>
          </form>
        ) : (
          <form onSubmit={submitJoin} className="space-y-4">
            <InputField
              label="Invite link or code"
              name="invite"
              required
              placeholder="https://diskarte.app/invite/ABCD234XYZ"
              hint="Ask a friend for an invite."
              error={errors.invite}
              data-autofocus
            />
            <Button type="submit" className="w-full" loading={pending}>
              Join
            </Button>
          </form>
        )}
      </div>
    </Modal>
  );
}
