import { z } from "zod";


export const reportSchema = z.object({
  category: z.enum(["bug", "slow", "account", "other"]),
  description: z.string().trim().min(10, "Tell us a bit more (at least 10 characters)").max(2000, "Keep it under 2000 characters"),
  pageUrl: z.string().max(500).nullable(),
  userAgent: z.string().max(500).nullable(),
});

export const reportStatusSchema = z.object({ reportId: z.uuid(), status: z.enum(["open", "resolved", "dismissed"]) });
