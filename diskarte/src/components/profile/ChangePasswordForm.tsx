"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { changePasswordAction, type AccountFormState } from "@/actions/account";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/Field";

export function ChangePasswordForm({ redirectTo }: { redirectTo?: string } = {}) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(changePasswordAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.success("Your password was updated.");
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid max-w-md gap-4">
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
      <InputField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.password}
        hint="10+ characters with uppercase, lowercase, a number and a symbol"
      />
      <InputField label="Confirm new password" name="confirm" type="password" autoComplete="new-password" error={state.fieldErrors?.confirm} />
      {state.error && (
        <p role="alert" className="text-sm text-red-300">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="secondary" loading={pending} className="justify-self-start">
        Change password
      </Button>
    </form>
  );
}
