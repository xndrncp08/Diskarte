// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { approveApplications, declineApplications, newAccountMetadata, resendCredentials, type ApprovalDeps, type WaitlistRow } from "@/lib/approvals";
import type { EmailMessage } from "@/lib/email/template";
import { meetsPasswordPolicy } from "@/lib/password";

function row(id: string, patch: Partial<WaitlistRow> = {}): WaitlistRow {
  return {
    id,
    full_name: `Applicant ${id}`,
    email: `${id}@example.ph`,
    preferred_username: `user_${id}`,
    community_type: "gaming",
    community_name: "",
    community_size: "2-10",
    referral_source: "",
    reason: "Gusto ko lang talagang sumali sa Diskarte.",
    status: "pending",
    decline_reason: null,
    admin_note: "",
    reviewed_by: null,
    reviewed_at: null,
    approved_user_id: null,
    email_sent_at: null,
    email_error: null,
    email_attempts: 0,
    created_at: "2026-09-27T00:00:00Z",
    updated_at: "2026-09-27T00:00:00Z",
    ...patch,
  };
}

/** In-memory stand-in that enforces the same transitions as the DB trigger. */
function harness(rows: WaitlistRow[], opts: { existing?: string[]; failAuthFor?: string[]; failMailFor?: string[] } = {}) {
  const store = new Map(rows.map((r) => [r.id, { ...r }]));
  const mails: EmailMessage[] = [];
  const created: { email: string; password: string; metadata: Record<string, unknown> }[] = [];
  const resets: { userId: string; password: string }[] = [];
  const transition = (r: WaitlistRow, to: WaitlistRow["status"]) => {
    const ok = (r.status === "pending" && to !== "pending") || (r.status === "declined" && to !== "declined");
    if (!ok) throw new Error(`INVALID_TRANSITION ${r.status} -> ${to}`);
    r.status = to;
  };
  let n = 0;
  const deps: ApprovalDeps = {
    db: {
      load: async (ids) => ids.map((id) => store.get(id)).filter((r): r is WaitlistRow => Boolean(r)).map((r) => ({ ...r })),
      markApproved: async (id, userId) => {
        const r = store.get(id)!;
        transition(r, "approved");
        r.approved_user_id = userId;
      },
      markDeclined: async (ids, reason) => {
        for (const id of ids) {
          const r = store.get(id)!;
          transition(r, "declined");
          r.decline_reason = reason;
        }
        return ids.length;
      },
      recordEmail: async (id, result) => {
        const r = store.get(id)!;
        Object.assign(r, { email_sent_at: result.sentAt, email_error: result.error, email_attempts: result.attempts });
      },
    },
    auth: {
      createUser: vi.fn(async (input) => {
        if (opts.failAuthFor?.includes(input.email)) throw new Error("Unable to validate email address");
        if (opts.existing?.includes(input.email)) return { exists: true as const };
        created.push(input);
        return { id: `user-${++n}` };
      }),
      resetPassword: vi.fn(async (userId, password) => void resets.push({ userId, password })),
    },
    mail: vi.fn(async (message: EmailMessage) => {
      if (opts.failMailFor?.includes(message.to)) throw new Error("Resend 422: invalid recipient");
      mails.push(message);
      return { id: `mail-${mails.length}` };
    }),
    urls: { login: "https://diskarte.ph/login", assets: "https://early.diskarte.ph" },
    now: () => new Date("2026-09-27T01:00:00Z"),
  };
  return { deps, store, mails, created, resets };
}

describe("approving applications", () => {
  it("pending → approved: creates a confirmed account with a policy-compliant temp password and emails it", async () => {
    const h = harness([row("a")]);
    const outcomes = await approveApplications(["a"], h.deps);
    expect(outcomes).toEqual([{ id: "a", result: "approved", emailed: true, existingAccount: false }]);
    expect(h.store.get("a")).toMatchObject({ status: "approved", approved_user_id: "user-1", email_sent_at: "2026-09-27T01:00:00.000Z", email_attempts: 1 });

    const account = h.created[0];
    expect(account.email).toBe("a@example.ph");
    expect(meetsPasswordPolicy(account.password)).toBe(true);
    expect(account.metadata).toEqual({ display_name: "Applicant a", username: "user_a", must_change_password: true, source: "early_access" });
    // The same password is emailed, and never surfaces in the outcome returned to the dashboard.
    expect(h.mails[0].text).toContain(account.password);
    expect(h.mails[0].html).toContain("https://diskarte.ph/login");
    expect(JSON.stringify(outcomes)).not.toContain(account.password);
  });

  it("handles a bulk batch independently: skips approved rows, isolates failures", async () => {
    const h = harness([row("a"), row("b", { status: "approved", approved_user_id: "u" }), row("c", { status: "declined" }), row("d")], { failAuthFor: ["d@example.ph"] });
    const outcomes = await approveApplications(["a", "b", "c", "d", "missing"], h.deps);
    expect(outcomes.map((o) => [o.id, o.result])).toEqual([
      ["a", "approved"],
      ["b", "skipped"],
      ["c", "approved"],
      ["d", "failed"],
      ["missing", "skipped"],
    ]);
    expect(h.store.get("c")!.status).toBe("approved"); // declined → approved is allowed
    expect(h.store.get("d")!.status).toBe("pending"); // no account, no transition
    expect(h.mails).toHaveLength(2);
  });

  it("keeps the approval when email delivery fails, recording the error for a resend", async () => {
    const h = harness([row("a")], { failMailFor: ["a@example.ph"] });
    const [outcome] = await approveApplications(["a"], h.deps);
    expect(outcome).toMatchObject({ result: "approved", emailed: false, error: expect.stringContaining("invalid recipient") });
    expect(h.store.get("a")).toMatchObject({ status: "approved", email_sent_at: null, email_error: expect.stringContaining("invalid recipient"), email_attempts: 1 });
  });

  it("approves people who already have an account without issuing a password", async () => {
    const h = harness([row("a")], { existing: ["a@example.ph"] });
    const [outcome] = await approveApplications(["a"], h.deps);
    expect(outcome).toMatchObject({ result: "approved", existingAccount: true, emailed: true });
    expect(h.store.get("a")!.approved_user_id).toBeNull();
    expect(h.mails[0].text).toMatch(/May account ka na/);
    expect(h.mails[0].text).not.toMatch(/Temporary password/);
  });

  it("omits the username when the applicant didn't ask for one", () => {
    expect(newAccountMetadata({ full_name: "A Really Long Name That Goes Past Thirty Two Chars", preferred_username: null })).toEqual({
      display_name: "A Really Long Name That Goes Pas",
      must_change_password: true,
      source: "early_access",
    });
  });
});

describe("declining and resending", () => {
  it("declines pending rows but never un-approves anyone", async () => {
    const h = harness([row("a"), row("b", { status: "approved" })]);
    expect(await declineApplications(["a", "b"], "Puno na ang batch", h.deps)).toBe(1);
    expect(h.store.get("a")).toMatchObject({ status: "declined", decline_reason: "Puno na ang batch" });
    expect(h.store.get("b")!.status).toBe("approved");
  });

  it("resends credentials with a brand-new password (the old one is never stored)", async () => {
    const h = harness([row("a", { status: "approved", approved_user_id: "user-9", email_attempts: 1 })]);
    const result = await resendCredentials("a", h.deps);
    expect(result).toEqual({ emailed: true });
    expect(h.resets).toHaveLength(1);
    expect(h.resets[0].userId).toBe("user-9");
    expect(h.mails[0].text).toContain(h.resets[0].password);
    expect(h.store.get("a")!.email_attempts).toBe(2);
  });

  it("refuses to resend for applications that aren't approved", async () => {
    const h = harness([row("a")]);
    expect(await resendCredentials("a", h.deps)).toMatchObject({ emailed: false });
    expect(h.mails).toHaveLength(0);
  });
});
