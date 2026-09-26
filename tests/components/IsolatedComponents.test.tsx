/**
 * Isolation tests for overlay components: menus, emoji pickers, popovers, tooltips, modals and the
 * floating call widgets. jsdom has no layout engine, so geometry is asserted two ways:
 *  - here: structure (portals, z-index, fixed positioning, DOM order, scroll lock, focus) and the
 *    placement maths with stubbed element rects / viewport sizes;
 *  - e2e/layout.spec.ts: real bounding boxes and scrollbars in Chromium.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeFloatingPosition } from "@/components/ui/floating";
import { livekitMock, mockCameraPlaceholder, mockParticipant } from "../mocks/livekit";
import { navigation } from "../mocks/navigation";
import { MOD_ID, OWNER_ID } from "../fixtures/server";

vi.mock("@/actions/messages", async () => (await import("../mocks/actions")).messageActions);
vi.mock("@/actions/servers", async () => (await import("../mocks/actions")).serverActions);
vi.mock("@/actions/profile", async () => (await import("../mocks/actions")).profileActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { DiskarteLayout, GENERAL, MEMBERS, RUNTIME, TAMBAYAN, channelUrl, messageFixture } = await import("../fixtures/layout");

// ---- geometry stubs ------------------------------------------------------------------------
const VIEWPORT = { width: 1440, height: 900 };
const PANEL_SIZES: Record<string, { width: number; height: number }> = {
  menu: { width: 220, height: 180 },
  "emoji-picker": { width: 288, height: 320 },
  "member-popover": { width: 288, height: 360 },
  tooltip: { width: 120, height: 28 },
};
const anchorRects = new WeakMap<Element, { top: number; left: number; width: number; height: number }>();

function domRect(r: Partial<{ top: number; left: number; width: number; height: number }>) {
  const { top = 0, left = 0, width = 0, height = 0 } = r;
  return { top, left, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
}

function placeAnchor(el: Element | null, rect: { top: number; left: number; width: number; height: number }) {
  if (!el) throw new Error("anchor not found");
  anchorRects.set(el, rect);
}

/** Parse the fixed-position coordinates written by useFloating. */
function coords(el: HTMLElement) {
  return { top: parseFloat(el.style.top), left: parseFloat(el.style.left), position: el.style.position };
}

function expectInsideViewport(el: HTMLElement, kind: string) {
  const { top, left } = coords(el);
  const size = PANEL_SIZES[kind];
  expect(left).toBeGreaterThanOrEqual(8);
  expect(top).toBeGreaterThanOrEqual(8);
  expect(left + size.width).toBeLessThanOrEqual(VIEWPORT.width - 8);
  expect(top + size.height).toBeLessThanOrEqual(VIEWPORT.height - 8);
}

/** A structural fingerprint of the three columns: opening overlays must not change it. */
function columnsSignature() {
  const rail = screen.getByRole("navigation", { name: "Servers" });
  const sidebar = screen.getByRole("complementary", { name: /channels$/ });
  const canvas = screen.getByTestId("active-view");
  return [rail, sidebar, canvas].map((el) => `${el.className}|${el.childElementCount}|${el.getAttribute("style") ?? ""}`).join("\n");
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: VIEWPORT.width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: VIEWPORT.height });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const anchor = anchorRects.get(this);
    if (anchor) return domRect(anchor);
    const kind = this.dataset?.floating;
    return domRect(kind ? PANEL_SIZES[kind] : {});
  });
  consoleError = vi.spyOn(console, "error");
  document.body.style.overflow = "";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ token: "jwt", url: RUNTIME.livekitUrl, room: "voice:x" }), { status: 200 })));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function expectNoReactErrors() {
  const reactErrors = consoleError.mock.calls.filter((args: unknown[]) => /Warning:|Cannot update|unmounted|act\(|Maximum update depth|each child in a list/i.test(String(args[0])));
  expect(reactErrors).toEqual([]);
}

// =============================================================================================
describe("placement maths (flip + clamp)", () => {
  const viewport = VIEWPORT;
  const floating = { width: 288, height: 320 };

  it("keeps the preferred side when there is room", () => {
    const r = computeFloatingPosition({ anchor: { top: 100, left: 400, width: 32, height: 32 }, floating, viewport, side: "bottom" });
    expect(r).toEqual({ side: "bottom", top: 140, left: 400 });
  });

  it("flips from bottom to top near the bottom edge", () => {
    const r = computeFloatingPosition({ anchor: { top: 820, left: 400, width: 32, height: 32 }, floating, viewport, side: "bottom" });
    expect(r.side).toBe("top");
    expect(r.top + floating.height).toBeLessThanOrEqual(820);
  });

  it("flips from top to bottom near the top edge", () => {
    const r = computeFloatingPosition({ anchor: { top: 12, left: 400, width: 32, height: 32 }, floating, viewport, side: "top" });
    expect(r.side).toBe("bottom");
    expect(r.top).toBeGreaterThanOrEqual(12 + 32);
  });

  it("clamps horizontally so nothing overflows the viewport", () => {
    const right = computeFloatingPosition({ anchor: { top: 300, left: 1420, width: 16, height: 16 }, floating, viewport, side: "bottom" });
    expect(right.left + floating.width).toBeLessThanOrEqual(viewport.width - 8);
    const left = computeFloatingPosition({ anchor: { top: 300, left: -50, width: 16, height: 16 }, floating, viewport, side: "bottom", align: "end" });
    expect(left.left).toBe(8);
  });

  it("flips left/right for side panels and clamps tall panels vertically", () => {
    const r = computeFloatingPosition({ anchor: { top: 880, left: 40, width: 200, height: 20 }, floating, viewport, side: "left" });
    expect(r.side).toBe("right");
    expect(r.top + floating.height).toBeLessThanOrEqual(viewport.height - 8);
  });

  it("never returns coordinates that start off-screen, even for oversized panels", () => {
    const r = computeFloatingPosition({ anchor: { top: 10, left: 10, width: 10, height: 10 }, floating: { width: 2000, height: 2000 }, viewport, side: "bottom" });
    expect(r.top).toBeGreaterThanOrEqual(8);
    expect(r.left).toBeGreaterThanOrEqual(8);
  });
});

// =============================================================================================
describe("server options dropdown", () => {
  beforeEach(() => navigation.set(channelUrl(GENERAL.id)));

  it("lists admin options and renders in a body portal above everything (z-50, fixed)", async () => {
    const user = userEvent.setup();
    render(<DiskarteLayout />);
    const before = columnsSignature();
    await user.click(screen.getByTestId("server-menu"));
    const menu = await screen.findByRole("menu", { name: "Server menu" });
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Invite people", "Tambayan settings", "Create channel"]);
    expect(menu.parentElement).toBe(document.body); // escapes every overflow boundary
    expect(menu).toHaveClass("z-50");
    expect(menu.style.position).toBe("fixed");
    expect(screen.getByRole("complementary", { name: /channels$/ }).contains(menu)).toBe(false);
    expect(columnsSignature()).toBe(before); // no layout shift in rail / sidebar / canvas
    expect(screen.getByTestId("server-menu")).toHaveAttribute("aria-expanded", "true");
  });

  it("supports arrow keys, Home/End, and Escape back to the trigger", async () => {
    const user = userEvent.setup();
    render(<DiskarteLayout />);
    const trigger = screen.getByTestId("server-menu");
    await user.click(trigger);
    const items = within(await screen.findByRole("menu")).getAllByRole("menuitem");
    await waitFor(() => expect(items[0]).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(items[0]).toHaveFocus(); // wraps
    await user.keyboard("{ArrowUp}");
    expect(items[2]).toHaveFocus();
    await user.keyboard("{Home}");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{End}");
    expect(items[2]).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on outside click and leaves pointer events intact", async () => {
    const user = userEvent.setup();
    render(<DiskarteLayout />);
    await user.click(screen.getByTestId("server-menu"));
    await screen.findByRole("menu");
    await user.click(screen.getByTestId("active-view"));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.body.style.pointerEvents).toBe("");
    expect(getComputedStyle(document.body).pointerEvents).not.toBe("none");
    // The rest of the UI is still clickable afterwards.
    await user.click(within(screen.getByRole("navigation", { name: "Channels" })).getByRole("link", { name: "chika" }));
    expect(navigation.path).toContain("20000000-0000-4000-8000-000000000002");
  });

  it("flips above the trigger when opened near the bottom of the viewport", async () => {
    const user = userEvent.setup();
    render(<DiskarteLayout />);
    const trigger = screen.getByTestId("server-menu");
    placeAnchor(trigger.parentElement, { top: 860, left: 72, width: 240, height: 36 });
    await user.click(trigger);
    const menu = await screen.findByRole("menu");
    await waitFor(() => expect(menu).toHaveAttribute("data-side", "top"));
    expectInsideViewport(menu, "menu");
  });

  it("status menu at the bottom of the sidebar opens upward and stays on screen", async () => {
    const user = userEvent.setup();
    render(<DiskarteLayout />);
    const trigger = within(screen.getByTestId("user-panel")).getByRole("button", { name: /Set status/ });
    placeAnchor(trigger.parentElement, { top: 850, left: 80, width: 180, height: 40 });
    await user.click(trigger);
    const menu = await screen.findByRole("menu", { name: "Set status" });
    await waitFor(() => expect(menu).toHaveAttribute("data-side", "top"));
    expectInsideViewport(menu, "menu");
    expect(menu.parentElement).toBe(document.body);
  });
});

// =============================================================================================
describe("reaction emoji picker & message actions", () => {
  const history = { [GENERAL.id]: [messageFixture("m1", GENERAL.id, MOD_ID, "Tara ranked mamaya?")] };
  beforeEach(() => navigation.set(channelUrl(GENERAL.id)));

  async function openToolbarPicker(anchor: { top: number; left: number }) {
    const user = userEvent.setup();
    render(<DiskarteLayout history={history} />);
    const message = screen.getByTestId("message");
    await user.hover(message);
    const toolbar = within(message).getByRole("toolbar", { name: "Message actions" });
    const trigger = within(toolbar).getByRole("button", { name: "Add reaction" });
    placeAnchor(trigger, { ...anchor, width: 28, height: 28 });
    await user.click(trigger);
    const picker = await screen.findByRole("dialog", { name: "Emoji picker" });
    return { user, picker, trigger, message };
  }

  it("opens from the hover toolbar in a portal outside the scrolling message list", async () => {
    const { picker, message } = await openToolbarPicker({ top: 300, left: 900 });
    expect(picker.parentElement).toBe(document.body);
    expect(screen.getByTestId("message-list").contains(picker)).toBe(false);
    expect(message.contains(picker)).toBe(false);
    expect(picker).toHaveClass("z-50");
    expect(within(picker).getByRole("button", { name: "Petmalu" })).toBeInTheDocument();
  });

  it("opens downward for messages near the top of the viewport", async () => {
    const { picker } = await openToolbarPicker({ top: 60, left: 900 });
    await waitFor(() => expect(picker).toHaveAttribute("data-side", "bottom"));
    expectInsideViewport(picker, "emoji-picker");
  });

  it("flips upward for messages near the bottom and never overflows horizontally", async () => {
    const { picker } = await openToolbarPicker({ top: 840, left: 1425 });
    await waitFor(() => expect(picker).toHaveAttribute("data-side", "top"));
    expectInsideViewport(picker, "emoji-picker");
  });

  it("reacts and closes; Escape returns focus to the trigger", async () => {
    const { user, picker, trigger } = await openToolbarPicker({ top: 300, left: 900 });
    await user.click(within(picker).getByRole("button", { name: "Lodi" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Emoji picker" })).toBeNull());
    expect(await screen.findByRole("button", { name: "Lodi: 1 reaction" })).toBeInTheDocument();
    await user.click(trigger);
    await screen.findByRole("dialog", { name: "Emoji picker" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Emoji picker" })).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("the composer picker is not clipped by the composer's rounded overflow-hidden card", async () => {
    const user = userEvent.setup();
    render(<DiskarteLayout />);
    const trigger = screen.getByRole("button", { name: "Insert emoji" });
    expect(trigger.closest(".overflow-hidden")).not.toBeNull(); // the trigger does live inside it…
    placeAnchor(trigger, { top: 850, left: 1300, width: 28, height: 28 });
    await user.click(trigger);
    const picker = await screen.findByRole("dialog", { name: "Emoji picker" });
    expect(picker.closest(".overflow-hidden")).toBeNull(); // …but the panel doesn't.
    await waitFor(() => expect(picker).toHaveAttribute("data-side", "top"));
    expectInsideViewport(picker, "emoji-picker");
    await user.click(within(picker).getByRole("button", { name: "Petmalu" }));
    expect(screen.getByTestId("composer")).toHaveValue(":petmalu: ");
  });
});

// =============================================================================================
describe("popovers and tooltips", () => {
  beforeEach(() => navigation.set(channelUrl(GENERAL.id)));

  it("member profile popover escapes the scrollable member list", async () => {
    const user = userEvent.setup();
    render(<DiskarteLayout history={{}} />);
    // The member list mounts inside ChatView on lg screens; it's in the DOM regardless of CSS.
    const row = screen.getAllByTestId("member-row").find((r) => r.textContent?.includes("Maria"))!;
    placeAnchor(row, { top: 120, left: 1210, width: 220, height: 44 });
    await user.click(row);
    const popover = await screen.findByRole("dialog", { name: "Maria's profile" });
    expect(popover.parentElement).toBe(document.body);
    expect(screen.getByTestId("member-list").contains(popover)).toBe(false);
    await waitFor(() => expect(popover).toHaveAttribute("data-side", "left"));
    expectInsideViewport(popover, "member-popover");
    // Clicking the row again closes it (no close-then-reopen flicker).
    await user.click(row);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Maria's profile" })).toBeNull());
  });

  it("rail tooltips render outside the scrolling server rail", async () => {
    const user = userEvent.setup();
    render(<DiskarteLayout />);
    const home = screen.getByRole("link", { name: "Home" });
    await user.hover(home);
    const tip = document.querySelector<HTMLElement>('[data-floating="tooltip"]');
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toBe("Home");
    expect(tip!.parentElement).toBe(document.body);
    expect(screen.getByRole("navigation", { name: "Servers" }).contains(tip)).toBe(false);
    expect(tip).toHaveAttribute("aria-hidden");
    await user.unhover(home);
    expect(document.querySelector('[data-floating="tooltip"]')).toBeNull();
  });
});

// =============================================================================================
describe("glass modals & scroll locking", () => {
  beforeEach(() => navigation.set(channelUrl(GENERAL.id)));

  it("Create Server modal locks body scroll, traps focus and restores both on close", async () => {
    const user = userEvent.setup();
    document.body.style.overflow = "scroll";
    render(<DiskarteLayout />);
    const trigger = screen.getByRole("button", { name: "Add a server" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Gumawa ng Tambayan" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(dialog.closest("[class*='fixed']")?.parentElement).toBe(document.body);
    await waitFor(() => expect(within(dialog).getByLabelText("Pangalan ng tambayan")).toHaveFocus());

    // Focus trap: tabbing from the last control wraps to the first.
    const focusables = within(dialog).getAllByRole("button");
    focusables.at(-1)!.focus();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Gumawa ng Tambayan" })).toBeNull());
    expect(document.body.style.overflow).toBe("scroll");
    expect(trigger).toHaveFocus();
  });

  it("settings modal opened from the server menu restores focus to the menu trigger", async () => {
    const user = userEvent.setup();
    render(<DiskarteLayout />);
    const trigger = screen.getByTestId("server-menu");
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Tambayan settings" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambayan settings" });
    // The menu may still be fading out, but it no longer takes clicks while it does.
    const exiting = screen.queryByRole("menu");
    if (exiting) expect(exiting.style.pointerEvents).toBe("none");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.body.style.overflow).toBe("hidden");
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Tambayan settings" })).toBeNull());
    expect(document.body.style.overflow).toBe("");
    expect(trigger).toHaveFocus();
  });

  it("clicking the backdrop closes the modal", async () => {
    const user = userEvent.setup();
    render(<DiskarteLayout />);
    await user.click(screen.getByTestId("server-menu"));
    await user.click(await screen.findByRole("menuitem", { name: "Invite people" }));
    const dialog = await screen.findByRole("dialog", { name: /I-invite ang barkada/ });
    const backdrop = dialog.parentElement!.querySelector<HTMLElement>("[aria-hidden]")!;
    await user.click(backdrop);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /I-invite/ })).toBeNull());
    expect(document.body.style.overflow).toBe("");
  });
});

// =============================================================================================
describe("floating call widgets", () => {
  it("keeps the call dock in the sidebar flow between the channel list and the user panel", async () => {
    const user = userEvent.setup();
    navigation.set(channelUrl(TAMBAYAN.id));
    livekitMock.tracks = [mockCameraPlaceholder(mockParticipant(OWNER_ID, { isLocal: true }))];
    render(<DiskarteLayout />);
    await user.click(screen.getByTestId("join-voice"));
    await screen.findByTestId("voice-stage");

    await user.click(within(screen.getByRole("navigation", { name: "Channels" })).getByRole("link", { name: "general" }));
    expect(screen.getByTestId("composer")).toBeInTheDocument();

    const sidebar = screen.getByRole("complementary", { name: /channels$/ });
    const nav = within(sidebar).getByRole("navigation", { name: "Channels" });
    const dock = await within(sidebar).findByTestId("call-dock");
    const panel = within(sidebar).getByTestId("user-panel");
    expect(dock).toHaveTextContent("Voice Connected");
    expect(dock).toHaveTextContent("Tambayan 1");
    // DOM order = visual order in the flex column: list → dock → status bar → user panel.
    expect(nav.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dock.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // In normal flow (not overlaid), so it can't cover the user panel; the list keeps its own scroll area.
    expect(dock.className).not.toMatch(/\b(fixed|absolute)\b/);
    expect(nav).toHaveClass("flex-1", "overflow-y-auto");
    expect(within(panel).getByRole("link", { name: "User settings" })).toBeVisible();
    expect(within(panel).getByRole("button", { name: /Set status/ })).toBeEnabled();
    expectNoReactErrors();
  });

  it("shows the draggable picture-in-picture HUD outside the columns when video is live", async () => {
    const user = userEvent.setup();
    navigation.set(channelUrl(TAMBAYAN.id));
    const maria = mockParticipant(MOD_ID, { name: "Maria" });
    livekitMock.tracks = [{ participant: maria, source: "camera", publication: { isSubscribed: true, isMuted: false, track: {} } }];
    render(<DiskarteLayout />);
    await user.click(screen.getByTestId("join-voice"));
    await screen.findByTestId("voice-stage");
    expect(screen.queryByTestId("call-hud")).toBeNull(); // not while you're on the call page

    await user.click(within(screen.getByRole("navigation", { name: "Channels" })).getByRole("link", { name: "general" }));
    const hud = await screen.findByTestId("call-hud");
    expect(hud).toHaveClass("fixed", "bottom-24", "right-6", "z-40");
    expect(screen.getByRole("complementary", { name: /channels$/ }).contains(hud)).toBe(false);
    expect(screen.getByTestId("active-view").contains(hud)).toBe(false);
    expect(within(hud).getByTestId("video-track")).toBeInTheDocument();
    expect(within(hud).getByRole("link", { name: "Bumalik sa call" })).toHaveAttribute("href", channelUrl(TAMBAYAN.id));
  });
});

// =============================================================================================
describe("resilience", () => {
  beforeEach(() => navigation.set(channelUrl(GENERAL.id)));

  it("survives rapid open/close cycles of every overlay without React errors or leaks", async () => {
    const history = { [GENERAL.id]: [messageFixture("m1", GENERAL.id, MOD_ID, "Spam click test")] };
    const { unmount } = render(<DiskarteLayout history={history} />);
    const serverMenu = screen.getByTestId("server-menu");
    const emoji = screen.getByRole("button", { name: "Insert emoji" });
    const addServer = screen.getByRole("button", { name: "Add a server" });

    for (let i = 0; i < 25; i++) {
      fireEvent.click(serverMenu);
      fireEvent.click(emoji);
      fireEvent.keyDown(document, { key: "Escape" });
      fireEvent.mouseEnter(addServer.parentElement!);
      fireEvent.mouseLeave(addServer.parentElement!);
    }
    fireEvent.click(addServer);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(addServer);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    unmount(); // mid-animation, with a modal and popovers potentially open
    expectNoReactErrors();
    expect(document.body.style.overflow).toBe("");
    await waitFor(() => expect(document.querySelectorAll("[data-floating], [role=dialog], [role=menu]")).toHaveLength(0));
  });

  it("members list and chat keep working after overlays open and close", async () => {
    const user = userEvent.setup();
    render(<DiskarteLayout />);
    await user.click(screen.getByTestId("server-menu"));
    await user.keyboard("{Escape}");
    await user.type(screen.getByTestId("composer"), "Buhay pa ako{Enter}");
    expect(await screen.findByTestId("message")).toHaveTextContent("Buhay pa ako");
    expect(screen.getAllByTestId("member-row")).toHaveLength(MEMBERS.length);
    expectNoReactErrors();
  });
});
