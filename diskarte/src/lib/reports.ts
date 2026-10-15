import type { Tables } from "@/lib/supabase/database.types";

export type ProblemReport = Tables<"problem_reports">;

export const REPORT_CATEGORIES = [
  { value: "bug", label: "Something's broken" },
  { value: "slow", label: "It's slow or laggy" },
  { value: "account", label: "Account or sign-in" },
  { value: "other", label: "Something else" },
] as const;

export const REPORT_STATUS_LABEL: Record<ProblemReport["status"], string> = { open: "Open", sent: "Escalated", resolved: "Resolved", dismissed: "Dismissed" };
