"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, type FormEvent } from "react";
import { signInAction, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/Field";
import { emailSchema } from "@/lib/schemas/profile";
import { useFormErrorFocus } from "./useFormErrorFocus";

const REMEMBERED_EMAIL = "diskarte-remembered-email";

export function LoginForm({ next, initialError, initialEmail }: { next: string; initialError?: string | null; initialEmail?: string | null }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signInAction, {
    error: initialError ?? undefined,
    values: initialEmail ? { email: initialEmail } : undefined,
  });
  const formRef = useFormErrorFocus(state);
  const emailRef = useRef<HTMLInputElement>(null);
  const rememberRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = emailSchema.safeParse(localStorage.getItem(REMEMBERED_EMAIL));
      if (!saved.success) return;
      if (emailRef.current && !emailRef.current.value) emailRef.current.value = saved.data;
      if (rememberRef.current) {
        rememberRef.current.checked = true;
        rememberRef.current.defaultChecked = true;
      }
    } catch { /* Storage may be disabled; password-manager autofill still works. */ }
  }, []);

  function rememberEmail(event: FormEvent<HTMLFormElement>) {
    try {
      const email = emailSchema.safeParse(new FormData(event.currentTarget).get("email"));
      if (rememberRef.current?.checked && email.success) localStorage.setItem(REMEMBERED_EMAIL, email.data);
      else localStorage.removeItem(REMEMBERED_EMAIL);
    } catch { /* Remembering an address must never block sign-in. */ }
  }

  return (
    <form ref={formRef} action={action} onSubmit={rememberEmail} aria-busy={pending} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <InputField
        label="Email"
        ref={emailRef}
        name="email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        inputMode="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
        placeholder="juan@example.com"
      />
      <InputField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
        placeholder="••••••••"
      />
      <p className="-mt-2 text-right text-xs">
        <Link href="/forgot-password" className="inline-flex items-center pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center pointer-coarse:px-1 text-slate-400 hover:text-sun hover:underline">
          Forgot your password?
        </Link>
      </p>
      <label className="auth-remember flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-300">
        <input ref={rememberRef} type="checkbox" className="size-4 accent-sun" onChange={(event) => {
          // Server Actions reset uncontrolled forms; keep this device preference across retries.
          event.currentTarget.defaultChecked = event.currentTarget.checked;
          if (!event.currentTarget.checked) {
            try { localStorage.removeItem(REMEMBERED_EMAIL); } catch { /* Optional storage. */ }
          }
        }} />
        Remember my email on this device
      </label>
      {state.error && (
        <p role="alert" tabIndex={-1} data-form-error className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Sign in
      </Button>
      <p className="text-center text-sm text-slate-400">
        New here?{" "}
        <Link href={`/signup${next !== "/tambayan" ? `?next=${encodeURIComponent(next)}` : ""}`} className="inline-flex items-center pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center pointer-coarse:px-1 font-semibold text-sun hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
