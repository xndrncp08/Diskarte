"use client";

import Script from "next/script";
import { useActionState, useId, useState, type ReactNode } from "react";
import { submitApplicationAction, type ApplyState } from "@/app/actions";
import { COMMUNITY_SIZES, COMMUNITY_TYPES } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { Confetti } from "./Confetti";

const REASON_MAX = 600;
const input =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3.5 text-[15px] text-white placeholder:text-slate-500 outline-none transition-colors focus:border-sun/70 focus:ring-2 focus:ring-sun/20 aria-[invalid=true]:border-red-400/80";

function Field({ id, label, hint, error, children, optional }: { id: string; label: string; hint?: ReactNode; error?: string; children: ReactNode; optional?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between font-silk text-[11px] uppercase tracking-wider text-slate-300">
        {label}
        {optional && <span className="normal-case tracking-normal text-slate-500">optional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-300">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Success({ firstName }: { firstName: string }) {
  return (
    <div className="relative space-y-5 py-4 text-center" role="status" data-testid="apply-success">
      <Confetti />
      <p className="font-pixel text-[10px] text-sun">★ PLAYER 2 HAS JOINED ★</p>
      <h2 className="text-3xl font-extrabold text-white">Nasa pila ka na, {firstName}! 🎉</h2>
      <p className="text-slate-300">
        Salamat sa pag-apply sa Diskarte Early Access. Isa-isa naming binabasa ang bawat application — kapag na-approve ka, darating sa email mo ang login
        details mo.
      </p>
      <ol className="mx-auto max-w-sm space-y-2 text-left text-sm text-slate-300">
        {["I-check ang inbox (at Spam/Promotions) mo.", "Mag-login gamit ang temporary password.", "Gumawa ng sariling password at tambay na!"].map((step, i) => (
          <li key={step} className="flex items-start gap-3 rounded-xl bg-white/5 px-3 py-2">
            <span className="mt-0.5 font-pixel text-[10px] text-sun">{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ApplicationForm({ formToken, turnstileSiteKey, nonce }: { formToken: string; turnstileSiteKey: string | null; nonce?: string }) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(submitApplicationAction, { status: "idle" });
  const [reason, setReason] = useState(state.values?.reason ?? "");
  const [type, setType] = useState(state.values?.communityType ?? "");
  const [size, setSize] = useState(state.values?.communitySize ?? "2-10");
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;
  const err = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const invalid = (name: string) => (err[name] ? { "aria-invalid": true as const, "aria-describedby": `${id(name)}-error` } : {});

  if (state.status === "success") return <Success firstName={state.firstName ?? "kabayan"} />;

  return (
    <form action={action} className="space-y-5" noValidate data-testid="apply-form">
      {turnstileSiteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" nonce={nonce} />}
      <input type="hidden" name="formToken" value={formToken} />
      {/* Honeypot: invisible to people and screen readers, irresistible to bots. */}
      <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden>
        <label htmlFor={id("website")}>Website</label>
        <input id={id("website")} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-200">
          {state.error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={id("fullName")} label="Buong pangalan" error={err.fullName}>
          <input id={id("fullName")} name="fullName" autoComplete="name" required maxLength={80} defaultValue={v.fullName} className={cn(input, "h-11")} placeholder="Juan Dela Cruz" {...invalid("fullName")} />
        </Field>
        <Field id={id("email")} label="Email" error={err.email}>
          <input id={id("email")} name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={v.email} className={cn(input, "h-11")} placeholder="juan@email.com" {...invalid("email")} />
        </Field>
      </div>

      <Field id={id("preferredUsername")} label="Gustong @username" optional error={err.preferredUsername} hint="Susubukan naming i-reserve ito para sa'yo.">
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">@</span>
          <input
            id={id("preferredUsername")}
            name="preferredUsername"
            autoComplete="username"
            autoCapitalize="none"
            maxLength={33}
            defaultValue={v.preferredUsername}
            className={cn(input, "h-11 pl-8")}
            placeholder="juan.tamad"
            {...invalid("preferredUsername")}
          />
        </div>
      </Field>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 font-silk text-[11px] uppercase tracking-wider text-slate-300">Anong klaseng komunidad?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-invalid={err.communityType ? true : undefined} aria-describedby={err.communityType ? `${id("communityType")}-error` : undefined}>
          {Object.entries(COMMUNITY_TYPES).map(([key, t]) => (
            <label
              key={key}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sun/60",
                type === key ? "border-sun/70 bg-sun/10 text-white" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
              )}
            >
              <input type="radio" name="communityType" value={key} checked={type === key} onChange={() => setType(key)} className="sr-only" />
              <span aria-hidden>{t.emoji}</span>
              {t.label}
            </label>
          ))}
        </div>
        {err.communityType && (
          <p id={`${id("communityType")}-error`} role="alert" className="text-xs text-red-300">
            {err.communityType}
          </p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={id("communityName")} label="Pangalan ng grupo" optional error={err.communityName}>
          <input id={id("communityName")} name="communityName" maxLength={80} defaultValue={v.communityName} className={cn(input, "h-11")} placeholder="Barangay Valorant" {...invalid("communityName")} />
        </Field>
        <Field id={id("referralSource")} label="Saan mo nalaman?" optional error={err.referralSource}>
          <input id={id("referralSource")} name="referralSource" maxLength={80} defaultValue={v.referralSource} className={cn(input, "h-11")} placeholder="TikTok, FB group, kaibigan…" {...invalid("referralSource")} />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 font-silk text-[11px] uppercase tracking-wider text-slate-300">Ilan kayo?</legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup">
          {Object.entries(COMMUNITY_SIZES).map(([key, label]) => (
            <label
              key={key}
              className={cn(
                "flex min-h-11 cursor-pointer items-center rounded-lg border px-3 text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sun/60",
                size === key ? "border-sun bg-sun text-abyss" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
              )}
            >
              <input type="radio" name="communitySize" value={key} checked={size === key} onChange={() => setSize(key)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        id={id("reason")}
        label="Bakit mo gustong sumali?"
        error={err.reason}
        hint={
          <span className={cn("tabular-nums", reason.length > REASON_MAX && "text-red-300")}>
            {reason.length}/{REASON_MAX} · Kwentuhan mo kami tungkol sa komunidad mo.
          </span>
        }
      >
        <textarea
          id={id("reason")}
          name="reason"
          required
          rows={4}
          maxLength={REASON_MAX + 50}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={cn(input, "resize-none py-2.5")}
          placeholder="Lilipat na kami mula Discord — kailangan namin ng voice na hindi nagla-lag sa probinsya…"
          {...invalid("reason")}
        />
      </Field>

      <label className="flex items-start gap-3 text-sm text-slate-300">
        <input type="checkbox" name="consent" required className="mt-1 size-4 shrink-0 accent-[#FFB800]" aria-describedby={err.consent ? `${id("consent")}-error` : undefined} />
        <span>
          Pumapayag akong gamitin ng Diskarte team ang info na ito para i-review ang application ko at i-email ako tungkol dito. Hindi namin ito ibebenta o
          ibabahagi.
        </span>
      </label>
      {err.consent && (
        <p id={`${id("consent")}-error`} role="alert" className="-mt-3 text-xs text-red-300">
          {err.consent}
        </p>
      )}

      {turnstileSiteKey && <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="dark" data-size="flexible" />}

      <button
        type="submit"
        disabled={pending}
        className="pixel-shadow flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sun font-extrabold text-abyss transition-[transform,box-shadow,filter] hover:brightness-110 active:translate-y-1 active:shadow-none disabled:opacity-60"
      >
        {pending ? "Sine-save…" : "Sumali sa waitlist ▶"}
      </button>
    </form>
  );
}
