import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeContextMenuPosition, ContextMenu, ContextMenuItems, LONG_PRESS_MS, useContextMenu } from "@/components/ui/ContextMenu";
import { ConfirmHost, confirmAction } from "@/components/ui/ConfirmHost";
import type { MenuItem } from "@/components/ui/Menu";

describe("computeContextMenuPosition", () => {
  const viewport = { width: 1000, height: 800 };
  const floating = { width: 200, height: 300 };

  it("opens below-right of the pointer when there is room", () => {
    expect(computeContextMenuPosition({ point: { x: 100, y: 100 }, floating, viewport })).toEqual({ top: 100, left: 100 });
  });

  it("flips left of the pointer near the right edge and above it near the bottom", () => {
    expect(computeContextMenuPosition({ point: { x: 900, y: 700 }, floating, viewport })).toEqual({ top: 400, left: 700 });
  });

  it("stays inside the viewport padding when it fits neither way", () => {
    expect(computeContextMenuPosition({ point: { x: 150, y: 200 }, floating: { width: 200, height: 790 }, viewport })).toEqual({ top: 8, left: 150 });
  });
});

function Target({ name, items }: { name: string; items: MenuItem[] }) {
  const menu = useContextMenu();
  return (
    <div>
      <button type="button" {...menu.triggerProps}>
        {name}
      </button>
      <ContextMenu menu={menu} label={`${name} menu`}>
        <ContextMenuItems items={items} />
      </ContextMenu>
    </div>
  );
}

describe("ContextMenu", () => {
  afterEach(() => vi.useRealTimers());

  it("opens on right-click, runs the picked item and closes", async () => {
    const onSelect = vi.fn();
    render(<Target name="Row" items={[{ label: "Do it", onSelect }, { label: "Hidden", onSelect: vi.fn(), hidden: true }]} />);
    const notCancelled = fireEvent.contextMenu(screen.getByRole("button", { name: "Row" }), { clientX: 40, clientY: 50 });
    expect(notCancelled).toBe(false); // the browser menu is suppressed
    const menu = screen.getByRole("menu", { name: "Row menu" });
    expect(menu).toHaveStyle({ top: "50px", left: "40px" });
    expect(screen.queryByRole("menuitem", { name: "Hidden" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Do it" }));
    expect(onSelect).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("keeps the browser menu for Shift+right-click and inside text fields", () => {
    function Field() {
      const menu = useContextMenu();
      return (
        <div data-testid="area" {...menu.triggerProps}>
          <input aria-label="Text" />
          <ContextMenu menu={menu} label="Area menu">
            <ContextMenuItems items={[{ label: "Do it", onSelect: vi.fn() }]} />
          </ContextMenu>
        </div>
      );
    }
    render(<Field />);
    expect(fireEvent.contextMenu(screen.getByTestId("area"), { shiftKey: true })).toBe(true);
    expect(fireEvent.contextMenu(screen.getByLabelText("Text"))).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(fireEvent.contextMenu(screen.getByTestId("area"), { clientX: 3, clientY: 3 })).toBe(false);
    expect(screen.getByRole("menu", { name: "Area menu" })).toBeInTheDocument();
  });

  it("closes on Escape and when another context menu opens", async () => {
    render(
      <>
        <Target name="First" items={[{ label: "One", onSelect: vi.fn() }]} />
        <Target name="Second" items={[{ label: "Two", onSelect: vi.fn() }]} />
      </>,
    );
    fireEvent.contextMenu(screen.getByRole("button", { name: "First" }), { clientX: 5, clientY: 5 });
    expect(screen.getByRole("menu", { name: "First menu" })).toBeInTheDocument();
    fireEvent.contextMenu(screen.getByRole("button", { name: "Second" }), { clientX: 9, clientY: 9 });
    await vi.waitFor(() => expect(screen.queryByRole("menu", { name: "First menu" })).toBeNull());
    expect(screen.getByRole("menu", { name: "Second menu" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await vi.waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("opens from the keyboard with Shift+F10", () => {
    render(<Target name="Row" items={[{ label: "Do it", onSelect: vi.fn() }]} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Row" }), { key: "F10", shiftKey: true });
    expect(screen.getByRole("menu", { name: "Row menu" })).toBeInTheDocument();
  });

  it("opens on a touch long-press and swallows the tap that ends it", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    function Pressable() {
      const menu = useContextMenu();
      return (
        <>
          <button type="button" onClick={onClick} {...menu.triggerProps}>
            Row
          </button>
          <ContextMenu menu={menu} label="Row menu">
            <ContextMenuItems items={[{ label: "Do it", onSelect: vi.fn() }]} />
          </ContextMenu>
        </>
      );
    }
    render(<Pressable />);
    const row = screen.getByRole("button", { name: "Row" });
    fireEvent.pointerDown(row, { pointerType: "touch", clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(screen.getByRole("menu", { name: "Row menu" })).toBeInTheDocument();
    fireEvent.pointerUp(row);
    fireEvent.click(row);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not open when the finger moves (a scroll)", () => {
    vi.useFakeTimers();
    render(<Target name="Row" items={[{ label: "Do it", onSelect: vi.fn() }]} />);
    const row = screen.getByRole("button", { name: "Row" });
    fireEvent.pointerDown(row, { pointerType: "touch", clientX: 10, clientY: 10 });
    fireEvent.pointerMove(row, { pointerType: "touch", clientX: 10, clientY: 40 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("confirmAction", () => {
  it("asks first, passes the optional reason and closes once the action succeeds", async () => {
    const onConfirm = vi.fn(async () => true);
    render(<ConfirmHost />);
    act(() => confirmAction({ title: "Ban Juan?", confirmLabel: "Ban", reason: { label: "Reason (optional)" }, onConfirm }));
    const dialog = await screen.findByRole("dialog", { name: "Ban Juan?" });
    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: " spam " } });
    fireEvent.click(screen.getByRole("button", { name: "Ban" }));
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledWith("spam"));
    await vi.waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  it("stays open when the action reports failure", async () => {
    render(<ConfirmHost />);
    act(() => confirmAction({ title: "Kick Juan?", confirmLabel: "Kick", onConfirm: async () => false }));
    fireEvent.click(await screen.findByRole("button", { name: "Kick" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole("dialog", { name: "Kick Juan?" })).toBeInTheDocument();
  });
});
