"use client";

import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import { submitReportAction } from "@/actions/reports";
import { Button } from "@/components/ui/Button";

/**
 * "Suggest an improvement" for one page. Signed-in readers send it to the existing problem-report
 * queue (validated, 5 per hour, triaged in the Control Center); everyone can open a GitHub issue.
 * Only the text and the page path are sent — no browser details.
 */
export function DocsFeedback({ slug, title, issueUrl }: { slug: string; title: string; issueUrl: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" | "error" | "signed-out"; message?: string }>({ kind: "idle" });

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ kind: "sending" });
    const result = await submitReportAction({ category: "other", description: `[Docs] /docs/${slug}: ${text.trim()}`, pageUrl: `/docs/${slug}`, userAgent: null }).catch(() => ({ ok: false, error: "Couldn't send. Check your connection." }));
    if (result.ok) setState({ kind: "sent" });
    else if (result.error?.includes("signed out")) setState({ kind: "signed-out" });
    else setState({ kind: "error", message: result.error });
  };

  return (
    <section aria-labelledby="docs-feedback-title" className="docs-feedback">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="docs-feedback-title" className="text-sm font-semibold text-[var(--text-primary)]">Something unclear or out of date on this page?</h2>
        {!open && state.kind !== "sent" && (
          <button type="button" onClick={() => setOpen(true)} className="docs-link-button">
            <MessageSquareText className="size-4" aria-hidden /> Suggest an improvement
          </button>
        )}
      </div>
      {state.kind === "sent" ? (
        <p role="status" className="mt-2 text-sm text-[var(--text-secondary)]">Thanks — the Diskarte team will review it.</p>
      ) : open && (
        <form onSubmit={send} className="mt-3 space-y-2">
          <label htmlFor="docs-feedback-text" className="block text-sm text-[var(--text-secondary)]">What should we fix or add? Don’t include passwords or personal details.</label>
          <textarea id="docs-feedback-text" value={text} onChange={(e) => setText(e.target.value)} required minLength={10} maxLength={1800} rows={3} className="docs-input w-full" />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" loading={state.kind === "sending"} disabled={text.trim().length < 10}>Send feedback</Button>
            <a href={`${issueUrl}?title=${encodeURIComponent(`Docs: ${title}`)}&body=${encodeURIComponent(`Page: /docs/${slug}\n\n${text}`)}`} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--text-accent)] underline-offset-2 hover:underline">
              Open a GitHub issue instead
            </a>
          </div>
          <p role="status" className="text-sm text-[var(--text-secondary)]">
            {state.kind === "signed-out" ? (<>Sign in to send feedback here, or use the GitHub link. <a href={`/login?next=/docs/${slug}`} className="text-[var(--text-accent)] underline">Sign in</a></>) : state.kind === "error" ? state.message : null}
          </p>
        </form>
      )}
    </section>
  );
}
