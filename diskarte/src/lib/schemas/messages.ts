import { z } from "zod";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MIME, ATTACHMENT_PATH_RE, cleanMessageContent, MESSAGE_MAX } from "@/lib/messages";

export const messageContentSchema = z
  .string()
  .transform(cleanMessageContent)
  .pipe(z.string().max(MESSAGE_MAX, `Messages are ${MESSAGE_MAX} characters max.`));

export const attachmentSchema = z.object({
  path: z.string().max(200).regex(ATTACHMENT_PATH_RE, "Invalid path"),
  name: z.string().min(1).max(120),
  size: z.number().int().positive().max(ATTACHMENT_MAX_BYTES),
  type: z.enum(ATTACHMENT_MIME),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  /** A recorded voice message (shown as a compact player) and its length in seconds. */
  voice: z.boolean().optional(),
  duration: z.number().nonnegative().max(3600).optional(),
});
