import { z } from "zod";


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
