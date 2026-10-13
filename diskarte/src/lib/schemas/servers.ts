import { z } from "zod";
import { stripControl } from "@/lib/profile";
import { slugifyChannelName } from "@/lib/servers";
import type { ChannelType } from "@/lib/supabase/database.types";

// ---------------------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------------------

const cleanLine = (max: number, min = 0, message?: string) =>
  z
    .string()
    .transform((v) => stripControl(v).trim())
    .pipe(z.string().min(min, message ?? `At least ${min} characters`).max(max, `${max} characters max`));

export const serverSchema = z.object({
  name: cleanLine(64, 2, "Server names must be 2–64 characters"),
  description: z
    .string()
    .transform((v) => stripControl(v, true).trim())
    .pipe(z.string().max(280, "280 characters max")),
});

export const channelSchema = z
  .object({
    name: z.string(),
    type: z.enum(["text", "voice", "forum"]),
    category: cleanLine(32, 1, "Choose a category"),
    topic: cleanLine(256),
  })
  .transform((v, ctx) => {
    const name = v.type !== "voice" ? slugifyChannelName(v.name) : stripControl(v.name).trim().slice(0, 32);
    if (!name) {
      ctx.addIssue({ code: "custom", path: ["name"], message: "Give the channel a name" });
      return z.NEVER;
    }
    return { ...v, name, type: v.type as ChannelType };
  });

export const uuidSchema = z.uuid();
