import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { navigation } from "../mocks/navigation";

const fake = createFakeSupabase({ system_broadcasts: [] });
/** The fake client's rpc, loosened so tests can answer with any payload. */
const rpc = fake.client.rpc as unknown as ReturnType<typeof vi.fn<(name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: null }>>>;
const signOut = vi.fn(async () => ({ error: null }));
Object.assign(fake.client, { auth: { signOut } });
vi.mock("@/components/providers/RuntimeConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/RuntimeConfig")>()),
  useSupabase: () => fake.client,
}));
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { toastMock } = await import("../mocks/actions");
const { MeProvider, useMe } = await import("@/components/providers/MeProvider");
const { RuntimeConfigProvider } = await import("@/components/providers/RuntimeConfig");
const { CallProvider } = await import("@/components/voice/CallProvider");
const { PresenceProvider } = await import("@/components/providers/PresenceProvider");
const { BroadcastBanner } = await import("@/components/broadcast/BroadcastBanner");
const { SessionGuard } = await import("@/components/session/SessionGuard");
const { MessageMarkdown } = await import("@/components/chat/MessageMarkdown");
const { AdminAccessProvider } = await import("@/components/admin/AdminAccess");
const { ServerRail } = await import("@/components/shell/ServerRail");
const { WorkspaceProvider } = await import("@/components/workspace/WorkspaceProvider");
const { RUNTIME } = await import("../fixtures/layout");
const { makeProfile, server } = await import("../fixtures/server");

const ME = makeProfile("00000000-0000-4000-8000-0000000000c1", "Juan");
const OTHER = "00000000-0000-4000-8000-0000000000aa";
const HQ = "d15ca47e-0000-4000-8000-000000000001";

function broadcast(extra: Record<string, unknown> = {}) {
  return {
    id: "b1",
    author_id: OTHER,
    title: "Maintenance tonight",
    body: "> [!WARNING]\n> Voice goes down at **23:00** for ten minutes.",
    tone: "warning",
    targets: ["announcements"],
    message_ids: [],
    sticky: true,
    sticky_until: null,
    retracted_at: null,
    created_at: new Date().toISOString(),
    ...extra,
  };
}

beforeEach(() => {
  localStorage.clear();
  signOut.mockClear();
  toastMock.toast.mockClear();
  rpc.mockReset();
  rpc.mockImplementation(async () => ({ data: { signOut: false }, error: null }));
});
afterEach(() => vi.useRealTimers());

describe("sticky global banner", () => {
  function renderBanner() {
    return render(
      <MeProvider profile={ME}>
        <BroadcastBanner />
      </MeProvider>,
    );
  }

  it("appears on an open canvas the moment a sticky broadcast goes out — no reload", async () => {
    renderBanner();
    await waitFor(() => expect(fake.joined(`db:broadcasts:${HQ}`)).toBeDefined());
    expect(screen.queryByTestId("broadcast-banner")).toBeNull();

    act(() => fake.emitDb("system_broadcasts", "INSERT", broadcast()));
    const banner = await screen.findByTestId("broadcast-banner");
    expect(banner).toHaveTextContent("Maintenance tonight");
    expect(banner).toHaveTextContent("Voice goes down at 23:00 for ten minutes.");
    expect(screen.getByRole("link", { name: "Read" })).toHaveAttribute("href", `/tambayan/${HQ}/d15ca47e-0000-4000-8000-0000000000a1`);
    expect(toastMock.toast).toHaveBeenCalledWith("Maintenance tonight", expect.objectContaining({ description: expect.stringContaining("Voice goes down") }));

    // Taken down in the Control Center: gone everywhere.
    act(() => fake.emitDb("system_broadcasts", "UPDATE", broadcast({ retracted_at: new Date().toISOString() })));
    await waitFor(() => expect(screen.queryByTestId("broadcast-banner")).toBeNull());
  });

  it("toasts non-sticky broadcasts without a banner, and remembers dismissals", async () => {
    const user = userEvent.setup();
    const { unmount } = renderBanner();
    await waitFor(() => expect(fake.joined(`db:broadcasts:${HQ}`)).toBeDefined());
    act(() => fake.emitDb("system_broadcasts", "INSERT", broadcast({ id: "b2", sticky: false, title: "Patch notes" })));
    expect(toastMock.toast).toHaveBeenCalledWith("Patch notes", expect.anything());
    expect(screen.queryByTestId("broadcast-banner")).toBeNull();

    act(() => fake.emitDb("system_broadcasts", "INSERT", broadcast({ id: "b3" })));
    await user.click(await screen.findByRole("button", { name: "Dismiss announcement" }));
    await waitFor(() => expect(screen.queryByTestId("broadcast-banner")).toBeNull());
    expect(JSON.parse(localStorage.getItem("diskarte:broadcasts-dismissed")!)).toEqual(["b3"]);
    unmount();
  });

  it("doesn't toast the author's own broadcast", async () => {
    renderBanner();
    await waitFor(() => expect(fake.joined(`db:broadcasts:${HQ}`)).toBeDefined());
    act(() => fake.emitDb("system_broadcasts", "INSERT", broadcast({ id: "b4", author_id: ME.id })));
    expect(toastMock.toast).not.toHaveBeenCalled();
  });
});

describe("session guard", () => {
  function Status() {
    const { me } = useMe();
    return <output data-testid="my-status">{`${me.status}|${me.custom_status ?? ""}`}</output>;
  }
  function renderGuard() {
    return render(
      <RuntimeConfigProvider value={RUNTIME}>
        <MeProvider profile={ME}>
          <PresenceProvider>
            <CallProvider>
              <SessionGuard />
              <Status />
            </CallProvider>
          </PresenceProvider>
        </MeProvider>
      </RuntimeConfigProvider>,
    );
  }

  it("heartbeats this device with its status and fingerprint", async () => {
    renderGuard();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("heartbeat_device", expect.objectContaining({ p_status: "online", p_voice_channel_id: null })));
    const args = rpc.mock.calls.find((c) => c[0] === "heartbeat_device")![1] as Record<string, string>;
    expect(args.p_device_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(args.p_fingerprint).toMatch(/^[0-9a-f]{32}$/);
    expect(localStorage.getItem("diskarte:device-id")).toBe(args.p_device_id);
  });

  it("signs the tab out when the heartbeat reports a ban", async () => {
    rpc.mockImplementation(async () => ({ data: { signOut: true, reason: "banned", banReason: "Spam" }, error: null }));
    renderGuard();
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: "local" }));
  });

  it("signs out instantly when sessions are revoked over realtime", async () => {
    renderGuard();
    await waitFor(() => expect(fake.joined(`db:account:${ME.id}`)).toBeDefined());
    act(() => fake.emitDb("account_controls", "UPDATE", { user_id: ME.id, banned_until: null, sessions_revoked_at: new Date(Date.now() + 1000).toISOString() }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });

  it("adopts a forced status override", async () => {
    renderGuard();
    await waitFor(() => expect(fake.joined(`db:account:${ME.id}`)).toBeDefined());
    act(() =>
      fake.emitDb("account_controls", "UPDATE", {
        user_id: ME.id,
        banned_until: null,
        sessions_revoked_at: null,
        status_override: { status: "idle", custom_status: "AFK / Tulog" },
        status_override_at: new Date(Date.now() + 1000).toISOString(),
      }),
    );
    expect(await screen.findByText("idle|AFK / Tulog")).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe("callout boxes in chat Markdown", () => {
  it("renders [!TONE] blockquotes as labelled glass callouts and leaves plain quotes alone", () => {
    render(<MessageMarkdown content={"## Release\n\n> [!CRITICAL]\n> Update now.\n\n> [!TIP]\n> Try the new stage.\n\n> just a quote\n\n```ts\nconst ok = true;\n```"} />);
    expect(screen.getByRole("heading", { name: "Release" })).toBeInTheDocument();
    const critical = screen.getByRole("note", { name: "Critical" });
    expect(critical).toHaveAttribute("data-tone", "critical");
    expect(critical).toHaveTextContent("Update now.");
    expect(critical).not.toHaveTextContent("[!CRITICAL]");
    expect(screen.getByRole("note", { name: "Success" })).toHaveTextContent("Try the new stage.");
    expect(screen.getByText("just a quote").closest("blockquote")).not.toBeNull();
    expect(screen.getByText("ok", { exact: false }).closest("pre")).not.toBeNull();
  });

  it("ignores unknown markers", () => {
    render(<MessageMarkdown content={"> [!PARTY]\n> nope"} />);
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("Control Center entry on the rail", () => {
  function renderRail(role: "super_admin" | "moderator" | "member") {
    return render(
      <RuntimeConfigProvider value={RUNTIME}>
        <MeProvider profile={ME}>
          <PresenceProvider>
            <CallProvider>
              <AdminAccessProvider role={role}>
                <WorkspaceProvider>
                  <ServerRail servers={[server]} />
                </WorkspaceProvider>
              </AdminAccessProvider>
            </CallProvider>
          </PresenceProvider>
        </MeProvider>
      </RuntimeConfigProvider>,
    );
  }

  beforeEach(() => navigation.reset("/tambayan"));

  it("only exists for super admins (phones link to the Control Center page)", () => {
    const { unmount } = renderRail("member");
    expect(screen.queryByTestId("control-center-toggle")).toBeNull();
    unmount();
    renderRail("moderator");
    expect(screen.queryByTestId("control-center-toggle")).toBeNull();
  });

  it("links super admins to /tambayan/admin when there's no canvas", () => {
    renderRail("super_admin");
    expect(screen.getByTestId("control-center-toggle")).toHaveAttribute("href", "/tambayan/admin");
  });
});
