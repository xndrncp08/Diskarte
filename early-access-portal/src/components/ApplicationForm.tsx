"use client";

import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { submitApplicationAction, type ApplyState } from "@/app/actions";
import { EASE_OUT, SPRING } from "@/components/motion/MotionRoot";
import { PressButton } from "@/components/ui/PressButton";
import { applicationSchema, COMMUNITY_SIZES, COMMUNITY_TYPES, fieldErrors as toFieldErrors } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { FloatingInput, FloatingTextarea } from "./form/FloatingField";
import { Turnstile } from "./form/Turnstile";

// The celebration only ships when someone actually applies.
const Confetti = dynamic(() => import("./Confetti").then((m) => m.Confetti), { ssr: false });

const REASON_MAX = 600;

type Field = "fullName" | "email" | "preferredUsername" | "communityType" | "communityName" | "communitySize" | "referralSource" | "reason" | "consent";
type Values = Record<Field, string>;

const STEPS: { title: string; subtitle: string; fields: Field[] }[] = [
  { title: "Tungkol sa'yo", subtitle: "Para alam namin kung sino ang iimbitahan.", fields: ["fullName", "email", "preferredUsername"] },
  { title: "Ang komunidad mo", subtitle: "Squad, org, stream o barkada — lahat welcome.", fields: ["communityType", "communityName", "communitySize", "referralSource"] },
  { title: "Kwento mo", subtitle: "Bakit Diskarte? Ito ang pinakabinabasa namin.", fields: ["reason", "consent"] },
];

const EMPTY: Values = { fullName: "", email: "", preferredUsername: "", communityType: "", communityName: "", communitySize: "2-10", referralSource: "", reason: "", consent: "" };

/** Client-side check of one step with the same Zod schema the server uses. */
function validateStep(step: number, values: Values): Record<string, string> {
  const pick = Object.fromEntries(STEPS[step].fields.map((f) => [f, true])) as Partial<Record<Field, true>>;
  const result = applicationSchema.pick(pick).safeParse(values);
  return result.success ? {} : toFieldErrors(result.error);
}

function firstStepWithError(errors: Record<string, string>) {
  const index = STEPS.findIndex((s) => s.fields.some((f) => errors[f]));
  return index === -1 ? 0 : index;
}

function Success({ firstName }: { firstName: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      className="relative space-y-5 py-4 text-center"
      role="status"
      data-testid="apply-success"
    >
      <Confetti />
      <p className="font-pixel text-[10px] text-sun">★ PLAYER 2 HAS JOINED ★</p>
      <h2 className="text-3xl font-extrabold text-white">Nasa pila ka na, {firstName}! 🎉</h2>
      <p className="text-slate-300">
        Salamat sa pag-apply sa Diskarte Early Access. Isa-isa naming binabasa ang bawat application. Kapag na-approve ka, darating sa email mo ang login details mo.
      </p>
      <ol className="mx-auto max-w-sm space-y-2 text-left text-sm text-slate-300">
        {["I-check ang inbox (at Spam/Promotions) mo.", "Mag-login gamit ang temporary password.", "Gumawa ng sariling password at tambay na!"].map((step, i) => (
          <motion.li
            key={step}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35 + i * 0.12, duration: 0.4, ease: EASE_OUT }}
            className="flex items-start gap-3 rounded-xl bg-white/5 px-3 py-2"
          >
            <span className="mt-0.5 font-pixel text-[10px] text-sun">{i + 1}</span>
            {step}
          </motion.li>
        ))}
      </ol>
    </motion.div>
  );
}

function Choice({ checked, onSelect, children, className }: { checked: boolean; onSelect: () => void; children: React.ReactNode; className?: string }) {
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      whileTap={{ scale: 0.96 }}
      transition={SPRING}
      className={cn(
        "flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
        checked ? "border-sun/70 bg-sun/10 text-white shadow-[0_0_0_3px_rgba(255,184,0,0.12)]" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

/**
 * Three-step application with spring transitions. Each step is validated with the server's Zod
 * schema before moving on; every value is posted through hidden inputs, so the Server Action always
 * receives the whole form (and server-side errors jump back to the right step).
 */
export function ApplicationForm({ formToken, turnstileSiteKey, nonce }: { formToken: string; turnstileSiteKey: string | null; nonce?: string }) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(submitApplicationAction, { status: "idle" });
  const [values, setValues] = useState<Values>(EMPTY);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const stepRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  // Adopt a new server response: its field errors, the values it echoes back, and the step to fix.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.values) setValues((v) => ({ ...v, ...state.values }));
    if (state.fieldErrors) {
      setErrors(state.fieldErrors);
      setDirection(-1);
      setStep(firstStepWithError(state.fieldErrors));
    }
  }

  // Keyboard & screen-reader users land on the first field of each new step.
  useEffect(() => {
    if (!moved.current) return;
    const frame = requestAnimationFrame(() => stepRef.current?.querySelector<HTMLElement>("input, textarea, button[role=radio]")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [step]);

  if (state.status === "success") return <Success firstName={state.firstName ?? "kabayan"} />;

  const set = (field: Field) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field])
      setErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
  };
  const last = step === STEPS.length - 1;

  function go(next: number) {
    moved.current = true;
    setDirection(next > step ? 1 : -1);
    setStep(next);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const stepErrors = validateStep(step, values);
    if (Object.keys(stepErrors).length) {
      event.preventDefault();
      setErrors((e) => ({ ...e, ...stepErrors }));
      return;
    }
    if (!last) {
      event.preventDefault();
      go(step + 1);
    }
    // Last step: let the Server Action run with the hidden inputs below.
  }

  const reasonLength = values.reason.length;

  return (
    <form action={action} onSubmit={onSubmit} className="space-y-5" noValidate data-testid="apply-form">
      <input type="hidden" name="formToken" value={formToken} />
      {(Object.keys(EMPTY) as Field[]).map((f) => (
        <input key={f} type="hidden" name={f} value={values[f]} />
      ))}
      {/* Honeypot: invisible to people and screen readers, irresistible to bots. */}
      <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden>
        <label htmlFor="apply-website">Website</label>
        <input id="apply-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <div className="flex gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <div key={s.title} className="h-2 flex-1 overflow-hidden bg-white/10">
              <motion.div className="h-full origin-left bg-sun" initial={false} animate={{ scaleX: i <= step ? 1 : 0 }} transition={{ duration: 0.35, ease: EASE_OUT }} />
            </div>
          ))}
        </div>
        <p className="mt-3 font-pixel text-[9px] text-slate-400" aria-live="polite">
          HAKBANG {step + 1} NG {STEPS.length}
        </p>
      </div>

      {state.error && (
        <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-200">
          {state.error}
        </motion.p>
      )}

      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={step}
            ref={stepRef}
            custom={direction}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * 40 }),
              center: { opacity: 1, x: 0 },
              exit: (d: number) => ({ opacity: 0, x: d * -40 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.28, ease: EASE_OUT }}
            className="space-y-4"
            role="group"
            aria-labelledby="apply-step-title"
          >
            <div>
              <h3 id="apply-step-title" className="text-lg font-bold text-white">
                {STEPS[step].title}
              </h3>
              <p className="text-sm text-slate-400">{STEPS[step].subtitle}</p>
            </div>

            {step === 0 && (
              <>
                <FloatingInput label="Buong pangalan" autoComplete="name" maxLength={80} value={values.fullName} onChange={(e) => set("fullName")(e.target.value)} error={errors.fullName} />
                <FloatingInput label="Email" type="email" autoComplete="email" inputMode="email" maxLength={254} value={values.email} onChange={(e) => set("email")(e.target.value)} error={errors.email} />
                <FloatingInput
                  label="Gustong @username (optional)"
                  prefix="@"
                  autoComplete="username"
                  autoCapitalize="none"
                  maxLength={33}
                  value={values.preferredUsername}
                  onChange={(e) => set("preferredUsername")(e.target.value)}
                  error={errors.preferredUsername}
                  hint="Susubukan naming i-reserve ito para sa'yo."
                />
              </>
            )}

            {step === 1 && (
              <>
                <div>
                  <p id="community-type-label" className="mb-2 font-silk text-[11px] uppercase tracking-wider text-slate-300">
                    Anong klaseng komunidad?
                  </p>
                  <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:grid-cols-3" role="radiogroup" aria-labelledby="community-type-label" aria-invalid={errors.communityType ? true : undefined}>
                    {Object.entries(COMMUNITY_TYPES).map(([key, t]) => (
                      <Choice key={key} checked={values.communityType === key} onSelect={() => set("communityType")(key)}>
                        <span aria-hidden>{t.emoji}</span>
                        {t.label}
                      </Choice>
                    ))}
                  </div>
                  {errors.communityType && (
                    <p role="alert" className="mt-1.5 text-xs text-red-300">
                      {errors.communityType}
                    </p>
                  )}
                </div>
                <FloatingInput label="Pangalan ng grupo (optional)" maxLength={80} value={values.communityName} onChange={(e) => set("communityName")(e.target.value)} error={errors.communityName} />
                <div>
                  <p id="community-size-label" className="mb-2 font-silk text-[11px] uppercase tracking-wider text-slate-300">
                    Ilan kayo?
                  </p>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="community-size-label">
                    {Object.entries(COMMUNITY_SIZES).map(([key, text]) => (
                      <Choice key={key} checked={values.communitySize === key} onSelect={() => set("communitySize")(key)} className="justify-center px-3.5 font-semibold">
                        {text}
                      </Choice>
                    ))}
                  </div>
                </div>
                <FloatingInput label="Saan mo nalaman? (optional)" maxLength={80} value={values.referralSource} onChange={(e) => set("referralSource")(e.target.value)} error={errors.referralSource} />
              </>
            )}

            {step === 2 && (
              <>
                <FloatingTextarea
                  label="Bakit mo gustong sumali?"
                  rows={5}
                  maxLength={REASON_MAX + 50}
                  value={values.reason}
                  onChange={(e) => set("reason")(e.target.value)}
                  error={errors.reason}
                  hint={
                    <span className={cn("tabular-nums", reasonLength > REASON_MAX && "text-red-300")}>
                      {reasonLength}/{REASON_MAX} · Kwentuhan mo kami tungkol sa komunidad mo.
                    </span>
                  }
                />
                <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={values.consent === "on"}
                    onChange={(e) => set("consent")(e.target.checked ? "on" : "")}
                    className="mt-0.5 size-5 shrink-0 accent-[#FFB800]"
                    aria-invalid={errors.consent ? true : undefined}
                  />
                  <span>Pumapayag akong gamitin ng Diskarte team ang info na ito para i-review ang application ko at i-email ako tungkol dito. Hindi namin ito ibebenta o ibabahagi.</span>
                </label>
                {errors.consent && (
                  <p role="alert" className="-mt-2 text-xs text-red-300">
                    {errors.consent}
                  </p>
                )}
                {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} nonce={nonce} />}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-2 pt-1">
        {step > 0 && (
          <PressButton type="button" variant="ghost" onClick={() => go(step - 1)} disabled={pending} className="px-3">
            ◀ Bumalik
          </PressButton>
        )}
        <PressButton type="submit" loading={pending} loadingLabel="Sine-save…" className="h-12 flex-1 text-base">
          {last ? "Sumali sa waitlist ▶" : "Susunod ▶"}
        </PressButton>
      </div>
    </form>
  );
}
