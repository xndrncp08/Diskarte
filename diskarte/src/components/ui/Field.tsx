"use client";

import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const control =
  "ui-control w-full rounded-lg bg-black/40 border border-white/10 px-3 text-sm text-slate-100 placeholder:text-slate-500 " +
  "outline-none transition-colors focus:border-sun/70 focus:ring-2 focus:ring-sun/20 disabled:opacity-60 " +
  "aria-[invalid=true]:border-red-400/80";

/** The look of a field: label, hint, error, the control and the password reveal button. Labelling and ids never change. */
export interface FieldSkin {
  label: string;
  hint: string;
  error: string;
  control: string;
  reveal: string;
}

export const CLASSIC_FIELD: FieldSkin = {
  label: "ui-field-label block font-silk text-[11px] uppercase tracking-wider text-slate-300",
  hint: "text-xs text-slate-400",
  error: "text-xs text-red-300",
  control: cn(control, "h-10 pointer-coarse:h-11"),
  reveal:
    "absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sun/40 disabled:opacity-60 pointer-coarse:w-11",
};

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  htmlFor: string;
  children: ReactNode;
  className?: string;
  skin?: FieldSkin;
}

/** Label, control, then the error (announced) or the hint, linked by `${htmlFor}-error` / `-hint` ids. */
export function FieldShell({ label, hint, error, htmlFor, children, className, skin = CLASSIC_FIELD }: FieldShellProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className={skin.label}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className={skin.error}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className={skin.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  wrapperClassName?: string;
  skin?: FieldSkin;
}

/** Password fields get an eye toggle that reveals the text in place (it never submits the form). */
export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(function InputField(
  { label, hint, error, id, type, className, wrapperClassName, skin = CLASSIC_FIELD, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const input = (
    <input
      ref={ref}
      id={inputId}
      type={isPassword && revealed ? "text" : type}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
      className={cn(skin.control, isPassword && "pr-11 pointer-coarse:pr-12", className)}
      {...props}
    />
  );
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={inputId} className={wrapperClassName} skin={skin}>
      {isPassword ? (
        <div className="relative">
          {input}
          <button
            type="button"
            aria-label="Show password"
            aria-pressed={revealed}
            aria-controls={inputId}
            title={revealed ? "Hide password" : "Show password"}
            // Keep focus (and the caret) in the input on mouse/touch; keyboard users can still tab here.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setRevealed((r) => !r)}
            disabled={props.disabled}
            className={skin.reveal}
          >
            {revealed ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
      ) : (
        input
      )}
    </FieldShell>
  );
});

export interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  wrapperClassName?: string;
  /** Its `control` should not set a height: the textarea adds min-h-20 and vertical padding. */
  skin?: FieldSkin;
}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(function TextareaField(
  { label, hint, error, id, className, wrapperClassName, skin, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={inputId} className={wrapperClassName} skin={skin}>
      <textarea
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className={cn(skin?.control ?? control, "min-h-20 py-2 resize-none", className)}
        {...props}
      />
    </FieldShell>
  );
});
