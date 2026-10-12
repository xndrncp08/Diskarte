import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const reports = vi.hoisted(() => ({ submitReportAction: vi.fn(async (): Promise<{ ok: boolean; error?: string }> => ({ ok: true })) }));
vi.mock("@/actions/reports", () => reports);

const { ReportProblemForm } = await import("@/components/profile/ReportProblemForm");

describe("<ReportProblemForm />", () => {
  it("sends the category, description, page and browser, then thanks the reporter", async () => {
    const user = userEvent.setup();
    render(<ReportProblemForm />);
    const send = screen.getByRole("button", { name: "Send report" });
    expect(send).toBeDisabled(); // too short to be useful yet
    await user.click(screen.getByRole("radio", { name: "It's slow or laggy" }));
    await user.type(screen.getByLabelText("What happened?"), "Voice keeps cutting out every few seconds.");
    await user.click(send);
    await waitFor(() =>
      expect(reports.submitReportAction).toHaveBeenCalledWith({
        category: "slow",
        description: "Voice keeps cutting out every few seconds.",
        pageUrl: window.location.pathname,
        userAgent: navigator.userAgent,
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Salamat! We got your report.");
  });

  it("shows why a report didn't go through and keeps what was typed", async () => {
    reports.submitReportAction.mockResolvedValueOnce({ ok: false, error: "You've sent a lot of reports this hour. We're on it. Try again later." });
    const user = userEvent.setup();
    render(<ReportProblemForm />);
    await user.type(screen.getByLabelText("What happened?"), "The app crashed when I opened settings.");
    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByText(/sent a lot of reports this hour/)).toBeInTheDocument();
    expect(screen.getByLabelText("What happened?")).toHaveValue("The app crashed when I opened settings.");
  });
});
