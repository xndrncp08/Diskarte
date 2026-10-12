import { z } from "zod";
import type { Tables } from "@/lib/supabase/database.types";

export type ProblemReport = Tables<"problem_reports">;

export const REPORT_CATEGORIES = [
  { value: "bug", label: "Something's broken" },
  { value: "slow", label: "It's slow or laggy" },
  { value: "account", label: "Account or sign-in" },
  { value: "other", label: "Something else" },
] as const;

export const REPORT_STATUS_LABEL: Record<ProblemReport["status"], string> = { open: "Open", sent: "With fix agent", resolved: "Resolved", dismissed: "Dismissed" };

export const reportSchema = z.object({
  category: z.enum(["bug", "slow", "account", "other"]),
  description: z.string().trim().min(10, "Tell us a bit more (at least 10 characters)").max(2000, "Keep it under 2000 characters"),
  pageUrl: z.string().max(500).nullable(),
  userAgent: z.string().max(500).nullable(),
});

export const fixAgentSchema = z.object({
  reportId: z.uuid(),
  title: z.string().trim().min(5, "Give the issue a title").max(120, "Keep the title under 120 characters"),
  body: z.string().trim().min(10, "Describe the problem for the fix agent").max(6000, "Keep it under 6000 characters"),
});

export const reportStatusSchema = z.object({ reportId: z.uuid(), status: z.enum(["open", "resolved", "dismissed"]) });

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
