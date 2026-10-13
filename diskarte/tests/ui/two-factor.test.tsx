import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const mfa = {
  factors: [] as { id: string; status: string }[],
  listFactors: vi.fn(async () => ({ data: { totp: mfa.factors, all: mfa.factors }, error: null })),
  enroll: vi.fn(async () => ({ data: { id: "f1", totp: { qr_code: "data:image/svg+xml;utf8,<svg/>", secret: "JBSWY3DPEHPK3PXP" } }, error: null })),
  challengeAndVerify: vi.fn(async ({ code }: { code: string }) => (code === "123456" ? { data: {}, error: null } : { data: null, error: { message: "Invalid TOTP code" } })),
  unenroll: vi.fn(async () => ({ data: {}, error: null })),
};
const rpc = vi.fn(async () => ({ data: { profile: { username: "juan" } }, error: null }));
const client = { auth: { mfa, signOut: vi.fn(), refreshSession: vi.fn() }, rpc };
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => client, useOptionalSupabase: () => client }));

const { MfaChallenge } = await import("@/components/auth/MfaChallenge");
const { TwoFactorSettings } = await import("@/components/profile/TwoFactorSettings");
const { DataExport } = await import("@/components/profile/DataExport");

beforeEach(() => {
  mfa.factors = [];
  vi.clearAllMocks();
});

describe("two-factor sign-in", () => {
  it("verifies the code against the verified factor, then continues", async () => {
    mfa.factors = [{ id: "f1", status: "verified" }];
    const user = userEvent.setup();
    render(<MfaChallenge next="/tambayan/abc" />);
    await user.type(screen.getByLabelText("Authentication code"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("didn't work");
    await user.clear(screen.getByLabelText("Authentication code"));
    await user.type(screen.getByLabelText("Authentication code"), "12a3456");
    // The button holds its spinner a moment after a failed try.
    await waitFor(() => expect(screen.getByRole("button", { name: "Verify" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/tambayan/abc"));
    expect(mfa.challengeAndVerify).toHaveBeenLastCalledWith({ factorId: "f1", code: "123456" });
  });

  it("sets up an authenticator: QR, key, then a code turns it on", async () => {
    const user = userEvent.setup();
    render(<TwoFactorSettings />);
    await user.click(await screen.findByRole("button", { name: "Set up" }));
    expect(await screen.findByRole("img", { name: "QR code for your authenticator app" })).toBeInTheDocument();
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    mfa.factors = [{ id: "f1", status: "verified" }];
    await user.type(screen.getByLabelText("Authentication code"), "123456");
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByRole("button", { name: "Turn off" })).toBeInTheDocument();
  });
});

describe("data export", () => {
  it("downloads my data as a JSON file", async () => {
    const createObjectURL = vi.fn(() => "blob:x");
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<DataExport username="juan" />);
    await user.click(screen.getByRole("button", { name: /Download my data/ }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("export_my_data");
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toMatch(/^diskarte-data-juan-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
