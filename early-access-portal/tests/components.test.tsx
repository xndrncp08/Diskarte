import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WaitlistRow } from "@/lib/approvals";
import { setViewport } from "./setup";

const submit = vi.fn();
vi.mock("@/app/actions", () => ({ submitApplicationAction: (...args: unknown[]) => submit(...args) }));
const review = {
  approveAction: vi.fn(async (ids: string[]) => ({ ok: true, message: `${ids.length} approved` })),
  declineAction: vi.fn(async (ids: string[]) => ({ ok: true, message: `${ids.length} declined` })),
  reopenAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  resendAction: vi.fn(async () => ({ ok: true, message: "Na-send ulit" })),
  saveNoteAction: vi.fn(async () => ({ ok: true, message: "Na-save ang note." })),
};
vi.mock("@/app/admin/actions", () => review);
vi.mock("@/app/admin/auth-actions", () => ({ adminSignOutAction: vi.fn() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("next/script", () => ({ default: () => null }));

const { ApplicationForm } = await import("@/components/ApplicationForm");
const { AdminDashboard } = await import("@/components/admin/AdminDashboard");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("application form", () => {
  async function fillStepOne(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Buong pangalan"), "Juan Dela Cruz");
    await user.type(screen.getByLabelText("Email"), "juan@example.ph");
    await user.click(screen.getByRole("button", { name: /Susunod/ }));
  }

  it("walks through three validated steps, submits everything, then celebrates with retro confetti", async () => {
    const user = userEvent.setup();
    submit.mockResolvedValue({ status: "success", firstName: "Juan" });
    render(<ApplicationForm formToken="t.sig" turnstileSiteKey={null} />);

    // Step 1 won't advance until it's valid.
    expect(screen.getByText("HAKBANG 1 NG 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Susunod/ }));
    expect(await screen.findByText("Pakilagay ang buong pangalan mo")).toBeInTheDocument();
    expect(screen.getByLabelText("Buong pangalan")).toHaveAttribute("aria-invalid", "true");
    await fillStepOne(user);

    // Step 2: community.
    expect(await screen.findByRole("heading", { name: "Ang komunidad mo" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Susunod/ }));
    expect(await screen.findByText("Pumili ng uri ng komunidad")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Gaming squad/ }));
    await user.click(screen.getByRole("radio", { name: "11–50" }));
    await user.click(screen.getByRole("button", { name: /Susunod/ }));

    // Step 3: reason + consent, with a way back that keeps what was typed.
    expect(await screen.findByRole("heading", { name: "Kwento mo" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Bumalik/ }));
    expect(await screen.findByRole("radio", { name: /Gaming squad/ })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: /Susunod/ }));
    await user.type(await screen.findByLabelText("Bakit mo gustong sumali?"), "Lilipat na kami mula Discord para sa squad!");
    await user.click(screen.getByRole("checkbox", { name: /Pumapayag/ }));
    await user.click(screen.getByRole("button", { name: /Sumali sa waitlist/ }));

    await screen.findByText("Nasa pila ka na, Juan!");
    expect(await screen.findByTestId("confetti")).toBeInTheDocument();
    const data = submit.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(data)).toMatchObject({
      formToken: "t.sig",
      fullName: "Juan Dela Cruz",
      email: "juan@example.ph",
      communityType: "gaming",
      communitySize: "11-50",
      reason: "Lilipat na kami mula Discord para sa squad!",
      consent: "on",
      website: "",
    });
  });

  it("jumps back to the step with a server-side error and keeps every answer", async () => {
    const user = userEvent.setup();
    submit.mockResolvedValue({ status: "error", fieldErrors: { email: "Mukhang mali ang email" }, values: { fullName: "Maria", email: "m@x" } });
    render(<ApplicationForm formToken="t.sig" turnstileSiteKey={null} />);
    await fillStepOne(user);
    await user.click(await screen.findByRole("radio", { name: /Study group/ }));
    await user.click(screen.getByRole("button", { name: /Susunod/ }));
    await user.type(await screen.findByLabelText("Bakit mo gustong sumali?"), "Para sa org namin na kailangan ng voice.");
    await user.click(screen.getByRole("checkbox", { name: /Pumapayag/ }));
    await user.click(screen.getByRole("button", { name: /Sumali sa waitlist/ }));

    expect(await screen.findByText("Mukhang mali ang email")).toBeInTheDocument();
    expect(screen.getByText("HAKBANG 1 NG 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Buong pangalan")).toHaveValue("Maria");
  });

  it("uses floating labels, a hidden honeypot and Turnstile on the last step", async () => {
    const user = userEvent.setup();
    const { container } = render(<ApplicationForm formToken="t.sig" turnstileSiteKey="0x4AAA" />);
    const name = screen.getByLabelText("Buong pangalan");
    expect(name).toHaveAttribute("placeholder", " "); // drives the :placeholder-shown label float
    const honeypot = container.querySelector('input[name="website"]')!;
    expect(honeypot.closest("[aria-hidden]")).not.toBeNull();
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(screen.queryByTestId("turnstile")).toBeNull();
    await fillStepOne(user);
    await user.click(await screen.findByRole("radio", { name: /Barkada/ }));
    await user.click(screen.getByRole("button", { name: /Susunod/ }));
    expect(await screen.findByTestId("turnstile")).toBeInTheDocument();
  });
});

function row(id: string, patch: Partial<WaitlistRow> = {}): WaitlistRow {
  return {
    id,
    full_name: `Applicant ${id}`,
    email: `${id}@example.ph`,
    preferred_username: null,
    community_type: "school",
    community_name: `Org ${id}`,
    community_size: "11-50",
    referral_source: "FB",
    reason: "Para sa org namin na kailangan ng stable na voice.",
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

const data = {
  stats: { pending: 2, approved: 1, declined: 0, email_failed: 1, last7: [{ day: "2026-09-27", count: 3 }] },
  total: 3,
  rows: [row("a"), row("b"), row("c", { status: "approved", email_sent_at: null, email_error: "bounced" })],
};
const query = { status: "all" as const, q: "", page: 1 };

describe("admin dashboard", () => {
  it("shows stats and flags approved applicants whose email failed", () => {
    render(<AdminDashboard data={data} query={query} adminEmail="boss@diskarte.ph" />);
    expect(screen.getByTestId("stat-pending")).toHaveTextContent("2");
    expect(screen.getByTestId("stat-total")).toHaveTextContent("3");
    expect(screen.getByText(/1 approved pero hindi pa na-email/)).toBeInTheDocument();
    expect(screen.getByText("email failed")).toBeInTheDocument();
  });

  it("bulk-approves the selected applications (approved rows can't be selected)", async () => {
    const user = userEvent.setup();
    render(<AdminDashboard data={data} query={query} adminEmail="boss@diskarte.ph" />);
    expect(screen.getByRole("checkbox", { name: "Select Applicant c" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Select all on this page" }));
    const bar = screen.getByTestId("bulk-bar");
    expect(bar).toHaveTextContent("2 napili");
    await user.click(within(bar).getByRole("button", { name: /Approve 2/ }));
    await waitFor(() => expect(review.approveAction).toHaveBeenCalledWith(["a", "b"]));
    expect(await screen.findByTestId("review-notice")).toHaveTextContent("2 approved");
    expect(refresh).toHaveBeenCalled();
  });

  it("declines with an optional reason through a confirmation dialog", async () => {
    const user = userEvent.setup();
    render(<AdminDashboard data={data} query={query} adminEmail="boss@diskarte.ph" />);
    await user.click(screen.getByRole("button", { name: "Decline Applicant a" }));
    const dialog = await screen.findByRole("dialog", { name: "Decline 1 application?" });
    await user.type(within(dialog).getByLabelText(/Reason/), "Batch 2 na lang");
    await user.click(within(dialog).getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(review.declineAction).toHaveBeenCalledWith(["a"], "Batch 2 na lang"));
  });

  it("opens applicant details with the right actions for their status", async () => {
    const user = userEvent.setup();
    render(<AdminDashboard data={data} query={query} adminEmail="boss@diskarte.ph" />);
    await user.click(screen.getAllByRole("button", { name: "Details" })[2]);
    const dialog = await screen.findByRole("dialog", { name: "Applicant c" });
    expect(within(dialog).getByText(/Hindi na-send: bounced/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Approve/ })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: /Resend credentials/ }));
    await waitFor(() => expect(review.resendAction).toHaveBeenCalledWith("c"));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("admin dashboard on phones", () => {
  it("switches to cards, a thumb-reach bulk bar and bottom-sheet details", async () => {
    setViewport("mobile");
    const user = userEvent.setup();
    render(<AdminDashboard data={data} query={query} adminEmail="boss@diskarte.ph" />);
    expect(screen.getByRole("list", { name: "Applications list" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Select Applicant a" }));
    expect(await screen.findByTestId("bulk-bar")).toHaveClass("fixed", "bottom-0");
    await user.click(screen.getAllByRole("button", { name: "Details" })[0]);
    const sheet = await screen.findByRole("dialog", { name: "Applicant a" });
    expect(sheet).toHaveAttribute("data-sheet", "true");
  });
});
