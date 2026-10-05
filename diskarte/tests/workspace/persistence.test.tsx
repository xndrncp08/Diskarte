import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultWorkspace, type WorkspaceState } from "@/lib/workspace";

const updateUser = vi.fn(async () => ({ data: {}, error: null }));
vi.mock("@/components/providers/RuntimeConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/RuntimeConfig")>()),
  useOptionalSupabase: () => ({ auth: { updateUser } }),
}));

const { WorkspaceProvider, useWorkspaceStore } = await import("@/components/workspace/WorkspaceProvider");

const B = { x: 0, y: 0, w: 1200, h: 800 };
let store: ReturnType<typeof useWorkspaceStore>;
const keep = (s: typeof store) => void (store = s);
function Grab() {
  const s = useWorkspaceStore();
  useEffect(() => keep(s), [s]);
  return null;
}

beforeEach(() => {
  localStorage.clear();
  updateUser.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("workspace persistence", () => {
  it("restores whichever saved arrangement is newer: this browser's or the account's", () => {
    const local: WorkspaceState = { ...defaultWorkspace(B, 200), roster: "docked" };
    const remote: WorkspaceState = { ...defaultWorkspace(B, 100), roster: "open" };
    localStorage.setItem("diskarte:workspace:v1", JSON.stringify(local));
    const { unmount } = render(
      <WorkspaceProvider remote={remote}>
        <Grab />
      </WorkspaceProvider>,
    );
    expect(store.getState().roster).toBe("docked");
    unmount();

    render(
      <WorkspaceProvider remote={{ ...remote, t: 300 }}>
        <Grab />
      </WorkspaceProvider>,
    );
    expect(store.getState().roster).toBe("open");
  });

  it("ignores a tampered account copy", () => {
    render(
      <WorkspaceProvider remote={{ panels: "everywhere", t: 999 }}>
        <Grab />
      </WorkspaceProvider>,
    );
    expect(store.getState().roster).toBe("closed");
  });

  it("saves every change to this browser at once and syncs a burst of changes to the account once", () => {
    vi.useFakeTimers();
    render(
      <WorkspaceProvider>
        <Grab />
      </WorkspaceProvider>,
    );
    act(() => store.setBounds(B));
    act(() => {
      store.commitRect("nav", { x: 0, y: 0, w: 400, h: 600 });
      store.setRoster("docked");
      store.setMinimized("main", true);
    });
    const saved = JSON.parse(localStorage.getItem("diskarte:workspace:v1")!);
    expect(saved).toMatchObject({ roster: "docked", panels: { main: { minimized: true }, nav: { rect: { w: 0.3333, h: 0.75 } } } });
    // z values are stored compactly, in stacking order.
    expect(Object.values(saved.panels as Record<string, { z: number }>).map((p) => p.z).sort()).toEqual([1, 2, 3]);

    expect(updateUser).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(2600));
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith({ data: { workspace: expect.objectContaining({ roster: "docked" }) } });
  });

  it("doesn't write anything just for raising a panel or loading", () => {
    vi.useFakeTimers();
    render(
      <WorkspaceProvider remote={defaultWorkspace(B, 50)}>
        <Grab />
      </WorkspaceProvider>,
    );
    act(() => store.raise("nav"));
    act(() => vi.advanceTimersByTime(3000));
    expect(localStorage.getItem("diskarte:workspace:v1")).toBeNull();
    expect(updateUser).not.toHaveBeenCalled();
  });
});
