"use client";

import { useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

export interface ConfirmRequest {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Adds an optional free-text reason (e.g. a ban reason), passed to `onConfirm`. */
  reason?: { label: string; placeholder?: string; maxLength?: number };
  /** Resolve `false` to keep the dialog open (the action failed and already said why). */
  onConfirm: (reason: string) => Promise<boolean | void> | boolean | void;
}

let current: ConfirmRequest | null = null;
const listeners = new Set<() => void>();
let hosts = 0;

function set(next: ConfirmRequest | null) {
  current = next;
  for (const l of listeners) l();
}

/**
 * Asks before a destructive action started from a menu (kick, ban, block, leave, delete). Menus
 * unmount as soon as an item is picked, so the dialog lives in the app-wide <ConfirmHost>.
 */
export function confirmAction(request: ConfirmRequest) {
  if (hosts === 0) {
    console.warn("confirmAction() called without a <ConfirmHost> mounted:", request.title);
    return;
  }
  set(request);
}

export function ConfirmHost() {
  const request = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      hosts += 1;
      return () => {
        listeners.delete(listener);
        hosts -= 1;
      };
    },
    () => current,
    () => null,
  );
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  // A new request starts with an empty reason (state reset during render, keyed on the request).
  const [shown, setShown] = useState<ConfirmRequest | null>(null);
  if (request !== shown) {
    setShown(request);
    setReason("");
  }

  function confirm() {
    if (!request) return;
    startTransition(async () => {
      const ok = await request.onConfirm(reason.trim());
      if (ok !== false && current === request) set(null);
    });
  }

  return (
    <ConfirmDialog
      open={request !== null}
      onClose={() => !pending && set(null)}
      onConfirm={confirm}
      pending={pending}
      title={request?.title ?? ""}
      confirmLabel={request?.confirmLabel}
      danger={request?.danger ?? true}
    >
      {request?.body}
      {request?.reason && (
        <label className="mt-3 block text-xs text-slate-300">
          {request.reason.label}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={request.reason.maxLength ?? 200}
            placeholder={request.reason.placeholder}
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white outline-none focus:border-red-400/60"
          />
        </label>
      )}
    </ConfirmDialog>
  );
}
