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
const { resolveShell } = await import("@/lib/shell");
const { AppFrame } = await import("@/components/shell/AppFrame");

async function frame() {
  const tree = (await TambayanLayout({ children: null, params: Promise.resolve({}) } as never)) as ReactElement<{ shell: string; children: ReactElement }>;
  expect(isValidElement(tree)).toBe(true);
  return { shell: tree.props.shell, frame: tree.props.children.type };
}

beforeEach(() => {
  vi.stubEnv("DISKARTE_PULSE_ROLLOUT", "");
  state.role = "member";
  state.cookie = "pulse";
});

describe("Pulse preview gate", () => {
  it("resolveShell honours the cookie only for super admins", () => {
    expect(resolveShell("pulse", "super_admin")).toBe("pulse");
    expect(resolveShell("classic", "super_admin")).toBe("classic");
    for (const role of ["member", "moderator", "admin", ""]) expect(resolveShell("pulse", role)).toBe("classic");
  });

  it("public opt-in accepts an explicit Pulse preference for members, but keeps Classic the default", async () => {
    vi.stubEnv("DISKARTE_PULSE_ROLLOUT", "opt-in");
    expect(resolveShell("pulse", "member", true)).toBe("pulse");
    expect(await frame()).toEqual({ shell: "pulse", frame: AppFrame });
    state.cookie = undefined;
    expect(await frame()).toEqual({ shell: "classic", frame: AppFrame });
  });

  it("a member who sets the cookie by hand still gets Classic", async () => {
    expect(await frame()).toEqual({ shell: "classic", frame: AppFrame });
  });

  it("a super admin with the cookie gets Pulse; without it, Classic", async () => {
    state.role = "super_admin";
    expect(await frame()).toEqual({ shell: "pulse", frame: AppFrame });
    state.cookie = undefined;
    expect(await frame()).toEqual({ shell: "classic", frame: AppFrame });
  });
});
