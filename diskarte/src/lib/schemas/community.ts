import { z } from "zod";


const mobile = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^\+?63/, "0"))
  .pipe(z.string().regex(/^09\d{9}$/, "Dapat 11-digit PH mobile number (09XXXXXXXXX)."));

export const supportSettingsSchema = z.object({
  gcashNumber: z.union([z.literal(""), mobile]).transform((v) => v || null),
  mayaNumber: z.union([z.literal(""), mobile]).transform((v) => v || null),
  supportNote: z
    .string()
    .transform((v) => v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(280, "280 characters max")),
});

export const automodSettingsSchema = z.object({
  enabled: z.boolean(),
  categories: z.array(z.enum(["spam", "phishing", "hate", "explicit"])).max(4),
  customTerms: z
    .array(z.string())
    .transform((terms) => Array.from(new Set(terms.map((t) => t.trim().toLowerCase()).filter(Boolean))))
    .pipe(z.array(z.string().min(2, "Min 2 characters bawat salita").max(60, "Hanggang 60 characters bawat salita")).max(100, "Up to 100 custom words")),
});

export const lfgSchema = z.object({
  game: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Anong laro?").max(48, "48 characters max")),
  description: z
    .string()
    .transform((v) => v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(200, "200 characters max")),
  partySize: z.coerce.number().int().min(2).max(10),
  durationMinutes: z.coerce.number().int().min(15).max(240),
  voiceChannelId: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
});
