import { describe, expect, it, vi } from "vitest";
import { parseShell, setShell, SHELL_COOKIE } from "@/lib/shell";

describe("shell preference", () => {
  it("only an exact 'pulse' opts in; everything else is Classic", () => {
    expect(parseShell("pulse")).toBe("pulse");
    for (const value of ["classic", undefined, null, "", "PULSE", " pulse", "pulse;", 1, {}]) expect(parseShell(value)).toBe("classic");
  });

  it("flips the attribute, saves the cookie and refreshes without reloading", () => {
    const router = { refresh: vi.fn() };
    setShell("pulse", router);
    expect(document.documentElement.dataset.shell).toBe("pulse");
    expect(document.cookie).toContain(`${SHELL_COOKIE}=pulse`);
    expect(router.refresh).toHaveBeenCalledOnce();
    setShell("classic", router);
    expect(document.documentElement.dataset.shell).toBe("classic");
    expect(document.cookie).toContain(`${SHELL_COOKIE}=classic`);
  });
});
