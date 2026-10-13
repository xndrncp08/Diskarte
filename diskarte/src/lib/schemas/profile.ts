import { z } from "zod";
import { isGlyphCode } from "@/lib/glyphs";
import { AVATAR_PRESET_KEYS, BANNER_PRESET_KEYS, isAllowedImageUrl, PASSWORD_MISMATCH, PASSWORD_RULES, stripControl, type AvatarPreset, type BannerPreset } from "@/lib/profile";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,32}$/, "3–32 characters: letters, numbers, underscores or periods only.");

const imageUrl = z
  .string()
  .trim()
  .max(1024)
  .refine((v) => v === "" || isAllowedImageUrl(v), "Invalid image URL")
  .transform((v) => (v === "" ? null : v));

export const profileUpdateSchema = z.object({
  username: usernameSchema,
  displayName: z
    .string()
    .transform((v) => stripControl(v).trim())
    .pipe(z.string().min(1, "What should we call you?").max(32, "32 characters max")),
  bio: z
    .string()
    .transform((v) => stripControl(v, true).trim())
    .pipe(z.string().max(190, "Bio is 190 characters max")),
  avatarPreset: z.enum(AVATAR_PRESET_KEYS as [AvatarPreset, ...AvatarPreset[]]),
  bannerPreset: z.enum(BANNER_PRESET_KEYS as [BannerPreset, ...BannerPreset[]]),
  avatarUrl: imageUrl.nullable().optional(),
  bannerUrl: imageUrl.nullable().optional(),
  status: z.enum(["online", "idle", "dnd", "invisible"]),
  customStatus: z
    .string()
    .transform((v) => stripControl(v).trim())
    .pipe(z.string().max(64, "64 characters max"))
    .transform((v) => (v === "" ? null : v)),
  // The custom status icon is a glyph code (vector icon), never an emoji.
  customStatusEmoji: z
    .string()
    .trim()
    .refine((v) => v === "" || isGlyphCode(v), "Pick a status icon")
    .transform((v) => (v === "" ? null : v)),
});

export type ProfileUpdateInput = z.input<typeof profileUpdateSchema>;
export type ProfileUpdate = z.output<typeof profileUpdateSchema>;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("That email doesn't look right"));

/** Strong password policy for new/changed passwords (bcrypt only reads the first 72 bytes). */
export const passwordSchema = z
  .string()
  .max(72, "72 characters max")
  .refine((v) => new TextEncoder().encode(v).length <= 72, "That password is too long")
  .superRefine((value, ctx) => {
    const missing = PASSWORD_RULES.filter((r) => !r.test(value)).map((r) => r.label);
    if (missing.length) ctx.addIssue({ code: "custom", message: `Password needs: ${missing.join(", ")}.` });
  });

/** Sign-in only checks shape — policy is enforced when passwords are set, never revealed on login. */
export const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(72, "72 characters max"),
});

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    username: usernameSchema,
    displayName: z
      .string()
      .transform((v) => stripControl(v).trim())
      .pipe(z.string().min(1, "What should we call you?").max(32)),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: PASSWORD_MISMATCH });
