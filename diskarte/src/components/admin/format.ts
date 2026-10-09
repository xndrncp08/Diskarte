/** Compact, tabular-friendly time labels for the Control Center. */

const absolute = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const dateOnly = new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric" });

export function formatAbsolute(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? absolute.format(t) : "—";
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? dateOnly.format(t) : "—";
}

/** "now", "45s ago", "12m ago", "3h ago", "5d ago". */
export function formatAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "never";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 10) return "now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Call length as m:ss or h:mm:ss. */
export function formatDuration(fromIso: string | null | undefined, now: number): string {
  if (!fromIso) return "—";
  const total = Math.max(0, Math.floor((now - Date.parse(fromIso)) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "until Oct 8, 14:00" or "permanently". */
export function formatBanUntil(iso: string | null): string {
  if (!iso) return "";
  if (iso === "infinity" || !Number.isFinite(Date.parse(iso))) return "permanently";
  return `until ${formatAbsolute(iso)}`;
}
