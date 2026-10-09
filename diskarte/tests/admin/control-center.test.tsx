import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminSnapshot, AdminUser } from "@/lib/admin";
import { createFakeSupabase } from "../fixtures/fake-supabase";

const fake = createFakeSupabase();
vi.mock("@/components/providers/RuntimeConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/RuntimeConfig")>()),
  useSupabase: () => fake.client,
}));
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);
const adminActions = vi.hoisted(() => ({
  dispatchBroadcastAction: vi.fn(async () => ({ ok: true, data: { id: "b-new" } })),
  retractBroadcastAction: vi.fn(async () => ({ ok: true })),
  setRoleAction: vi.fn(async () => ({ ok: true })),
  overrideStatusAction: vi.fn(async () => ({ ok: true })),
  revokeSessionsAction: vi.fn(async () => ({ ok: true, data: { sessions: 2 } })),
  banUserAction: vi.fn(async () => ({ ok: true })),
  unbanUserAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/actions/admin", () => adminActions);

const { MeProvider } = await import("@/components/providers/MeProvider");
const { ConfirmHost } = await import("@/components/ui/ConfirmHost");
const { AdminControlCenter } = await import("@/components/admin/AdminControlCenter");
const { makeProfile } = await import("../fixtures/server");

const ADMIN = makeProfile("00000000-0000-4000-8000-0000000000aa", "Supremo");
const NOW = new Date().toISOString();
const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();

function adminUser(username: string, extra: Partial<AdminUser> = {}): AdminUser {
  return {
    id: `00000000-0000-4000-8000-${String(username.length).padStart(4, "0")}${username.padEnd(8, "0").slice(0, 8).replace(/[^0-9a-f]/g, "0")}`,
    username,
    display_name: username[0].toUpperCase() + username.slice(1),
    avatar_preset: "araw",
    avatar_url: null,
    status: "online",
    custom_status: null,
    email: `${username}@diskarte.ph`,
    created_at: ago(86400 * 3),
    last_sign_in_at: ago(600),
    role: "member",
    banned_until: null,
    ban_reason: null,
    sessions: 1,
    last_seen_at: ago(5),
    devices: [
      {
        device_id: "11111111-1111-4111-8111-111111111111",
        fingerprint: "abcdef0123456789abcdef0123456789",
        label: "Firefox on Linux",
        status: "online",
        custom_status: null,
        voice_channel_id: null,
        first_seen_at: ago(3600),
        last_seen_at: ago(5),
      },
    ],
    ...extra,
  };
}

const juan = adminUser("juan");
const maria = adminUser("maria", {
  devices: [{ ...juan.devices[0], device_id: "22222222-2222-4222-8222-222222222222", status: "idle", custom_status: "Nagluto ng Canton", voice_channel_id: "vc-1" }],
});
const me = adminUser("supremo", { id: ADMIN.id, role: "super_admin" });

function snapshot(): AdminSnapshot {
  return {
    overview: { users: 3, online: 2, in_voice: 1, banned: 0, super_admins: 1, moderators: 0, broadcasts: 1, last7: Array.from({ length: 7 }, (_, i) => ({ day: `2026-10-0${i + 1}`, count: i })) },
    users: [me, juan, maria],
    voice: {
      configured: true,
      error: null,
      rooms: [{ room: "voice:vc-1", kind: "voice", channelId: "vc-1", label: "Tambayan 1 · Barkada", participants: [{ identity: maria.id, name: "Maria", joinedAt: ago(125), micLive: true, camera: false, screen: false }] }],
    },
    audit: [{ id: "a1", actor_id: ADMIN.id, action: "user.role_update", target_user_id: juan.id, details: { from: "member", to: "moderator" }, created_at: NOW }],
    broadcasts: [
      { id: "b1", author_id: ADMIN.id, title: "Maintenance tonight", body: "Back soon", tone: "warning", targets: ["announcements"], message_ids: [], sticky: true, sticky_until: null, retracted_at: null, created_at: ago(60) },
    ],
    generatedAt: NOW,
  };
}

const fetchMock = vi.fn(async () => new Response(JSON.stringify(snapshot()), { status: 200, headers: { "Content-Type": "application/json" } }));

function renderCenter() {
  return render(
    <MeProvider profile={ADMIN}>
      <AdminControlCenter />
      <ConfirmHost />
    </MeProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
  Object.values(adminActions).forEach((f) => f.mockClear());
});
afterEach(() => vi.unstubAllGlobals());

describe("Super Admin Control Center", () => {
  it("loads the snapshot and shows tabular network telemetry", async () => {
    renderCenter();
    expect(await screen.findByTestId("stat-users")).toHaveTextContent("3");
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/snapshot", expect.objectContaining({ cache: "no-store" }));
    for (const id of ["stat-users", "stat-online", "stat-in-voice", "stat-banned"]) {
      expect(screen.getByTestId(id).querySelector(".tabular-nums")).not.toBeNull();
    }
    expect(screen.getAllByTestId("roster-row").map((r) => r.dataset.user)).toEqual(["supremo", "juan", "maria"]);
  });

  it("filters the roster client-side instantly and narrows the server search", async () => {
    const user = userEvent.setup();
    renderCenter();
    await screen.findAllByTestId("roster-row");
    await user.type(screen.getByTestId("roster-search"), "mar");
    expect(screen.getAllByTestId("roster-row").map((r) => r.dataset.user)).toEqual(["maria"]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/snapshot?q=mar", expect.anything()));

    await user.clear(screen.getByTestId("roster-search"));
    await user.selectOptions(screen.getByLabelText("Filter by presence"), "canton");
    expect(screen.getAllByTestId("roster-row").map((r) => r.dataset.user)).toEqual(["maria"]);
    await user.selectOptions(screen.getByLabelText("Filter by presence"), "all");
    await user.selectOptions(screen.getByLabelText("Filter by role"), "super_admin");
    expect(screen.getAllByTestId("roster-row").map((r) => r.dataset.user)).toEqual(["supremo"]);
    await user.selectOptions(screen.getByLabelText("Filter by role"), "all");
    await user.selectOptions(screen.getByLabelText("Filter by channel participation"), "Tambayan 1 · Barkada");
    expect(screen.getAllByTestId("roster-row").map((r) => r.dataset.user)).toEqual(["maria"]);
  }, 15_000);

  it("inspects an account: devices, live stage and moderation actions with confirmation", async () => {
    const user = userEvent.setup();
    renderCenter();
    await user.click((await screen.findAllByTestId("roster-row")).find((r) => r.dataset.user === "maria")!);
    const inspector = screen.getByTestId("user-inspector");
    expect(within(inspector).getByText("Firefox on Linux")).toBeInTheDocument();
    expect(within(inspector).getByText("abcdef0123456789")).toHaveClass("tabular-nums");
    expect(within(inspector).getByText("Tambayan 1 · Barkada")).toBeInTheDocument();
    expect(within(inspector).getByLabelText("Mic live")).toBeInTheDocument();

    await user.click(within(inspector).getByRole("radio", { name: "Moderator" }));
    expect(adminActions.setRoleAction).toHaveBeenCalledWith({ userId: maria.id, role: "moderator" });

    await user.click(within(inspector).getByRole("button", { name: /Revoke sessions/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Revoke sessions" }));
    expect(adminActions.revokeSessionsAction).toHaveBeenCalledWith({ userId: maria.id });

    await user.selectOptions(within(inspector).getByLabelText("Ban length"), "168");
    await user.click(within(inspector).getByRole("button", { name: /^Ban$/ }));
    const dialog = await screen.findByRole("dialog", { name: /Ban Maria for 7 days/ });
    await user.type(within(dialog).getByRole("textbox"), "Spamming the lounge");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Ban account" })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: "Ban account" }));
    expect(adminActions.banUserAction).toHaveBeenCalledWith({ userId: maria.id, hours: 168, reason: "Spamming the lounge" });

    await user.clear(within(inspector).getByLabelText("Custom status"));
    await user.click(within(inspector).getByRole("button", { name: "AFK / Tulog" }));
    // Button keeps a just-finished spinner up for a beat (useMinimumLoading): wait until it's enabled.
    await waitFor(() => expect(within(inspector).getByRole("button", { name: "Apply" })).toBeEnabled());
    await user.click(within(inspector).getByRole("button", { name: "Apply" }));
    expect(adminActions.overrideStatusAction).toHaveBeenCalledWith({ userId: maria.id, status: "idle", customStatus: "AFK / Tulog" });
  });

  it("never offers role changes, revocation or bans against yourself", async () => {
    const user = userEvent.setup();
    renderCenter();
    await user.click((await screen.findAllByTestId("roster-row")).find((r) => r.dataset.user === "supremo")!);
    const inspector = screen.getByTestId("user-inspector");
    expect(within(inspector).getByRole("radio", { name: "Moderator" })).toBeDisabled();
    expect(within(inspector).getByRole("button", { name: /Revoke sessions/ })).toBeDisabled();
    expect(within(inspector).getByRole("button", { name: /^Ban$/ })).toBeDisabled();
  });

  it("composes, previews and dispatches a broadcast with a sticky banner", async () => {
    const user = userEvent.setup();
    renderCenter();
    await screen.findAllByTestId("roster-row");
    await user.click(screen.getByRole("tab", { name: "Broadcast" }));
    await user.type(screen.getByTestId("broadcast-title"), "v2.1 is live");
    await user.click(screen.getByRole("radio", { name: "Success" }));
    await user.click(screen.getByRole("button", { name: "Callout box" }));
    expect((screen.getByTestId("broadcast-body") as HTMLTextAreaElement).value).toBe("> [!SUCCESS]\n> Heads up: what everyone should know");
    await user.click(screen.getByRole("button", { name: "Code block" }));
    await user.click(screen.getByText("global-lounge"));
    await user.click(screen.getByRole("switch", { name: "Sticky global banner" }));

    await user.click(screen.getByRole("radio", { name: "Preview" }));
    const preview = screen.getByTestId("broadcast-preview");
    expect(within(preview).getByRole("heading", { name: "v2.1 is live" })).toBeInTheDocument();
    expect(within(preview).getByRole("note", { name: "Success" })).toBeInTheDocument();
    expect(within(preview).getByText("Preview")).toBeInTheDocument(); // the banner preview

    await user.click(screen.getByTestId("broadcast-send"));
    await user.click(within(await screen.findByRole("dialog", { name: /Broadcast to #announcements and #global-lounge/ })).getByRole("button", { name: "Broadcast" }));
    await waitFor(() => expect(adminActions.dispatchBroadcastAction).toHaveBeenCalledTimes(1));
    expect(adminActions.dispatchBroadcastAction).toHaveBeenCalledWith(
      expect.objectContaining({ title: "v2.1 is live", tone: "success", targets: ["announcements", "global-lounge"], sticky: true, stickyHours: 24 }),
    );
  });

  it("takes a live sticky banner down from the recent broadcasts", async () => {
    const user = userEvent.setup();
    renderCenter();
    await screen.findAllByTestId("roster-row");
    await user.click(screen.getByRole("tab", { name: "Broadcast" }));
    await user.click(screen.getByRole("button", { name: "Take down banner: Maintenance tonight" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Take down" }));
    expect(adminActions.retractBroadcastAction).toHaveBeenCalledWith({ broadcastId: "b1" });
  });

  it("shows live voice stages and the audit trail", async () => {
    const user = userEvent.setup();
    renderCenter();
    await screen.findAllByTestId("roster-row");
    await user.click(screen.getByRole("tab", { name: "Voice" }));
    const room = screen.getByTestId("voice-room");
    expect(within(room).getByText("Tambayan 1 · Barkada")).toBeInTheDocument();
    expect(within(room).getByText(/^2:0\d$/)).toHaveClass("tabular-nums");
    await user.click(screen.getByRole("tab", { name: "Audit" }));
    expect(screen.getByTestId("audit-row")).toHaveTextContent("Supremo changed role Juan");
    expect(screen.getByTestId("audit-row")).toHaveTextContent("Standard Member → Moderator");
  });

  it("refreshes live from the private admin realtime feed", async () => {
    renderCenter();
    await screen.findAllByTestId("roster-row");
    await waitFor(() => expect(fake.joined(`db:admin:${ADMIN.id}`)).toBeDefined());
    expect(await screen.findByText("Live")).toBeInTheDocument();
    const before = fetchMock.mock.calls.length;
    act(() => fake.emitDb("user_devices", "UPDATE", { user_id: juan.id }));
    act(() => fake.emitDb("user_devices", "UPDATE", { user_id: maria.id }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(before + 1), { timeout: 2000 });
  });

  it("explains a refused snapshot instead of rendering admin data", async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }));
    renderCenter();
    expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
    expect(screen.queryByTestId("roster-row")).toBeNull();
  });
});
