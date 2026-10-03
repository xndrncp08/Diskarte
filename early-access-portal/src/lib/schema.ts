import { z } from "zod";

/** Shared by the form (client-side hints), the server action and the admin dashboard labels. */
export const COMMUNITY_TYPES = {
  gaming: { label: "Gaming squad / guild" },
  school: { label: "Study group / student org" },
  streaming: { label: "Streamer / content community" },
  barkada: { label: "Barkada / friends" },
  work: { label: "Startup / work team" },
  other: { label: "Iba pa" },
} as const;

export const COMMUNITY_SIZES = {
  solo: "Ako lang muna",
  "2-10": "2–10",
  "11-50": "11–50",
  "51-200": "51–200",
  "200+": "200+",
} as const;

export type CommunityType = keyof typeof COMMUNITY_TYPES;
export type CommunitySize = keyof typeof COMMUNITY_SIZES;

const clean = (value: string) =>
  value
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‍⁠﻿]/g, "")
    .trim();

const text = (min: number, max: number, messages: { min?: string; max?: string } = {}) =>
  z
    .string()
    .transform(clean)
    .pipe(
      z
        .string()
        .min(min, messages.min ?? `Hindi bababa sa ${min} characters`)
        .max(max, messages.max ?? `Hanggang ${max} characters lang`),
    );

export const applicationSchema = z.object({
  fullName: text(2, 80, { min: "Pakilagay ang buong pangalan mo" }).transform((v) => v.replace(/\s+/g, " ")),
  email: z
    .string()
    .transform((v) => v.trim().toLowerCase())
    .pipe(z.email("Mukhang mali ang email").max(254)),
  preferredUsername: z
    .string()
    .transform((v) => v.trim().replace(/^@/, "").toLowerCase())
    .pipe(z.union([z.literal(""), z.string().regex(/^[a-z0-9_.]{3,32}$/, "3–32 letters, numbers, _ o . lang")]))
    .transform((v) => v || null),
  communityType: z.enum(Object.keys(COMMUNITY_TYPES) as [CommunityType, ...CommunityType[]], { message: "Pumili ng uri ng komunidad" }),
  communityName: text(0, 80),
  communitySize: z.enum(Object.keys(COMMUNITY_SIZES) as [CommunitySize, ...CommunitySize[]], { message: "Pumili ng laki" }),
  referralSource: text(0, 80),
  reason: text(20, 600, { min: "Kwentuhan mo pa kami — hindi bababa sa 20 characters", max: "Hanggang 600 characters lang" }),
  consent: z.literal("on", { message: "Kailangan mong pumayag sa privacy notice" }),
});

export type Application = z.output<typeof applicationSchema>;

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

// ---- admin review --------------------------------------------------------------------------

export const STATUSES = ["pending", "approved", "declined"] as const;
export type WaitlistStatus = (typeof STATUSES)[number];

export const reviewIdsSchema = z.array(z.uuid()).min(1, "Pumili ng kahit isang application").max(50, "Hanggang 50 bawat batch");

export const declineReasonSchema = z
  .string()
  .transform(clean)
  .pipe(z.string().max(300, "Hanggang 300 characters lang"))
  .transform((v) => v || null);

export const adminNoteSchema = z.string().transform(clean).pipe(z.string().max(500, "Hanggang 500 characters lang"));

export const listQuerySchema = z.object({
  status: z.enum(["all", ...STATUSES]).catch("pending"),
  q: z
    .string()
    .transform((v) => clean(v).replace(/[%_,()\\]/g, " ").slice(0, 80))
    .catch(""),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type ListQuery = z.output<typeof listQuerySchema>;
export const PAGE_SIZE = 25;
