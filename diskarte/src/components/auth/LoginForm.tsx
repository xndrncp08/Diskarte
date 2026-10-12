"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/Field";

export function LoginForm({ next, initialError, initialEmail }: { next: string; initialError?: string | null; initialEmail?: string | null }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signInAction, {
    error: initialError ?? undefined,
    values: initialEmail ? { email: initialEmail } : undefined,
  });

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
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
      {state.error && (
        <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
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
