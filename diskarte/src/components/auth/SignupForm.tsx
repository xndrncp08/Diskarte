"use client";

import Link from "next/link";
import { MailCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { signUpAction, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/Field";
import { PASSWORD_MISMATCH } from "@/lib/profile";
import { PasswordChecklist } from "./PasswordChecklist";

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signUpAction, {});
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && confirm !== password;

  if (state.notice) {
    return (
      <div className="space-y-4 text-center" role="status">
        <MailCheck className="mx-auto size-10 text-sun" aria-hidden />
        <p className="text-slate-200">{state.notice}</p>
        <Link href="/login" className="inline-block font-semibold text-sun hover:underline">
          Balik sa login
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
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
        required
        maxLength={32}
        defaultValue={state.values?.username}
        error={state.fieldErrors?.username}
        hint="Lowercase letters, numbers, _ at . lang"
        placeholder="juan.tamad"
      />
      <InputField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
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
        hint={confirm && !mismatch ? "Magkapareho ✓" : undefined}
        placeholder="••••••••••"
      />
      {state.error && (
        <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={mismatch}>
        Sali na!
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
