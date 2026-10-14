import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { livekitMock, mockCameraPlaceholder, mockParticipant } from "../mocks/livekit";
import { navigation } from "../mocks/navigation";
import { MOD_ID, OWNER_ID } from "../fixtures/server";

vi.mock("@/actions/messages", async () => (await import("../mocks/actions")).messageActions);
vi.mock("@/actions/servers", async () => (await import("../mocks/actions")).serverActions);
vi.mock("@/actions/profile", async () => (await import("../mocks/actions")).profileActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { DiskarteLayout, GENERAL, RUNTIME, TAMBAYAN, channelUrl } = await import("../fixtures/layout");
const { parseLayout } = await import("@/components/workspace/WorkspaceProvider");

function desktop() {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes("min-width: 768px"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  desktop();
  navigation.set(channelUrl(GENERAL.id));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ token: "jwt", url: RUNTIME.livekitUrl }), { status: 200 })));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const navWidth = () => document.querySelector<HTMLElement>('[data-panel="nav"]')!.style.getPropertyValue("--nav-w");
const saved = () => parseLayout(localStorage.getItem("diskarte:layout:v2"));

describe("column layout", () => {
  it("lays out rail, channels, main and members as columns, with no floating windows", () => {
    render(<DiskarteLayout />);
    expect(document.querySelector('[data-panel="nav"]')).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("complementary", { name: "Member roster" })).toBeInTheDocument();
    expect(document.querySelector("[data-panel-bar], [data-resize], [data-window]")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Minimize/ })).toBeNull();
  });

  it("resizes the channel list from its divider, remembers it, and resets on double-click", () => {
    render(<DiskarteLayout />);
    const divider = screen.getByRole("separator", { name: "Resize channel list" });
    expect(navWidth()).toBe("240px");
    fireEvent.keyDown(divider, { key: "ArrowRight" });
    fireEvent.keyDown(divider, { key: "ArrowRight", shiftKey: true });
    expect(navWidth()).toBe(`${240 + 16 + 64}px`);
    expect(saved().nav).toBe(320);
    fireEvent.keyDown(divider, { key: "End" });
    expect(divider).toHaveAttribute("aria-valuenow", "420");
    fireEvent.doubleClick(divider);
    expect(navWidth()).toBe("240px");
  });

  it("drags the member list wider from its left edge and keeps the size within limits", () => {
    render(<DiskarteLayout />);
    const divider = screen.getByRole("separator", { name: "Resize member list" });
    fireEvent.pointerDown(divider, { clientX: 1000, button: 0, pointerId: 1 });
    fireEvent.pointerMove(divider, { clientX: 960, pointerId: 1 });
    fireEvent.pointerUp(divider, { pointerId: 1 });
    expect(saved().roster).toBe(248 + 40);
    fireEvent.pointerDown(divider, { clientX: 1000, button: 0, pointerId: 1 });
    fireEvent.pointerMove(divider, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(divider, { pointerId: 1 });
    expect(saved().roster).toBe(400);
  });

  it("hides and shows the member list, and remembers the choice", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<DiskarteLayout />);
    await user.click(screen.getByRole("button", { name: "Toggle member list" }));
    expect(screen.queryByRole("complementary", { name: "Member roster" })).toBeNull();
    unmount();
    render(<DiskarteLayout />);
    expect(screen.queryByRole("complementary", { name: "Member roster" })).toBeNull();
    expect(saved().membersOpen).toBe(false);
  });

  it("ignores a corrupt saved layout", () => {
    expect(parseLayout("{nope")).toEqual({ mode: "columns", panels: {}, nav: 240, roster: 248, membersOpen: true });
    expect(parseLayout(JSON.stringify({ nav: 9999, roster: "x", membersOpen: false, mode: "weird", panels: { nav: { x: "a" } } }))).toEqual({ mode: "columns", panels: {}, nav: 420, roster: 248, membersOpen: false });
  });
});

describe("call controls, Discord-style", () => {
  it("shows Voice Connected with Disconnect above the user panel, mute and deafen in it, and keeps the call while browsing", async () => {
    const user = userEvent.setup();
    navigation.set(channelUrl(TAMBAYAN.id));
    livekitMock.tracks = [mockCameraPlaceholder(mockParticipant(OWNER_ID, { isLocal: true })), mockCameraPlaceholder(mockParticipant(MOD_ID))];
    render(<DiskarteLayout />);
    await user.click(await screen.findByTestId("join-voice"));
    const dock = await screen.findByTestId("call-dock");
    await waitFor(() => expect(dock).toHaveTextContent("Voice Connected"));
    expect(screen.getAllByTestId("call-dock")).toHaveLength(1);
    // You show under the voice channel straight away, from your own call (no presence echo needed).
    const inVoice = () => within(screen.getByRole("navigation", { name: "Channels" })).getByRole("list", { name: "In voice" });
    expect(inVoice()).toHaveTextContent("Kapitan");
    expect(inVoice()).toHaveTextContent("Maria");
    // The dock is status + disconnect; mute and deafen live in the user panel.
    expect(within(dock).queryByRole("button", { name: "Mute" })).toBeNull();
    const panel = screen.getByTestId("user-panel");
    await user.click(within(panel).getByRole("button", { name: "Mute" }));
    expect(within(panel).getByRole("button", { name: "Unmute" })).toHaveAttribute("aria-pressed", "true");

    const room = livekitMock.rooms.at(-1)!;
    act(() => navigation.push(channelUrl(GENERAL.id)));
    expect(dock).toHaveTextContent("Tambayan 1");
    expect(room.disconnect).not.toHaveBeenCalled();

    await user.click(within(dock).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(screen.queryByTestId("call-dock")).toBeNull());
    expect(room.disconnect).toHaveBeenCalled();
    expect(inVoice()).not.toHaveTextContent("Kapitan");
    expect(within(panel).queryByRole("button", { name: /^(Un)?mute$/ })).toBeNull();
  });
});
