"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { changePasswordAction, type AccountFormState } from "@/actions/account";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/Field";
import { PasswordChecklist } from "@/components/auth/PasswordChecklist";
import { useFormErrorFocus } from "@/components/auth/useFormErrorFocus";

export function ChangePasswordForm({ redirectTo }: { redirectTo?: string } = {}) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(changePasswordAction, {});
  const formRef = useFormErrorFocus(state);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (state.ok) {
      toast.success("Your password was updated.");
      formRef.current?.reset();
    }
  }, [state, formRef]);

  return (
    <form ref={formRef} action={action} aria-busy={pending} className="grid max-w-md gap-4">
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
      <InputField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        maxLength={72}
        onChange={(event) => setPassword(event.target.value)}
        error={state.fieldErrors?.password}
        hint="10+ characters with uppercase, lowercase, a number and a symbol"
      />
      {redirectTo && <PasswordChecklist value={password} />}
      <InputField label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required maxLength={72} error={state.fieldErrors?.confirm} />
      {state.error && (
        <p role="alert" tabIndex={-1} data-form-error className="text-sm text-red-300">
          {state.error}
        </p>
      )}
      <Button type="submit" variant={redirectTo ? "primary" : "secondary"} size={redirectTo ? "lg" : "md"} loading={pending} className={redirectTo ? "w-full" : "justify-self-start"}>
        Change password
      </Button>
    </form>
  );
}
