"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useActionState } from "react";
import { adminSignInAction, type LoginState } from "@/app/admin/auth-actions";
import { FloatingInput } from "@/components/form/FloatingField";
import { PressButton } from "@/components/ui/PressButton";

export function AdminLoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(adminSignInAction, { error: initialError });
  return (
    <form action={action} className="space-y-4" data-testid="admin-login">
      <input type="hidden" name="next" value={next} />
      <AnimatePresence mode="popLayout">
        {state.error && (
          <motion.p
            key={state.error}
            role="alert"
            initial={{ opacity: 0, x: 0 }}
            animate={{ opacity: 1, x: [0, -8, 8, -4, 4, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="rounded-xl border border-red-400/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-200"
          >
            {state.error}
          </motion.p>
        )}
      </AnimatePresence>
      <FloatingInput label="Email" name="email" type="email" autoComplete="username" inputMode="email" required />
      <FloatingInput label="Password" name="password" type="password" autoComplete="current-password" required />
      <PressButton type="submit" loading={pending} loadingLabel="Sandali…" className="h-12 w-full">
        Pumasok bilang admin
      </PressButton>
    </form>
  );
}
