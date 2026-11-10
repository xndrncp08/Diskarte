"use client";

import { ChevronDown } from "lucide-react";
import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from "react";
import { FieldShell, InputField, TextareaField, type FieldSkin, type InputFieldProps, type TextareaFieldProps } from "@/components/ui/Field";
import { cn } from "@/lib/utils";

const CONTROL =
  "w-full rounded-pulse-control border border-pulse-input bg-pulse-surface px-3 font-pulse-text text-pulse-body text-pulse-text placeholder:text-pulse-muted " +
  "transition-colors hover:border-pulse-line-strong focus-visible:border-pulse-focus disabled:cursor-not-allowed disabled:border-pulse-line disabled:bg-pulse-raised disabled:text-pulse-disabled" +
  "aria-[invalid=true]:border-pulse-alert";

/** Pulse look for the shared fields: input-border edges (3:1), muted placeholder, alert edge and text when invalid. */
export const PULSE_FIELD: FieldSkin = {
  label: "block font-pulse-text text-pulse-label font-semibold text-pulse-text",
  hint: "font-pulse-text text-pulse-caption text-pulse-muted",
  error: "font-pulse-text text-pulse-caption font-medium text-pulse-alert",
  control: cn(CONTROL, "h-10 pointer-coarse:h-11"),
  reveal:
    "absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-pulse-control text-pulse-muted transition-colors hover:text-pulse-text disabled:opacity-60 pointer-coarse:w-11",
};
const TEXTAREA_SKIN: FieldSkin = { ...PULSE_FIELD, control: CONTROL };

/**
 * Pulse text input: the shared InputField (label linked by id, hint or error wired into aria-describedby,
 * error announced via role="alert", password reveal toggle) in Pulse styling. Props are InputField's.
 */
export const Input = forwardRef<HTMLInputElement, Omit<InputFieldProps, "skin">>(function Input(props, ref) {
  return <InputField ref={ref} {...props} skin={PULSE_FIELD} />;
});

/** Pulse multi-line field: the shared TextareaField in Pulse styling (min 80 px, no resize handle). */
export const Textarea = forwardRef<HTMLTextAreaElement, Omit<TextareaFieldProps, "skin">>(function Textarea(props, ref) {
  return <TextareaField ref={ref} {...props} skin={TEXTAREA_SKIN} />;
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  wrapperClassName?: string;
}

/**
 * Pulse select: a native <select> (platform pickers on phones, full keyboard support) inside the shared
 * FieldShell, so label, hint and error behave exactly like Input. Pass <option> children.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, hint, error, id, className, wrapperClassName, children, ...props }, ref) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={selectId} className={wrapperClassName} skin={PULSE_FIELD}>
      <span className="relative block">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
          className={cn(PULSE_FIELD.control, "appearance-none pr-9", className)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-pulse-muted" aria-hidden />
      </span>
    </FieldShell>
  );
});
