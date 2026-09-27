"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const box =
  "peer w-full rounded-xl border border-white/10 bg-black/40 px-3.5 text-base text-white outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-transparent focus:border-sun/70 focus:shadow-[0_0_0_4px_rgba(255,184,0,0.15)] aria-[invalid=true]:border-red-400/80 sm:text-[0.9375rem]";

/**
 * Floating label: sits inside the field like a placeholder and glides up (transform only) on
 * focus or once filled. Uses the `:placeholder-shown` trick, so it works before hydration too.
 */
const label =
  "pointer-events-none absolute left-3.5 top-4 origin-left text-[0.9375rem] text-slate-400 transition-[transform,color] duration-200 ease-out peer-focus:-translate-y-2.5 peer-focus:scale-[0.78] peer-focus:text-sun peer-[:not(:placeholder-shown)]:-translate-y-2.5 peer-[:not(:placeholder-shown)]:scale-[0.78]";

function Message({ id, error, hint }: { id: string; error?: string; hint?: ReactNode }) {
  if (error)
    return (
      <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-red-300">
        {error}
      </p>
    );
  if (hint)
    return (
      <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
        {hint}
      </p>
    );
  return null;
}

export function FloatingInput({
  label: text,
  error,
  hint,
  prefix,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "prefix" | "placeholder"> & { label: string; error?: string; hint?: ReactNode; prefix?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <div className="relative">
        <input
          id={id}
          placeholder=" "
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(box, "h-14 pb-1.5 pt-5", prefix && "pl-7")}
          {...props}
        />
        {prefix && <span className="pointer-events-none absolute bottom-[0.55rem] left-3.5 text-[0.9375rem] text-slate-500 opacity-0 transition-opacity peer-focus:opacity-100 peer-[:not(:placeholder-shown)]:opacity-100">{prefix}</span>}
        <label htmlFor={id} className={label}>
          {text}
        </label>
      </div>
      <Message id={id} error={error} hint={hint} />
    </div>
  );
}

export function FloatingTextarea({
  label: text,
  error,
  hint,
  className,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "placeholder"> & { label: string; error?: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className={className}>
      <div className="relative">
        <textarea
          id={id}
          placeholder=" "
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(box, "min-h-36 resize-none pb-3 pt-7")}
          {...props}
        />
        <label htmlFor={id} className={label}>
          {text}
        </label>
      </div>
      <Message id={id} error={error} hint={hint} />
    </div>
  );
}
