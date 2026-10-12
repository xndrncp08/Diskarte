"use client";

import { CheckCircle2 } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { submitReportAction } from "@/actions/reports";
import { Button } from "@/components/ui/Button";
import { TextareaField } from "@/components/ui/Field";
import { REPORT_CATEGORIES } from "@/lib/reports";
import { cn } from "@/lib/utils";

type Category = (typeof REPORT_CATEGORIES)[number]["value"];

/** "Something's wrong" in plain words: what kind of problem, what happened. The page and browser ride along. */
export function ReportProblemForm() {
  const [category, setCategory] = useState<Category>("bug");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await submitReportAction({
        category,
        description,
        pageUrl: window.location.pathname.slice(0, 500),
        userAgent: navigator.userAgent.slice(0, 500),
      });
      if (!result.ok) return setError(result.fieldErrors?.description ?? result.error ?? "Your report didn't go through. Try again.");
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center" role="status">
        <CheckCircle2 className="mx-auto size-10 text-emerald-400" aria-hidden />
        <div>
          <p className="text-lg font-bold text-white">Salamat! We got your report.</p>
          <p className="mt-1 text-sm text-slate-400">The Diskarte team will look into it.</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setSent(false);
            setDescription("");
            setError(null);
          }}
        >
          Report something else
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-lg space-y-5">
      <div role="radiogroup" aria-label="What kind of problem?" className="grid gap-2 sm:grid-cols-2">
        {REPORT_CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={category === c.value}
            onClick={() => setCategory(c.value)}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition-colors pointer-coarse:min-h-11",
              category === c.value ? "border-sun/60 bg-sun/10 text-white" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <TextareaField
        label="What happened?"
        hint="What you were doing, what you expected, and what went wrong instead."
        value={description}
        onChange={(e) => {
          setDescription(e.target.value);
          setError(null);
        }}
        maxLength={2000}
        rows={6}
        required
        error={error}
        placeholder="I clicked #general and the messages never loaded…"
      />
      <p className="text-xs text-slate-500">We&apos;ll include the page you&apos;re on and your browser. Please don&apos;t share passwords or other private info.</p>
      <Button type="submit" loading={pending} disabled={description.trim().length < 10}>
        Send report
      </Button>
    </form>
  );
}
