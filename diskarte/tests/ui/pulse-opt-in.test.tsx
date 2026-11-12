import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AdminAccessProvider } from "@/components/admin/AdminAccess";
import { RuntimeConfigProvider } from "@/components/providers/RuntimeConfig";
import { ShellPreviewToggle } from "@/components/profile/ShellPreviewToggle";
import { RUNTIME } from "../fixtures/layout";

beforeEach(() => { document.documentElement.dataset.shell = "classic"; });

function Toggle({ enabled = false, admin = false }: { enabled?: boolean; admin?: boolean }) {
  return <RuntimeConfigProvider value={{ ...RUNTIME, pulseOptIn: enabled }}><AdminAccessProvider role={admin ? "super_admin" : "member"}><ShellPreviewToggle /></AdminAccessProvider></RuntimeConfigProvider>;
}

describe("controlled Pulse opt-in", () => {
  it("keeps the public toggle hidden until enabled, while preserving admin preview", () => {
    const { rerender } = render(<Toggle />);
    expect(screen.queryByRole("switch")).toBeNull();
    rerender(<Toggle admin />);
    expect(screen.getByRole("switch", { name: "Try the new Diskarte" })).not.toBeChecked();
  });

  it("lets a member opt in and return to Classic without changing other preferences", async () => {
    localStorage.setItem("diskarte:display-prefs", '{"fontSize":18}');
    render(<Toggle enabled />);
    const toggle = screen.getByRole("switch", { name: "Try the new Diskarte" });
    fireEvent.click(toggle);
    expect(document.cookie).toContain("diskarte-shell=pulse");
    await waitFor(() => expect(toggle).toBeChecked());
    fireEvent.click(toggle);
    expect(document.cookie).toContain("diskarte-shell=classic");
    expect(localStorage.getItem("diskarte:display-prefs")).toBe('{"fontSize":18}');
  });
});
