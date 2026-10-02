/** Translate Supabase Auth errors into friendly Taglish without leaking account existence details. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Incorrect email or password.";
  if (m.includes("email not confirmed")) return "Confirm your email first — check your inbox.";
  if (m.includes("already registered") || m.includes("already been registered")) return "An account with this email already exists. Sign in instead.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Take a short break.";
  if (m.includes("password")) return "That password isn't allowed. Use 10+ characters with uppercase, lowercase, a number and a symbol.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) return "Sign-ups are closed on this server.";
  return "Something went wrong. Try again.";
}
