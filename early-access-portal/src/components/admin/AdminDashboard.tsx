"use client";

import { Check, ChevronLeft, ChevronRight, LogOut, MailWarning, RotateCcw, Search, Send, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { adminSignOutAction } from "@/app/admin/auth-actions";
import { approveAction, declineAction, reopenAction, resendAction, saveNoteAction, type ReviewResult } from "@/app/admin/actions";
import { Logo } from "@/components/Brand";
import type { WaitlistRow } from "@/lib/approvals";
import type { DashboardData } from "@/lib/data";
import { COMMUNITY_SIZES, COMMUNITY_TYPES, PAGE_SIZE, type ListQuery } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { Dialog } from "./Dialog";

const STATUS_STYLE = {
  pending: "border-sun/40 bg-sun/10 text-sun",
  approved: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300",
  declined: "border-red-400/40 bg-red-500/10 text-red-300",
} as const;

const STATUS_LABEL = { pending: "Pending", approved: "Approved", declined: "Declined" } as const;

const dateFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

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
    <section aria-label="Waitlist stats" className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_1.6fr]">
      {cards.map((c) => (
        <div key={c.label} className="glass rounded-2xl p-4" data-testid={`stat-${c.label.toLowerCase()}`}>
          <p className="font-silk text-[11px] uppercase tracking-wider text-slate-400">{c.label}</p>
          <p className={cn("mt-1 font-pixel text-xl", c.tone)}>{c.value}</p>
        </div>
      ))}
      <div className="glass col-span-2 rounded-2xl p-4 lg:col-span-1">
        <p className="font-silk text-[11px] uppercase tracking-wider text-slate-400">Applications · 7 days</p>
        <div className="mt-2 flex h-14 items-end gap-1.5" role="img" aria-label={stats.last7.map((d) => `${d.day}: ${d.count}`).join(", ")}>
          {stats.last7.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full bg-sun/80" style={{ height: `${Math.max(4, (d.count / max) * 44)}px` }} />
              <span className="text-[9px] text-slate-500">{d.day.slice(8)}</span>
            </div>
          ))}
        </div>
        {stats.email_failed > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-orange-300">
            <MailWarning className="size-3.5" aria-hidden /> {stats.email_failed} approved pero hindi pa na-email
          </p>
        )}
      </div>
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

export function AdminDashboard({ data, query, adminEmail }: { data: DashboardData; query: ListQuery; adminEmail: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<ReviewResult | null>(null);
  const [pending, startTransition] = useTransition();
  const open = data.rows.find((r) => r.id === openId) ?? null;
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const selectable = useMemo(() => data.rows.filter((r) => r.status !== "approved").map((r) => r.id), [data.rows]);
  const allSelected = selectable.length > 0 && selectable.every((id) => selected.has(id));

  function run(action: () => Promise<ReviewResult>, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      setNotice(result);
      if (result.ok || result.outcomes) {
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

  return (
    <main className="diskarte-backdrop relative min-h-dvh">
      <div className="relative z-10 mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <div>
              <p className="font-pixel text-[9px] text-sun">EARLY ACCESS</p>
              <h1 className="text-xl font-extrabold text-white">Review queue</h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span className="hidden sm:inline">{adminEmail}</span>
            <form action={adminSignOutAction}>
              <button type="submit" className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/10">
                <LogOut className="size-4" aria-hidden /> Sign out
              </button>
            </form>
          </div>
        </header>

        <Stats stats={data.stats} />

        {notice && (
          <div
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
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="rounded p-1 hover:bg-white/10">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        <section className="glass rounded-2xl" aria-label="Applications">
          <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-3">
            <nav className="flex gap-1" aria-label="Filter by status">
              {(["pending", "approved", "declined", "all"] as const).map((s) => (
                <Link
                  key={s}
                  href={href(query, { status: s, page: 1 })}
                  aria-current={query.status === s ? "page" : undefined}
                  className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", query.status === s ? "bg-sun text-abyss" : "text-slate-300 hover:bg-white/10")}
                >
                  {s === "all" ? "Lahat" : STATUS_LABEL[s]}
                </Link>
              ))}
            </nav>
            <form action="/admin" className="relative ml-auto w-full sm:w-72" role="search">
              {query.status !== "pending" && <input type="hidden" name="status" value={query.status} />}
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <label htmlFor="admin-search" className="sr-only">
                Search applications
              </label>
              <input
                id="admin-search"
                name="q"
                defaultValue={query.q}
                placeholder="Pangalan, email, komunidad…"
                className="h-10 w-full rounded-xl border border-white/10 bg-black/40 pl-9 pr-3 text-sm text-white outline-none focus:border-sun/60"
              />
            </form>
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-sun/5 px-3 py-2" data-testid="bulk-bar">
              <span className="text-sm font-semibold text-sun">{selected.size} napili</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => approveAction([...selected]))}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                <Check className="size-4" aria-hidden /> Approve {selected.size}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setReason("");
                  setDeclining([...selected]);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                <X className="size-4" aria-hidden /> Decline {selected.size}
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-sm text-slate-400 hover:text-white">
                Clear
              </button>
            </div>
          )}

          {data.rows.length === 0 ? (
            <p className="p-10 text-center text-slate-400">{query.q ? `Walang tumugma sa “${query.q}”.` : "Walang applications dito. 🎉"}</p>
          ) : (
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="w-10 px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={allSelected}
                        disabled={selectable.length === 0}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(selectable))}
                        className="size-4 accent-[#FFB800]"
                      />
                    </th>
                    <th scope="col" className="px-3 py-2.5">Applicant</th>
                    <th scope="col" className="px-3 py-2.5">Community</th>
                    <th scope="col" className="px-3 py-2.5">Applied</th>
                    <th scope="col" className="px-3 py-2.5">Status</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id} className="border-t border-white/5 hover:bg-white/[0.03]" data-testid="application-row" data-status={row.status}>
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
                        <span aria-hidden>{COMMUNITY_TYPES[row.community_type as keyof typeof COMMUNITY_TYPES]?.emoji} </span>
                        {row.community_name || COMMUNITY_TYPES[row.community_type as keyof typeof COMMUNITY_TYPES]?.label}
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
                        <div className="flex justify-end gap-1.5">
                          {row.status !== "approved" && (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => run(() => approveAction([row.id]))}
                              aria-label={`Approve ${row.full_name}`}
                              className="flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                            >
                              <Check className="size-3.5" aria-hidden /> Approve
                            </button>
                          )}
                          {row.status === "pending" && (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => {
                                setReason("");
                                setDeclining([row.id]);
                              }}
                              aria-label={`Decline ${row.full_name}`}
                              className="flex items-center gap-1 rounded-lg border border-red-400/40 px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/15 disabled:opacity-50"
                            >
                              <X className="size-3.5" aria-hidden /> Decline
                            </button>
                          )}
                          <button type="button" onClick={() => openDetail(row)} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10">
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <nav className="flex items-center justify-between border-t border-white/10 px-3 py-2.5 text-sm text-slate-400" aria-label="Pagination">
            <span>
              {data.total} application{data.total === 1 ? "" : "s"} · page {query.page} of {pages}
            </span>
            <span className="flex gap-1">
              {query.page > 1 ? (
                <Link href={href(query, { page: query.page - 1 })} aria-label="Previous page" className="rounded-lg p-1.5 hover:bg-white/10">
                  <ChevronLeft className="size-4" aria-hidden />
                </Link>
              ) : null}
              {query.page < pages ? (
                <Link href={href(query, { page: query.page + 1 })} aria-label="Next page" className="rounded-lg p-1.5 hover:bg-white/10">
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              ) : null}
            </span>
          </nav>
        </section>
      </div>

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
                {COMMUNITY_TYPES[open.community_type as keyof typeof COMMUNITY_TYPES]?.label} {open.community_name && `· ${open.community_name}`}
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
                className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-sun/60"
              />
              <button type="button" disabled={pending || note === open.admin_note} onClick={() => run(() => saveNoteAction(open.id, note))} className="text-xs font-semibold text-sky-300 hover:underline disabled:opacity-40">
                Save note
              </button>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
              {open.status !== "approved" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => approveAction([open.id]), () => setOpenId(null))}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  <Check className="size-4" aria-hidden /> Approve &amp; send credentials
                </button>
              )}
              {open.status === "pending" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setReason("");
                    setDeclining([open.id]);
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-red-400/40 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500/15 disabled:opacity-50"
                >
                  <X className="size-4" aria-hidden /> Decline
                </button>
              )}
              {open.status === "declined" && (
                <button type="button" disabled={pending} onClick={() => run(() => reopenAction(open.id))} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/10">
                  <RotateCcw className="size-4" aria-hidden /> Ibalik sa pending
                </button>
              )}
              {open.status === "approved" && (
                <button type="button" disabled={pending} onClick={() => run(() => resendAction(open.id))} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/10">
                  <Send className="size-4" aria-hidden /> Resend credentials
                </button>
              )}
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={declining !== null} onClose={() => setDeclining(null)} title={`Decline ${declining?.length ?? 0} application${declining?.length === 1 ? "" : "s"}?`} className="max-w-md">
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
              className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-sun/60"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDeclining(null)} className="rounded-xl px-4 py-2 text-sm text-slate-300 hover:bg-white/10">
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const ids = declining ?? [];
                run(
                  () => declineAction(ids, reason),
                  () => {
                    setDeclining(null);
                    setOpenId(null);
                  },
                );
              }}
              className="rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </div>
      </Dialog>
    </main>
  );
}
