import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_ID, makeProfile, server } from "../fixtures/server";

let social: { friends: { status: string }[]; conversations: unknown[] | null } = { friends: [], conversations: [] };
vi.mock("@/components/providers/SocialProvider", () => ({ useOptionalSocial: () => social }));

const { MeProvider } = await import("@/components/providers/MeProvider");
const { GettingStarted, WhatsNew } = await import("@/components/shell/GettingStarted");
const { RELEASES } = await import("@/lib/releases");
const hq = { ...server, id: "d15ca47e-0000-4000-8000-000000000001", is_system: true };
const renderSteps = (servers = [hq], onCreate = vi.fn()) =>
  render(<MeProvider profile={makeProfile(OWNER_ID, "Kapitan")}><GettingStarted servers={servers} onCreate={onCreate} /></MeProvider>);

beforeEach(() => {
  localStorage.clear();
  social = { friends: [], conversations: [] };
});

describe("getting started", () => {
  it("lists first steps from the account's real state, and the create step opens the dialog", async () => {
    const onCreate = vi.fn();
    renderSteps([hq], onCreate);
    expect(await screen.findByRole("heading", { name: /Getting started/ })).toBeVisible();
    expect(screen.getByText("0 / 4 steps done")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onCreate).toHaveBeenCalled();
  });

  it("marks steps done (Diskarte HQ alone doesn't count) and hides itself when everything is done or dismissed", async () => {
    social = { friends: [{ status: "accepted" }], conversations: [{}] };
    const { unmount } = renderSteps([hq, server]);
    expect(await screen.findByText("3 / 4 steps done")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hide getting started" }));
    expect(screen.queryByRole("heading", { name: /Getting started/ })).toBeNull();
    unmount();
    renderSteps([hq, server]);
    expect(screen.queryByRole("heading", { name: /Getting started/ })).toBeNull();
  });
});

describe("what's new", () => {
  it("stays quiet on a first visit and shows releases newer than the last one seen", async () => {
    const { unmount } = render(<WhatsNew />);
    expect(screen.queryByRole("heading", { name: RELEASES[0].title })).toBeNull();
    expect(localStorage.getItem("diskarte:last-release")).toBe(RELEASES[0].id);
    unmount();
    localStorage.setItem("diskarte:last-release", RELEASES[1].id);
    render(<WhatsNew />);
    expect(await screen.findByRole("heading", { name: RELEASES[0].title })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Mark updates as read" }));
    expect(screen.queryByRole("heading", { name: RELEASES[0].title })).toBeNull();
    expect(localStorage.getItem("diskarte:last-release")).toBe(RELEASES[0].id);
  });
});
