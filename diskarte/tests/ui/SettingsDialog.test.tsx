import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { livekitMock } from "../mocks/livekit";
import { navigation } from "../mocks/navigation";

vi.mock("@/actions/messages", async () => (await import("../mocks/actions")).messageActions);
vi.mock("@/actions/servers", async () => (await import("../mocks/actions")).serverActions);
vi.mock("@/actions/profile", async () => (await import("../mocks/actions")).profileActions);
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- typed for toHaveBeenCalledWith
const deleteAccountAction = vi.fn(async (_input: { confirm: string }) => ({ error: "Couldn't delete your account. Try again." }));
vi.mock("@/actions/account", () => ({ changePasswordAction: vi.fn(async () => ({})), deleteAccountAction: (input: { confirm: string }) => deleteAccountAction(input) }));
vi.mock("@/app/(auth)/actions", () => ({ signOutAction: vi.fn(async () => undefined) }));
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { AppShell } = await import("@/components/shell/AppShell");
const { SessionProviders } = await import("@/components/shell/SessionProviders");
const { UserPanel } = await import("@/components/shell/UserPanel");
const { useCall } = await import("@/components/voice/CallProvider");
const { RuntimeConfigProvider } = await import("@/components/providers/RuntimeConfig");
const { ACCOUNT, MEMBERS, RUNTIME, TAMBAYAN, channelUrl } = await import("../fixtures/layout");
const { SERVER_ID, server } = await import("../fixtures/server");

const ROUTE = channelUrl(TAMBAYAN.id);

function VoiceHarness() {
  const call = useCall();
  return (
    <>
      <button type="button" onClick={() => void call.join({ serverId: SERVER_ID, serverName: server.name, channelId: TAMBAYAN.id, channelName: TAMBAYAN.name })}>
        Join voice
      </button>
      <output data-testid="call-status">{call.status}</output>
      <UserPanel />
    </>
  );
}

function renderShell() {
  return render(
    <RuntimeConfigProvider value={RUNTIME}>
      <SessionProviders profile={MEMBERS[0].profile} account={ACCOUNT}>
        <AppShell servers={[server]}>
        <VoiceHarness />
        </AppShell>
      </SessionProviders>
    </RuntimeConfigProvider>,
  );
}

const settingsButton = () => within(screen.getByTestId("user-panel")).getByRole("link", { name: "User settings" });

beforeEach(() => {
  navigation.reset(ROUTE);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ token: "jwt", url: RUNTIME.livekitUrl, room: `voice:${TAMBAYAN.id}` }), { status: 200 })),
  );
});

describe("Settings dialog", () => {
  it("keeps an active voice call connected while settings are opened, browsed and closed", async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole("button", { name: "Join voice" }));
    await waitFor(() => expect(screen.getByTestId("call-status")).toHaveTextContent("connected"));
    expect(livekitMock.rooms).toHaveLength(1);
    const room = livekitMock.rooms[0];

    await user.click(settingsButton());
    const dialog = await screen.findByRole("dialog", { name: "User settings" });
    expect(navigation.path).toBe(ROUTE); // no route change, so the shell (and CallProvider) stays mounted
    expect(within(dialog).getByRole("tab", { name: "My Profile" })).toHaveAttribute("aria-selected", "true");
    expect(within(dialog).getByTestId("profile-builder")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("tab", { name: "Account & Sessions" }));
    expect(within(dialog).getByRole("tabpanel")).toHaveTextContent(ACCOUNT.email);
    expect(within(dialog).getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByTestId("call-status")).toHaveTextContent("connected");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(room.disconnect).not.toHaveBeenCalled();
    expect(livekitMock.rooms).toHaveLength(1); // never reconnected either
    expect(screen.getByTestId("call-status")).toHaveTextContent("connected");
    expect(navigation.history).toEqual([]);
  });

  it("moves between tabs with the arrow keys", async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(settingsButton());
    const dialog = await screen.findByRole("dialog", { name: "User settings" });
    const profileTab = within(dialog).getByRole("tab", { name: "My Profile" });
    await waitFor(() => expect(profileTab).toHaveFocus());
    await user.keyboard("{ArrowRight}");
    const accountTab = within(dialog).getByRole("tab", { name: "Account & Sessions" });
    expect(accountTab).toHaveAttribute("aria-selected", "true");
    expect(accountTab).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(profileTab).toHaveAttribute("aria-selected", "true");
  });

  it("has a prominent Sign Out button that clears this device's unsent messages", async () => {
    const user = userEvent.setup();
    localStorage.setItem("diskarte:outbox", JSON.stringify([{ id: "x" }]));
    renderShell();
    await user.click(settingsButton());
    const dialog = await screen.findByRole("dialog", { name: "User settings" });
    const signOut = within(dialog).getAllByRole("button", { name: "Sign out" })[0];
    expect(signOut.closest("form")?.querySelector("input[name=scope]")).toHaveAttribute("value", "local");
    fireEvent.submit(signOut.closest("form")!);
    expect(localStorage.getItem("diskarte:outbox")).toBeNull();
  });

  it("deletes the account only after the username is typed, and Escape closes just the confirmation", async () => {
    const user = userEvent.setup();
    deleteAccountAction.mockClear();
    renderShell();
    await user.click(settingsButton());
    const settings = await screen.findByRole("dialog", { name: "User settings" });
    await user.click(within(settings).getByRole("tab", { name: "Account & Sessions" }));
    const danger = within(settings).getByTestId("danger-zone");
    expect(within(danger).getByRole("heading", { name: /danger zone/i })).toBeInTheDocument();
    await user.click(within(danger).getByRole("button", { name: "Delete account" }));

    const confirm = await screen.findByRole("dialog", { name: "Delete your account?" });
    const submit = within(confirm).getByRole("button", { name: "Delete my account" });
    expect(submit).toBeDisabled();
    await user.type(within(confirm).getByLabelText(/Type your username/), "kapitan-not");
    expect(submit).toBeDisabled();
    await user.clear(within(confirm).getByLabelText(/Type your username/));
    await user.type(within(confirm).getByLabelText(/Type your username/), "@KAPITAN");
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(deleteAccountAction).toHaveBeenCalledWith({ confirm: "@KAPITAN" }));
    expect(await within(confirm).findByRole("alert")).toHaveTextContent("Couldn't delete your account");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete your account?" })).toBeNull());
    expect(screen.getByRole("dialog", { name: "User settings" })).toBeInTheDocument();
  });

  it("still opens the full settings page for modifier clicks (new tab) and outside the shell", async () => {
    renderShell();
    act(() => {
      fireEvent.click(settingsButton(), { metaKey: true });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(navigation.path).toBe("/settings/profile");
  });
});
