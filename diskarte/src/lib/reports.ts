import type { Tables } from "@/lib/supabase/database.types";

export type ProblemReport = Tables<"problem_reports">;

export const REPORT_CATEGORIES = [
  { value: "bug", label: "Something's broken" },
  { value: "slow", label: "It's slow or laggy" },
  { value: "account", label: "Account or sign-in" },
  { value: "other", label: "Something else" },
] as const;

export const REPORT_STATUS_LABEL: Record<ProblemReport["status"], string> = { open: "Open", sent: "With fix agent", resolved: "Resolved", dismissed: "Dismissed" };

/** Prefilled issue text for the fix agent. Admins edit it before sending: the issue is public, so no names or emails. */
export function issueDraft(report: Pick<ProblemReport, "category" | "description" | "page_url" | "user_agent" | "created_at">) {
  const category = REPORT_CATEGORIES.find((c) => c.value === report.category)?.label ?? report.category;
  const title = `${category}: ${report.description.replace(/\s+/g, " ").slice(0, 80)}`;
  const body = [
    "## What the user reported",
    report.description,
    "",
    "## Context",
    `- Category: ${category}`,
    `- Page: ${report.page_url ?? "unknown"}`,
    `- Browser: ${report.user_agent ?? "unknown"}`,
    `- Reported: ${report.created_at}`,
  ].join("\n");
  return { title, body };
}
