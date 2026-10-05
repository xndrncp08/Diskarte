import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { livekitMock, mockCameraPlaceholder, mockParticipant } from "../mocks/livekit";
import { navigation } from "../mocks/navigation";
import { MOD_ID, OWNER_ID, ServerFixture, server } from "../fixtures/server";

vi.mock("@/actions/messages", async () => (await import("../mocks/actions")).messageActions);
vi.mock("@/actions/servers", async () => (await import("../mocks/actions")).serverActions);
vi.mock("@/actions/profile", async () => (await import("../mocks/actions")).profileActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { DiskarteLayout, GENERAL, MEMBERS, RUNTIME, TAMBAYAN, channelUrl } = await import("../fixtures/layout");
const { RuntimeConfigProvider } = await import("@/components/providers/RuntimeConfig");
const { CallProvider } = await import("@/components/voice/CallProvider");
const { PresenceProvider } = await import("@/components/providers/PresenceProvider");
const { ServerRail } = await import("@/components/shell/ServerRail");
const { ShellUIBridge } = await import("@/components/shell/AppShell");
const { RosterDrawer } = await import("@/components/workspace/RosterDrawer");
const { WorkspaceCanvas } = await import("@/components/workspace/WorkspaceCanvas");
const { WorkspacePanel } = await import("@/components/workspace/WorkspacePanel");
const { WorkspaceProvider } = await import("@/components/workspace/WorkspaceProvider");
const { resetWebGLProbe } = await import("@/components/three/stage-bus");

/** jsdom has no layout: give the canvas a 1200 × 800 box and report a desktop viewport. */
const CANVAS = { w: 1200, h: 800 };
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
const originalWidth = Object.getOwnPropertyDescriptor(Element.prototype, "clientWidth")!;
const originalHeight = Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight")!;

beforeEach(() => {
  localStorage.clear();
  desktop();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ token: "jwt", url: RUNTIME.livekitUrl }), { status: 200 })));
  // No WebGL in jsdom: the 3D background stays off, quietly.
  resetWebGLProbe();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  Object.defineProperty(Element.prototype, "clientWidth", { configurable: true, get() { return this.hasAttribute("data-workspace") ? CANVAS.w : 0; } });
  Object.defineProperty(Element.prototype, "clientHeight", { configurable: true, get() { return this.hasAttribute("data-workspace") ? CANVAS.h : 0; } });
});

afterEach(() => {
  Object.defineProperty(Element.prototype, "clientWidth", originalWidth);
  Object.defineProperty(Element.prototype, "clientHeight", originalHeight);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Counts committed renders of each panel's content (an effect with no deps runs once per render). */
const renders: Record<string, number> = {};
const count = (id: string) => void (renders[id] = (renders[id] ?? 0) + 1);
function Counter({ id }: { id: string }) {
  useEffect(() => count(id));
  return <p>{id} content</p>;
}

/** The real workspace pieces around two counting panels and the roster drawer. */
function Workspace() {
  return (
    <RuntimeConfigProvider value={RUNTIME}>
      <ServerFixture members={MEMBERS}>
        <PresenceProvider>
        <CallProvider>
          <WorkspaceProvider>
            <ShellUIBridge>
              <ServerRail servers={[server]} />
              <WorkspaceCanvas>
                <WorkspacePanel id="nav" title="Channels">
                  <Counter id="nav" />
                </WorkspacePanel>
                <WorkspacePanel id="main" title="Barkada HQ">
                  <Counter id="main" />
                </WorkspacePanel>
                <RosterDrawer>
                  <p>roster</p>
                </RosterDrawer>
              </WorkspaceCanvas>
            </ShellUIBridge>
          </WorkspaceProvider>
        </CallProvider>
        </PresenceProvider>
      </ServerFixture>
    </RuntimeConfigProvider>
  );
}

const panelEl = (id: string) => document.querySelector<HTMLElement>(`[data-panel="${id}"]`)!;
const geometry = (id: string) => {
  const s = panelEl(id).style;
  return { x: s.getPropertyValue("--px"), y: s.getPropertyValue("--py"), w: s.getPropertyValue("--pw"), h: s.getPropertyValue("--ph"), z: Number(s.getPropertyValue("--pz")) };
};
const bar = (id: string) => panelEl(id).querySelector<HTMLElement>("[data-panel-bar]")!;
const handle = (id: string, edge: string) => panelEl(id).querySelector<HTMLElement>(`[data-resize="${edge}"]`)!;

function drag(el: HTMLElement, from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(el, { clientX: from[0], clientY: from[1], button: 0, pointerId: 1 });
  fireEvent.pointerMove(el, { clientX: to[0], clientY: to[1], pointerId: 1 });
  fireEvent.pointerUp(el, { clientX: to[0], clientY: to[1], pointerId: 1 });
}

async function ready() {
  render(<Workspace />);
  await waitFor(() => expect(geometry("main").w).not.toBe(""));
}

describe("floating workspace canvas", () => {
  it("lays panels out on the canvas: navigator left, the active view filling the rest", async () => {
    await ready();
    expect(geometry("nav")).toMatchObject({ x: "0px", y: "0px", w: "320px", h: "800px" });
    expect(geometry("main")).toMatchObject({ x: "332px", w: "868px" });
    expect(panelEl("main").tagName).toBe("MAIN");
    expect(panelEl("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("region", { name: "Channels" })).toBe(panelEl("nav"));
  });

  it("raises a clicked panel to the top without re-rendering what's inside it", async () => {
    await ready();
    const before = { ...renders };
    expect(geometry("main").z).toBeGreaterThan(geometry("nav").z);
    fireEvent.pointerDown(screen.getByText("nav content"));
    await waitFor(() => expect(geometry("nav").z).toBeGreaterThan(geometry("main").z));
    expect(renders).toEqual(before);
    // Focus raises too (keyboard users).
    act(() => screen.getByRole("button", { name: "Move Barkada HQ panel" }).focus());
    await waitFor(() => expect(geometry("main").z).toBeGreaterThan(geometry("nav").z));
    expect(renders).toEqual(before);
  });

  it("resizes from a corner but never below 320 × 240", async () => {
    await ready();
    drag(handle("nav", "se"), [320, 800], [100, 300]);
    await waitFor(() => expect(geometry("nav")).toMatchObject({ w: "320px", h: "300px" }));
    drag(handle("nav", "se"), [320, 300], [320, 100]);
    await waitFor(() => expect(geometry("nav").h).toBe("240px"));
  });

  it("snaps to the canvas edge within 8 px, settles free moves on the grid, and saves the layout", async () => {
    await ready();
    drag(handle("nav", "s"), [160, 800], [160, 300]);
    drag(bar("nav"), [100, 10], [103, 213]);
    await waitFor(() => expect(geometry("nav")).toMatchObject({ x: "0px", y: "200px" }));
    const saved = JSON.parse(localStorage.getItem("diskarte:workspace:v1")!);
    expect(saved.panels.nav.rect).toMatchObject({ x: 0, y: 0.25, h: 0.375 });
    expect(saved.preset).toBeNull();
  });

  it("moves and resizes from the keyboard", async () => {
    const user = userEvent.setup();
    await ready();
    drag(handle("nav", "s"), [160, 800], [160, 400]);
    await user.click(screen.getByRole("button", { name: "Move Channels panel" }));
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(geometry("nav").y).toBe("16px"));
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    await waitFor(() => expect(geometry("nav").y).toBe("80px"));
    await user.click(screen.getByRole("button", { name: "Resize Channels panel" }));
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(geometry("nav").w).toBe("336px"));
  });

  it("minimizes a panel into a glass pill in the tray and restores it", async () => {
    const user = userEvent.setup();
    await ready();
    await user.click(screen.getByRole("button", { name: "Minimize Channels" }));
    expect(panelEl("nav")).toHaveAttribute("data-minimized");
    expect(panelEl("nav")).toHaveAttribute("aria-hidden", "true");
    const tray = screen.getByRole("region", { name: "Workspace tray" });
    await user.click(within(tray).getByRole("button", { name: "Restore Channels" }));
    expect(panelEl("nav")).not.toHaveAttribute("data-minimized");
    expect(within(tray).queryByTestId("panel-pill")).toBeNull();
  });
});

describe("coupled resizing", () => {
  const num = (v: string) => parseInt(v, 10);
  const seamGap = () => num(geometry("main").x) - (num(geometry("nav").x) + num(geometry("nav").w));

  it("dragging a shared edge resizes the docked neighbour by the same amount — no gap, no overlap", async () => {
    await ready();
    const mainRight = num(geometry("main").x) + num(geometry("main").w);
    drag(handle("nav", "e"), [320, 400], [400, 400]);
    await waitFor(() => expect(geometry("nav").w).toBe("400px"));
    expect(geometry("main")).toMatchObject({ x: "412px", w: "788px" });
    expect(num(geometry("main").x) + num(geometry("main").w)).toBe(mainRight);
    expect(seamGap()).toBe(12);
    // Shrinking gives the neighbour exactly the space back.
    drag(handle("main", "w"), [412, 400], [372, 400]);
    await waitFor(() => expect(geometry("nav").w).toBe("360px"));
    expect(geometry("main")).toMatchObject({ x: "372px", w: "828px" });
  });

  it("stops at the neighbour's 320 px minimum against the canvas edge", async () => {
    await ready();
    drag(handle("nav", "e"), [320, 400], [5000, 400]);
    await waitFor(() => expect(geometry("main").w).toBe("320px"));
    expect(geometry("main").x).toBe(`${CANVAS.w - 320}px`);
    expect(geometry("nav").w).toBe(`${CANVAS.w - 320 - 12}px`);
  });

  it("the seam between docked panels is a keyboard-operable splitter that moves both", async () => {
    const user = userEvent.setup();
    await ready();
    const seam = screen.getByRole("separator", { name: "Resize Channels and Barkada HQ" });
    expect(seam).toHaveAttribute("aria-orientation", "vertical");
    expect(seam).toHaveAttribute("aria-valuenow", "320");
    expect(seam).toHaveAttribute("aria-valuemin", "320");
    expect(seam).toHaveAttribute("aria-valuemax", `${CANVAS.w - 320 - 12}`);
    seam.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(seam).toHaveAttribute("aria-valuenow", "336"));
    expect(geometry("main")).toMatchObject({ x: "348px", w: "852px" });
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    await waitFor(() => expect(geometry("nav").w).toBe("320px")); // can't go below the minimum
    expect(geometry("main").x).toBe("332px");
  });

  it("dragging the seam resizes both panels, without re-rendering what's inside them", async () => {
    await ready();
    const before = { ...renders };
    const seam = screen.getByRole("separator", { name: "Resize Channels and Barkada HQ" });
    fireEvent.pointerDown(seam, { clientX: 326, clientY: 400, button: 0, pointerId: 7 });
    fireEvent.pointerMove(seam, { clientX: 426, clientY: 400, pointerId: 7 });
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    // Mid-drag: painted straight to the panels' CSS variables, nothing committed or re-rendered yet.
    expect(geometry("nav").w).toBe("420px");
    expect(geometry("main").x).toBe("432px");
    expect(panelEl("main")).toHaveAttribute("data-coupled");
    expect(renders).toEqual(before);
    expect(localStorage.getItem("diskarte:workspace:v1")).toBeNull();
    fireEvent.pointerUp(seam, { clientX: 426, clientY: 400, pointerId: 7 });
    await waitFor(() => expect(JSON.parse(localStorage.getItem("diskarte:workspace:v1")!).panels.nav.rect.w).toBeCloseTo(420 / 1200, 3));
    expect(panelEl("main")).not.toHaveAttribute("data-coupled");
    expect(renders).toEqual(before);
  });

  it("holding Alt / Option detaches: only the grabbed panel resizes", async () => {
    await ready();
    const main = geometry("main");
    fireEvent.pointerDown(handle("nav", "e"), { clientX: 320, clientY: 400, button: 0, pointerId: 3, altKey: true });
    fireEvent.pointerMove(handle("nav", "e"), { clientX: 380, clientY: 400, pointerId: 3, altKey: true });
    fireEvent.pointerUp(handle("nav", "e"), { clientX: 380, clientY: 400, pointerId: 3, altKey: true });
    await waitFor(() => expect(geometry("nav").w).toBe("380px"));
    expect(geometry("main")).toMatchObject({ x: main.x, w: main.w });
  });

  it("the keyboard Resize button carries docked neighbours too", async () => {
    const user = userEvent.setup();
    await ready();
    await user.click(screen.getByRole("button", { name: "Resize Channels panel" }));
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(geometry("nav").w).toBe("336px"));
    expect(geometry("main")).toMatchObject({ x: "348px", w: "852px" });
  });

  it("dragging a panel away by its header breaks the coupling", async () => {
    await ready();
    expect(screen.getByRole("separator", { name: "Resize Channels and Barkada HQ" })).toBeInTheDocument();
    // Moves are never coupled: the main panel stays put while the navigator leaves the seam.
    const main = geometry("main");
    drag(bar("nav"), [100, 10], [200, 10]);
    await waitFor(() => expect(geometry("nav").x).toBe("104px"));
    expect(geometry("main")).toMatchObject({ x: main.x, w: main.w });
    expect(screen.queryByRole("separator", { name: "Resize Channels and Barkada HQ" })).toBeNull();
    // …and resizing it no longer drags the old neighbour along.
    drag(handle("nav", "w"), [104, 400], [64, 400]);
    await waitFor(() => expect(geometry("nav")).toMatchObject({ x: "64px", w: "360px" }));
    expect(geometry("main")).toMatchObject({ x: main.x, w: main.w });
  });
});

describe("workspace presets on the command rail", () => {
  it("Minimal dock tucks every panel into the tray; Focus centres the active view; Multitask tiles and docks the roster", async () => {
    const user = userEvent.setup();
    await ready();
    const presets = screen.getByRole("group", { name: "Workspace layout" });

    await user.click(within(presets).getByRole("button", { name: "Minimal dock" }));
    expect(within(presets).getByRole("button", { name: "Minimal dock" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByTestId("panel-pill").map((p) => p.textContent)).toEqual(["Channels", "Barkada HQ"]);

    await user.click(within(presets).getByRole("button", { name: "Focus mode" }));
    expect(panelEl("nav")).toHaveAttribute("data-minimized");
    expect(panelEl("main")).not.toHaveAttribute("data-minimized");
    const main = geometry("main");
    expect(parseInt(main.x) + parseInt(main.w) / 2).toBeCloseTo(CANVAS.w / 2, -1);

    await user.click(within(presets).getByRole("button", { name: "Multitask mode" }));
    expect(screen.getByRole("complementary", { name: "Member roster" })).toHaveAttribute("data-roster", "docked");
    // A docked roster takes the right edge: the tiled panels end before it.
    await waitFor(() => expect(parseInt(geometry("main").x) + parseInt(geometry("main").w)).toBeLessThanOrEqual(CANVAS.w - 272 - 12));

    // Moving a panel by hand turns the preset into a custom layout.
    drag(bar("nav"), [100, 10], [140, 10]);
    expect(within(presets).getByRole("button", { name: "Multitask mode" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("micro-roster drawer", () => {
  it("slides out on demand, docks beside the panels, and closes", async () => {
    const user = userEvent.setup();
    await ready();
    // Closed, it's aria-hidden (so it has no accessible name to query by).
    const roster = document.querySelector<HTMLElement>("[data-roster]")!;
    expect(roster).toHaveAttribute("aria-label", "Member roster");
    expect(roster).toHaveAttribute("data-roster", "closed");
    expect(roster).toHaveAttribute("aria-hidden", "true");

    await user.click(within(screen.getByRole("group", { name: "Workspace layout" })).getByRole("button", { name: "Multitask mode" }));
    expect(roster).toHaveAttribute("data-roster", "docked");
    await user.click(within(roster).getByRole("button", { name: "Dock roster" }));
    expect(roster).toHaveAttribute("data-roster", "open");
    // Floating over the panels, they get the full width back.
    await waitFor(() => expect(parseInt(geometry("main").x) + parseInt(geometry("main").w)).toBeGreaterThan(CANVAS.w - 272));
    await user.click(within(roster).getByRole("button", { name: "Close roster" }));
    expect(roster).toHaveAttribute("data-roster", "closed");
  });

  it("is toggled from the channel header in the real shell, and shows the members", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    navigation.set(channelUrl(GENERAL.id));
    render(<DiskarteLayout />);
    const toggle = await screen.findByRole("button", { name: "Toggle member list" });
    expect(toggle).toHaveAttribute("aria-pressed", "true"); // the fixture's saved layout has it open
    await user.click(toggle);
    expect(document.querySelector("[data-roster]")).toHaveAttribute("data-roster", "closed");
    await user.click(toggle);
    expect(within(screen.getByRole("complementary", { name: "Member roster" })).getByTestId("member-list")).toHaveTextContent("Maria");
  });
});

describe("active call on the canvas", () => {
  it("keeps the call in the floating overlay and a Voice panel while you browse, without touching the connection", async () => {
    const user = userEvent.setup();
    navigation.set(channelUrl(TAMBAYAN.id));
    livekitMock.tracks = [mockCameraPlaceholder(mockParticipant(OWNER_ID, { isLocal: true })), mockCameraPlaceholder(mockParticipant(MOD_ID))];
    render(<DiskarteLayout />);
    await user.click(await screen.findByTestId("join-voice"));
    const dock = await screen.findByTestId("call-dock");
    await waitFor(() => expect(dock).toHaveTextContent("Voice Connected"));
    // One set of call controls: in the tray, not duplicated in the channel sidebar.
    expect(screen.getAllByTestId("call-dock")).toHaveLength(1);
    expect(within(screen.getByRole("region", { name: "Workspace tray" })).getByTestId("call-dock")).toBe(dock);
    // On the call's own page the stage is the main view, so there's no separate Voice panel.
    expect(document.querySelector('[data-panel="voice"]')).toBeNull();

    act(() => navigation.push(channelUrl(GENERAL.id)));
    const voice = await screen.findByRole("region", { name: "Voice · Tambayan 1" });
    expect(await within(voice).findByTestId("call-grid")).toBeInTheDocument();
    expect(within(voice).getAllByTestId("participant-tile")).toHaveLength(2);

    // Minimizing the panel (or any panel) leaves the room connected.
    const room = livekitMock.rooms.at(-1)!;
    await user.click(screen.getByRole("button", { name: "Minimize Voice · Tambayan 1" }));
    expect(dock).toHaveTextContent("Voice Connected");
    expect(room.disconnect).not.toHaveBeenCalled();
    await user.click(within(dock).getByRole("button", { name: "Show call" }));
    expect(panelEl("voice")).not.toHaveAttribute("data-minimized");

    await user.click(within(dock).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(screen.queryByTestId("call-dock")).toBeNull());
    expect(room.disconnect).toHaveBeenCalled();
    expect(document.querySelector('[data-panel="voice"]')).toBeNull();
  });
});
