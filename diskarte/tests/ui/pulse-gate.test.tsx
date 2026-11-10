import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// While Pulse is a preview, the server renders it only for super admins, whatever the cookie says.
const state = vi.hoisted(() => ({ role: "member", cookie: "pulse" as string | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === "diskarte-shell" && state.cookie ? { value: state.cookie } : undefined) }) }));
vi.mock("@/lib/auth", () => ({ requireProfile: async () => ({ profile: { id: "u1" } }) }));
vi.mock("@/lib/data/servers", () => ({ getMyServers: async () => [] }));
vi.mock("@/lib/admin-server", () => ({ getPlatformRole: async () => state.role }));

const { default: TambayanLayout } = await import("@/app/(app)/tambayan/layout");
const { previewShell } = await import("@/lib/shell");
const { PulseShell } = await import("@/components/pulse/shell/PulseShell");
const { ClassicFrame } = await import("@/components/shell/AppShell");

async function frame() {
  const tree = (await TambayanLayout({ children: null, params: Promise.resolve({}) } as never)) as ReactElement<{ shell: string; children: ReactElement }>;
  expect(isValidElement(tree)).toBe(true);
  return { shell: tree.props.shell, frame: tree.props.children.type };
}

beforeEach(() => {
  state.role = "member";
  state.cookie = "pulse";
});

describe("Pulse preview gate", () => {
  it("previewShell honours the cookie only for super admins", () => {
    expect(previewShell("pulse", "super_admin")).toBe("pulse");
    expect(previewShell("classic", "super_admin")).toBe("classic");
    for (const role of ["member", "moderator", "admin", ""]) expect(previewShell("pulse", role)).toBe("classic");
  });

  it("a member who sets the cookie by hand still gets Classic", async () => {
    expect(await frame()).toEqual({ shell: "classic", frame: ClassicFrame });
  });

  it("a super admin with the cookie gets Pulse; without it, Classic", async () => {
    state.role = "super_admin";
    expect(await frame()).toEqual({ shell: "pulse", frame: PulseShell });
    state.cookie = undefined;
    expect(await frame()).toEqual({ shell: "classic", frame: ClassicFrame });
  });
});
