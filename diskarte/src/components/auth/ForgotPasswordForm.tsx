"use client";

import Link from "next/link";
import { MailCheck } from "lucide-react";
import { useActionState } from "react";
import { requestPasswordResetAction, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/Field";
import { useFormErrorFocus } from "./useFormErrorFocus";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(requestPasswordResetAction, {});
  const formRef = useFormErrorFocus(state);
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
      <InputField label="Email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} inputMode="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      {state.error && (
        <p role="alert" tabIndex={-1} data-form-error className="text-sm text-red-300">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Send reset link
      </Button>
      <p className="text-center text-sm text-slate-400">
        <Link href="/login" className="font-semibold text-sun hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
