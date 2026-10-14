import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { navigation } from "../mocks/navigation";
import { RuntimeConfigProvider } from "@/components/providers/RuntimeConfig";
import { ShellUIProvider } from "@/components/shell/ShellUI";
import { CommandPalette } from "@/components/workspace/CommandPalette";
import { constrainPanel } from "@/components/workspace/FloatingPanelControls";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";

const runtime = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key-that-is-long-enough", livekitUrl: "wss://proj.livekit.cloud", siteUrl: "http://localhost:3000" };

describe("workspace boundaries", () => {
  it("clamps restored windows into a smaller viewport", () => {
    expect(constrainPanel({ x: 2000, y: -20, width: 1200, height: 30 }, 900, 600)).toEqual({ x: 0, y: 0, width: 900, height: 240 });
    expect(constrainPanel({ x: 30, y: 10, width: 300, height: 400 }, 200, 180)).toEqual({ x: 0, y: 0, width: 200, height: 180 });
  });

  it("moves and resizes a floating panel with the keyboard and restores columns", async () => {
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200);
    const height = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
    const match = vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList);
    localStorage.setItem("diskarte:layout:v2", JSON.stringify({ mode: "floating", membersOpen: false }));
    const view = render(<WorkspaceProvider><ShellUIProvider><div data-workspace=""><WorkspacePanel id="main" title="Chat">conversation</WorkspacePanel></div></ShellUIProvider></WorkspaceProvider>);
    const move = await screen.findByRole("button", { name: "Move Chat" });
    const before = screen.getByRole("main").style.left;
    fireEvent.keyDown(move, { key: "ArrowLeft" });
    expect(screen.getByRole("main").style.left).not.toBe(before);
    fireEvent.keyDown(screen.getByRole("button", { name: "Resize Chat window" }), { key: "ArrowLeft" });
    expect(JSON.parse(localStorage.getItem("diskarte:layout:v2")!).panels.main.width).toBe(888);
    view.unmount(); width.mockRestore(); height.mockRestore(); match.mockRestore(); localStorage.clear();
  });
});

it("filters the palette and opens a destination with Enter", async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  navigation.reset("/tambayan");
  render(<RuntimeConfigProvider value={runtime}><ShellUIProvider><CommandPalette servers={[]} onClose={close} /></ShellUIProvider></RuntimeConfigProvider>);
  const input = screen.getByRole("combobox");
  await waitFor(() => expect(input).toHaveFocus());
  await user.type(input, "Explore");
  expect(screen.getAllByRole("option")).toHaveLength(1);
  await user.keyboard("{Enter}");
  expect(navigation.path).toBe("/tambayan/explore");
  expect(close).toHaveBeenCalledOnce();
});
