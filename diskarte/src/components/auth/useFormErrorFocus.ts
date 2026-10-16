"use client";

import { useEffect, useRef } from "react";

/** Keep server validation reachable after a submit, including above a mobile keyboard. */
export function useFormErrorFocus(state: { fieldErrors?: Record<string, string>; error?: string }) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.fieldErrors && !state.error) return;
    const target = form.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-form-error]');
    target?.focus();
  }, [state]);
  return form;
}
