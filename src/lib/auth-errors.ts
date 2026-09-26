/** Translate Supabase Auth errors into friendly Taglish without leaking account existence details. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Mali ang email o password.";
  if (m.includes("email not confirmed")) return "I-confirm muna ang email mo — check your inbox.";
  if (m.includes("already registered") || m.includes("already been registered")) return "May account na ang email na 'to. Mag-log in ka na lang.";
  if (m.includes("rate limit") || m.includes("too many")) return "Masyadong maraming attempts. Pahinga muna saglit.";
  if (m.includes("password")) return "Hindi pwede ang password na 'yan. Gumamit ng mas mahaba o mas kakaiba.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) return "Sarado muna ang sign-ups sa server na 'to.";
  return "May nangyaring mali. Subukan ulit.";
}
