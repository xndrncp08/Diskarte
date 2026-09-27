/**
 * Temporary passwords for approved applicants. They satisfy Diskarte's password policy
 * (10+ characters with lower, upper, digit and symbol — see the main app's lib/profile.ts and
 * supabase/config.toml), avoid look-alike characters so they survive being retyped from an email,
 * and come from a CSPRNG with rejection sampling (no modulo bias).
 */
export const TEMP_PASSWORD_LENGTH = 16;

export const CHARSETS = {
  lower: "abcdefghijkmnpqrstuvwxyz",
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  digit: "23456789",
  symbol: "!@#$%*?-+=",
} as const;

const ALL = Object.values(CHARSETS).join("");

type RandomSource = (bytes: Uint8Array) => Uint8Array;
const defaultRandom: RandomSource = (bytes) => crypto.getRandomValues(bytes);

/** Uniform integer in [0, max) from the random source. */
function randomIndex(max: number, random: RandomSource): number {
  const limit = 256 - (256 % max);
  const buf = new Uint8Array(1);
  for (;;) {
    random(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

export function generateTempPassword(length = TEMP_PASSWORD_LENGTH, random: RandomSource = defaultRandom): string {
  if (length < 10) throw new Error("Temporary passwords must be at least 10 characters");
  const chars = Object.values(CHARSETS).map((set) => set[randomIndex(set.length, random)]);
  while (chars.length < length) chars.push(ALL[randomIndex(ALL.length, random)]);
  // Fisher–Yates so the guaranteed characters aren't always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, random);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function meetsPasswordPolicy(password: string): boolean {
  return password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
}
