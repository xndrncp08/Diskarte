import { z } from "zod";
import { BODY_MAX, BROADCAST_TARGETS, BROADCAST_TONES, PLATFORM_ROLES, TITLE_MAX } from "@/lib/admin";

export const broadcastSchema = z.object({
  title: z.string().trim().min(1, "Give the announcement a title").max(TITLE_MAX, `Keep the title under ${TITLE_MAX} characters`),
  body: z.string().trim().min(1, "Write something to broadcast").max(BODY_MAX, `Keep it under ${BODY_MAX} characters`),
  tone: z.enum(BROADCAST_TONES),
  targets: z.array(z.enum(BROADCAST_TARGETS)).min(1, "Pick at least one channel").max(2),
  sticky: z.boolean(),
  stickyHours: z.number().int().min(1).max(720).nullable(),
});
export type BroadcastInput = z.infer<typeof broadcastSchema>;

export const roleChangeSchema = z.object({ userId: z.uuid(), role: z.enum(PLATFORM_ROLES) });
export const statusOverrideSchema = z.object({
  userId: z.uuid(),
  status: z.enum(["online", "idle", "dnd", "invisible"]),
  customStatus: z.string().trim().max(64, "Keep it under 64 characters").nullable(),
});
export const banSchema = z.object({
  userId: z.uuid(),
  hours: z.number().int().min(1).max(8760).nullable(),
  reason: z.string().trim().max(300, "Keep the reason under 300 characters"),
});
export const userIdSchema = z.object({ userId: z.uuid() });
export const broadcastIdSchema = z.object({ broadcastId: z.uuid() });
