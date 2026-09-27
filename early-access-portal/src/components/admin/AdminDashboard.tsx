"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, ExternalLink, LogOut, MailWarning, RotateCcw, Search, Send, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { adminSignOutAction } from "@/app/admin/auth-actions";
import { approveAction, declineAction, reopenAction, resendAction, saveNoteAction, type ReviewResult } from "@/app/admin/actions";
import { Logo } from "@/components/Brand";
import { EASE_OUT, SPRING } from "@/components/motion/MotionRoot";
import { PressButton } from "@/components/ui/PressButton";
import { useIsCompact } from "@/hooks/useMediaQuery";
import type { WaitlistRow } from "@/lib/approvals";
import type { DashboardData } from "@/lib/data";
import { COMMUNITY_SIZES, COMMUNITY_TYPES, PAGE_SIZE, type ListQuery, type WaitlistStatus } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { CountUp } from "./CountUp";
import { Dialog } from "./Dialog";

const STATUS_STYLE = {
  pending: "border-sun/40 bg-sun/10 text-sun",
  approved: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300",
  declined: "border-red-400/40 bg-red-500/10 text-red-300",
} as const;

const STATUS_LABEL = { pending: "Pending", approved: "Approved", declined: "Declined" } as const;

const dateFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

/** Row enter/exit: slide in from below, fly out sideways when approved/declined out of the view. */
const rowMotion = {
  layout: true,
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: -40, transition: { duration: 0.25, ease: EASE_OUT } },
  transition: { duration: 0.3, ease: EASE_OUT },
} as const;

function href(query: ListQuery, patch: Partial<ListQuery>) {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.status !== "pending") params.set("status", next.status);
  if (next.q) params.set("q", next.q);
  if (next.page > 1) params.set("page", String(next.page));
  const s = params.toString();
  return s ? `/admin?${s}` : "/admin";
}

function StatusBadge({ status }: { status: WaitlistRow["status"] }) {
  return <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>;
}

function community(row: WaitlistRow) {
  return COMMUNITY_TYPES[row.community_type as keyof typeof COMMUNITY_TYPES];
}

function Stats({ stats }: { stats: DashboardData["stats"] }) {
  const max = Math.max(1, ...stats.last7.map((d) => d.count));
  const total = stats.pending + stats.approved + stats.declined;
  const cards = [
    { label: "Pending", value: stats.pending, tone: "text-sun" },
    { label: "Approved", value: stats.approved, tone: "text-emerald-300" },
    { label: "Declined", value: stats.declined, tone: "text-red-300" },
    { label: "Total", value: total, tone: "text-white" },
  ];
  return (
    <section aria-label="Waitlist stats" className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_1.6fr]">
      {cards.map((c, i) => (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.4, ease: EASE_OUT }}
          className="glass rounded-2xl p-4"
          data-testid={`stat-${c.label.toLowerCase()}`}
        >
          <p className="font-silk text-[11px] uppercase tracking-wider text-slate-400">{c.label}</p>
          <CountUp value={c.value} className={cn("mt-1 block font-pixel text-xl", c.tone)} />
        </motion.div>
      ))}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.4, ease: EASE_OUT }} className="glass col-span-2 rounded-2xl p-4 lg:col-span-1">
        <p className="font-silk text-[11px] uppercase tracking-wider text-slate-400">Applications · 7 days</p>
        <div className="mt-2 flex h-14 items-end gap-1.5" role="img" aria-label={stats.last7.map((d) => `${d.day}: ${d.count}`).join(", ")}>
          {stats.last7.map((d, i) => (
            <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <motion.div
                className="w-full origin-bottom bg-sun/80"
                style={{ height: `${Math.max(8, (d.count / max) * 100)}%` }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: 0.3 + i * 0.05, ...SPRING }}
              />
              <span className="text-[9px] text-slate-500">{d.day.slice(8)}</span>
            </div>
          ))}
        </div>
        {stats.email_failed > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-orange-300">
            <MailWarning className="size-3.5" aria-hidden /> {stats.email_failed} approved pero hindi pa na-email
          </p>
        )}
      </motion.div>
    </section>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-silk text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-200">{children || "—"}</dd>
    </div>
  );
}

export function AdminDashboard({ data, query, adminEmail, appUrl }: { data: DashboardData; query: ListQuery; adminEmail: string; appUrl?: string }) {
  const router = useRouter();
  const compact = useIsCompact();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<ReviewResult | null>(null);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const [pending, startTransition] = useTransition();

  // Fresh server data: forget optimistic removals that the server has now confirmed.
  const [seenRows, setSeenRows] = useState(data.rows);
  if (seenRows !== data.rows) {
    setSeenRows(data.rows);
    setGone(new Set());
  }

  const rows = useMemo(() => data.rows.filter((r) => !gone.has(r.id)), [data.rows, gone]);
  const open = data.rows.find((r) => r.id === openId) ?? null;
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const selectable = useMemo(() => rows.filter((r) => r.status !== "approved").map((r) => r.id), [rows]);
  const allSelected = selectable.length > 0 && selectable.every((id) => selected.has(id));

  /**
   * Runs a review action; on success, rows that no longer belong in the current filter animate
   * out immediately (the refreshed server data then confirms it).
   */
  function run(ids: string[], nextStatus: WaitlistStatus | null, action: () => Promise<ReviewResult>, after?: () => void) {
    setBusy((b) => new Set([...b, ...ids]));
    startTransition(async () => {
      const result = await action();
      setNotice(result);
      setBusy((b) => new Set([...b].filter((id) => !ids.includes(id))));
      if (result.ok || result.outcomes) {
        const succeeded = result.outcomes ? result.outcomes.filter((o) => o.result === "approved").map((o) => o.id) : ids;
        if (nextStatus && query.status !== "all" && query.status !== nextStatus) setGone((g) => new Set([...g, ...succeeded]));
        setSelected(new Set());
        after?.();
      }
      router.refresh();
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openDetail(row: WaitlistRow) {
    setOpenId(row.id);
    setNote(row.admin_note);
  }

  const approveOne = (row: WaitlistRow) => run([row.id], "approved", () => approveAction([row.id]));
  const askDecline = (ids: string[]) => {
    setReason("");
    setDeclining(ids);
  };

  const rowActions = (row: WaitlistRow, size: "sm" | "lg") => (
    <>
      {row.status !== "approved" && (
        <PressButton
          type="button"
          variant="success"
          loading={busy.has(row.id)}
          loadingLabel=""
          disabled={pending}
          onClick={() => approveOne(row)}
          aria-label={`Approve ${row.full_name}`}
          className={cn("text-xs", size === "sm" ? "min-h-9 px-2.5 pointer-coarse:min-h-11" : "flex-1")}
        >
          <Check className="size-3.5" aria-hidden /> Approve
        </PressButton>
      )}
      {row.status === "pending" && (
        <PressButton
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => askDecline([row.id])}
          aria-label={`Decline ${row.full_name}`}
          className={cn("border-red-400/40 text-xs text-red-300 hover:bg-red-500/15", size === "sm" ? "min-h-9 px-2.5 pointer-coarse:min-h-11" : "flex-1")}
        >
          <X className="size-3.5" aria-hidden /> Decline
        </PressButton>
      )}
      <PressButton type="button" variant="outline" onClick={() => openDetail(row)} className={cn("text-xs font-semibold", size === "sm" ? "min-h-9 px-2.5 pointer-coarse:min-h-11" : "")}>
        Details
      </PressButton>
    </>
  );

  return (
    <main className="diskarte-backdrop relative min-h-dvh overflow-x-hidden">
      <div className={cn("relative z-10 mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6", selected.size > 0 && compact && "pb-32")}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <div>
              <p className="font-pixel text-[9px] text-sun">EARLY ACCESS</p>
              <h1 className="text-xl font-extrabold text-white">Review queue</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="hidden md:inline">{adminEmail}</span>
            {appUrl && (
              <a href={appUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-slate-300 hover:bg-white/10">
                <ExternalLink className="size-4" aria-hidden /> <span className="hidden sm:inline">Diskarte</span>
                <span className="sr-only sm:hidden">Open Diskarte</span>
              </a>
            )}
            <form action={adminSignOutAction}>
              <button type="submit" className="flex min-h-11 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-slate-300 hover:bg-white/10">
                <LogOut className="size-4" aria-hidden /> Sign out
              </button>
            </form>
          </div>
        </header>

        <Stats stats={data.stats} />

        <AnimatePresence>
          {notice && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              role="status"
              className={cn("flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm", notice.ok ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100" : "border-orange-400/40 bg-orange-500/10 text-orange-100")}
              data-testid="review-notice"
            >
              <div>
                <p className="font-semibold">{notice.message}</p>
                {notice.outcomes
                  ?.filter((o) => o.result === "failed" || (o.result === "approved" && o.error))
                  .map((o) => (
                    <p key={o.id} className="mt-1 text-xs opacity-80">
                      {data.rows.find((r) => r.id === o.id)?.email ?? o.id}: {"error" in o ? o.error : ""}
                    </p>
                  ))}
              </div>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-white/10">
                <X className="size-4" aria-hidden />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <section className="glass rounded-2xl" aria-label="Applications">
          <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-3">
            <nav className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1" aria-label="Filter by status">
              {(["pending", "approved", "declined", "all"] as const).map((s) => (
                <Link
                  key={s}
                  href={href(query, { status: s, page: 1 })}
                  aria-current={query.status === s ? "page" : undefined}
                  className={cn("relative flex min-h-11 shrink-0 items-center rounded-lg px-3.5 text-sm font-semibold transition-colors", query.status === s ? "text-abyss" : "text-slate-300 hover:bg-white/10")}
                >
                  {query.status === s && <motion.span layoutId="status-pill" className="absolute inset-0 rounded-lg bg-sun" transition={SPRING} aria-hidden />}
                  <span className="relative">{s === "all" ? "Lahat" : STATUS_LABEL[s]}</span>
                </Link>
              ))}
            </nav>
            <form action="/admin" className="relative w-full sm:ml-auto sm:w-72" role="search">
              {query.status !== "pending" && <input type="hidden" name="status" value={query.status} />}
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <label htmlFor="admin-search" className="sr-only">
                Search applications
              </label>
              <input
                id="admin-search"
                name="q"
                type="search"
                enterKeyHint="search"
                defaultValue={query.q}
                placeholder="Pangalan, email, komunidad…"
                className="h-11 w-full rounded-xl border border-white/10 bg-black/40 pl-9 pr-3 text-base text-white outline-none focus:border-sun/60 sm:text-sm"
              />
            </form>
          </div>

          {rows.length === 0 ? (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-10 text-center text-slate-400">
              {query.q ? `Walang tumugma sa “${query.q}”.` : "Walang applications dito. 🎉"}
            </motion.p>
          ) : compact ? (
            <>
              <label className="flex min-h-11 items-center gap-3 border-b border-white/10 px-4 text-sm text-slate-300">
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  checked={allSelected}
                  disabled={selectable.length === 0}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(selectable))}
                  className="size-5 accent-[#FFB800]"
                />
                Piliin lahat
              </label>
              <ul className="divide-y divide-white/5" aria-label="Applications list">
                <AnimatePresence initial={false}>
                  {rows.map((row) => (
                    <motion.li key={row.id} {...rowMotion} className="space-y-3 p-4" data-testid="application-row" data-status={row.status}>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.full_name}`}
                          checked={selected.has(row.id)}
                          disabled={row.status === "approved"}
                          onChange={() => toggle(row.id)}
                          className="mt-1 size-5 shrink-0 accent-[#FFB800]"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-white">{row.full_name}</p>
                          <p className="truncate text-xs text-slate-400">{row.email}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {community(row)?.emoji} {row.community_name || community(row)?.label} · {dateFmt.format(new Date(row.created_at))}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <StatusBadge status={row.status} />
                          {row.status === "approved" && !row.email_sent_at && <span className="text-[11px] text-orange-300">email failed</span>}
                        </div>
                      </div>
                      <div className="flex gap-2">{rowActions(row, "lg")}</div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </>
          ) : (
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="w-12 px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={allSelected}
                        disabled={selectable.length === 0}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(selectable))}
                        className="size-4 accent-[#FFB800]"
                      />
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Applicant
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Community
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Applied
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {rows.map((row) => (
                      <motion.tr key={row.id} {...rowMotion} className={cn("border-t border-white/5 hover:bg-white/[0.03]", busy.has(row.id) && "opacity-70")} data-testid="application-row" data-status={row.status}>
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.full_name}`}
                            checked={selected.has(row.id)}
                            disabled={row.status === "approved"}
                            onChange={() => toggle(row.id)}
                            className="size-4 accent-[#FFB800]"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <button type="button" onClick={() => openDetail(row)} className="text-left">
                            <span className="block font-semibold text-white hover:underline">{row.full_name}</span>
                            <span className="block text-xs text-slate-400">{row.email}</span>
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-slate-300">
                          <span aria-hidden>{community(row)?.emoji} </span>
                          {row.community_name || community(row)?.label}
                          <span className="block text-xs text-slate-500">{COMMUNITY_SIZES[row.community_size as keyof typeof COMMUNITY_SIZES] ?? row.community_size}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-400">{dateFmt.format(new Date(row.created_at))}</td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={row.status} />
                          {row.status === "approved" && !row.email_sent_at && (
                            <span className="mt-1 flex items-center gap-1 text-xs text-orange-300">
                              <MailWarning className="size-3.5" aria-hidden /> email failed
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1.5">{rowActions(row, "sm")}</div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}

          <nav className="flex items-center justify-between border-t border-white/10 px-3 py-1.5 text-sm text-slate-400" aria-label="Pagination">
            <span>
              {data.total} application{data.total === 1 ? "" : "s"} · page {query.page} of {pages}
            </span>
            <span className="flex gap-1">
              {query.page > 1 ? (
                <Link href={href(query, { page: query.page - 1 })} aria-label="Previous page" className="flex size-11 items-center justify-center rounded-xl hover:bg-white/10">
                  <ChevronLeft className="size-4" aria-hidden />
                </Link>
              ) : null}
              {query.page < pages ? (
                <Link href={href(query, { page: query.page + 1 })} aria-label="Next page" className="flex size-11 items-center justify-center rounded-xl hover:bg-white/10">
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              ) : null}
            </span>
          </nav>
        </section>
      </div>

      {/* Bulk actions: inline on desktop, a thumb-reach bar pinned to the bottom on phones. */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: compact ? 80 : -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: compact ? 80 : -8, opacity: 0 }}
            transition={SPRING}
            className={cn(
              "z-40 flex items-center gap-2",
              compact
                ? "glass-strong fixed inset-x-0 bottom-0 rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
                : "glass-strong fixed bottom-6 left-1/2 -translate-x-1/2 rounded-2xl px-4 py-3 shadow-2xl shadow-black/60",
            )}
            data-testid="bulk-bar"
          >
            <span className="mr-1 text-sm font-semibold text-sun">{selected.size} napili</span>
            <PressButton type="button" variant="success" disabled={pending} onClick={() => run([...selected], "approved", () => approveAction([...selected]))} className="flex-1 text-sm sm:flex-none">
              <Check className="size-4" aria-hidden /> Approve {selected.size}
            </PressButton>
            <PressButton type="button" variant="danger" disabled={pending} onClick={() => askDecline([...selected])} className="flex-1 text-sm sm:flex-none">
              <X className="size-4" aria-hidden /> Decline {selected.size}
            </PressButton>
            <button type="button" onClick={() => setSelected(new Set())} className="min-h-11 px-2 text-sm text-slate-400 hover:text-white">
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={open !== null} onClose={() => setOpenId(null)} title={open?.full_name ?? ""}>
        {open && (
          <div className="space-y-5" data-testid="application-detail">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={open.status} />
              <span className="text-xs text-slate-500">Applied {dateFmt.format(new Date(open.created_at))}</span>
              {open.reviewed_at && <span className="text-xs text-slate-500">· reviewed {dateFmt.format(new Date(open.reviewed_at))}</span>}
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Email">{open.email}</Detail>
              <Detail label="Gustong username">{open.preferred_username ? `@${open.preferred_username}` : ""}</Detail>
              <Detail label="Community">
                {community(open)?.label} {open.community_name && `· ${open.community_name}`}
              </Detail>
              <Detail label="Size">{COMMUNITY_SIZES[open.community_size as keyof typeof COMMUNITY_SIZES]}</Detail>
              <Detail label="Referral">{open.referral_source}</Detail>
              <Detail label="Email delivery">
                {open.status !== "approved" ? "" : open.email_sent_at ? `Sent ${dateFmt.format(new Date(open.email_sent_at))} (${open.email_attempts}×)` : `Hindi na-send: ${open.email_error ?? "unknown"}`}
              </Detail>
            </dl>
            <div>
              <p className="font-silk text-[10px] uppercase tracking-wider text-slate-500">Bakit gustong sumali</p>
              <blockquote className="mt-1 whitespace-pre-wrap rounded-xl bg-white/5 p-3 text-sm text-slate-200">{open.reason}</blockquote>
            </div>
            {open.decline_reason && <Detail label="Decline reason">{open.decline_reason}</Detail>}
            <div className="space-y-1.5">
              <label htmlFor="admin-note" className="font-silk text-[10px] uppercase tracking-wider text-slate-500">
                Internal note
              </label>
              <textarea
                id="admin-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={2}
                className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-base text-white outline-none focus:border-sun/60 sm:text-sm"
              />
              <button type="button" disabled={pending || note === open.admin_note} onClick={() => run([], null, () => saveNoteAction(open.id, note))} className="min-h-11 text-xs font-semibold text-sky-300 hover:underline disabled:opacity-40">
                Save note
              </button>
            </div>
            <div className="flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:flex-wrap">
              {open.status !== "approved" && (
                <PressButton type="button" variant="success" loading={busy.has(open.id)} disabled={pending} onClick={() => run([open.id], "approved", () => approveAction([open.id]), () => setOpenId(null))}>
                  <Check className="size-4" aria-hidden /> Approve &amp; send credentials
                </PressButton>
              )}
              {open.status === "pending" && (
                <PressButton type="button" variant="outline" disabled={pending} onClick={() => askDecline([open.id])} className="border-red-400/40 text-red-300 hover:bg-red-500/15">
                  <X className="size-4" aria-hidden /> Decline
                </PressButton>
              )}
              {open.status === "declined" && (
                <PressButton type="button" variant="outline" disabled={pending} onClick={() => run([open.id], "pending", () => reopenAction(open.id))}>
                  <RotateCcw className="size-4" aria-hidden /> Ibalik sa pending
                </PressButton>
              )}
              {open.status === "approved" && (
                <PressButton type="button" variant="outline" loading={busy.has(open.id)} disabled={pending} onClick={() => run([open.id], null, () => resendAction(open.id))}>
                  <Send className="size-4" aria-hidden /> Resend credentials
                </PressButton>
              )}
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={declining !== null} onClose={() => setDeclining(null)} title={`Decline ${declining?.length ?? 0} application${declining?.length === 1 ? "" : "s"}?`} className="sm:max-w-md">
        <div className="space-y-4">
          <p className="text-sm text-slate-400">Walang email na ipapadala. Pwedeng ibalik sa pending anumang oras.</p>
          <div className="space-y-1.5">
            <label htmlFor="decline-reason" className="font-silk text-[10px] uppercase tracking-wider text-slate-500">
              Reason (internal, optional)
            </label>
            <textarea
              id="decline-reason"
              data-autofocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              rows={3}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-base text-white outline-none focus:border-sun/60 sm:text-sm"
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <PressButton type="button" variant="ghost" onClick={() => setDeclining(null)}>
              Cancel
            </PressButton>
            <PressButton
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() => {
                const ids = declining ?? [];
                run(ids, "declined", () => declineAction(ids, reason), () => {
                  setDeclining(null);
                  setOpenId(null);
                });
              }}
            >
              Decline
            </PressButton>
          </div>
        </div>
      </Dialog>
    </main>
  );
}
