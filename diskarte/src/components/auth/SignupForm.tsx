"use client";

import Link from "next/link";
import { MailCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { signUpAction, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/Field";
import { PASSWORD_MISMATCH } from "@/lib/profile";
import { PasswordChecklist } from "./PasswordChecklist";
import { useFormErrorFocus } from "./useFormErrorFocus";

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signUpAction, {});
  const formRef = useFormErrorFocus(state);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && confirm !== password;

  if (state.notice) {
    return (
      <div className="space-y-4 text-center" role="status">
        <MailCheck className="mx-auto size-10 text-sun" aria-hidden />
        <p className="text-slate-200">{state.notice}</p>
        <Link href="/login" className="inline-block font-semibold text-sun hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} aria-busy={pending} className="space-y-4" noValidate>
      <InputField
        label="Display name"
        name="displayName"
        autoComplete="nickname"
        required
        maxLength={32}
        defaultValue={state.values?.displayName}
        error={state.fieldErrors?.displayName}
        placeholder="Juan dela Cruz"
      />
      <InputField
        label="Username"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        maxLength={32}
        defaultValue={state.values?.username}
        error={state.fieldErrors?.username}
        hint="Lowercase letters, numbers, _ and . only"
        placeholder="juan.tamad"
      />
      <InputField
        label="Email"
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
        autoComplete="new-password"
        required
        minLength={10}
        maxLength={72}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={state.fieldErrors?.password}
        placeholder="••••••••••"
      />
      <PasswordChecklist value={password} />
      <InputField
        label="Confirm password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        maxLength={72}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={mismatch ? PASSWORD_MISMATCH : state.fieldErrors?.confirmPassword}
        hint={confirm && !mismatch ? "Passwords match" : undefined}
        placeholder="••••••••••"
      />
      {state.error && (
        <p role="alert" tabIndex={-1} data-form-error className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={mismatch}>
        Sign up
      </Button>
      <p className="text-center text-sm text-slate-400">
        May account ka na?{" "}
        <Link href="/login" className="inline-flex items-center pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center pointer-coarse:px-1 font-semibold text-sun hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
