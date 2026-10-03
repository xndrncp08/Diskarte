import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { livekitMock, mockCameraPlaceholder, mockParticipant } from "../mocks/livekit";
import { navigation } from "../mocks/navigation";

vi.mock("@/actions/profile", async () => (await import("../mocks/actions")).profileActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { AppShell } = await import("@/components/shell/AppShell");
const { SessionProviders } = await import("@/components/shell/SessionProviders");
const { RuntimeConfigProvider } = await import("@/components/providers/RuntimeConfig");
const { useCall } = await import("@/components/voice/CallProvider");
const { ACCOUNT, MEMBERS, RUNTIME, TAMBAYAN, channelUrl } = await import("../fixtures/layout");
const { MOD_ID, SERVER_ID, server } = await import("../fixtures/server");

function JoinButton() {
  const call = useCall();
  return (
    <button type="button" onClick={() => void call.join({ serverId: SERVER_ID, serverName: server.name, channelId: TAMBAYAN.id, channelName: TAMBAYAN.name })}>
      Join voice
    </button>
  );
}

function CallStatus() {
  return <output data-testid="call-status">{useCall().status}</output>;
}

/** Mirrors the route tree: (app)/layout → SessionProviders; /tambayan/* → AppShell; /settings/* → a page outside it. */
function Routes() {
  const path = usePathname();
  return path.startsWith("/settings") ? (
    <main>Settings page</main>
  ) : (
    <AppShell servers={[server]}>
      <JoinButton />
    </AppShell>
  );
}

beforeEach(() => {
  navigation.reset(channelUrl(TAMBAYAN.id));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ token: "jwt", url: RUNTIME.livekitUrl, room: `voice:${TAMBAYAN.id}` }), { status: 200 })),
  );
});

describe("session providers at the signed-in root layout", () => {
  it("keeps a call connected through a full-page trip to /settings and back", async () => {
    const user = userEvent.setup();
    render(
      <RuntimeConfigProvider value={RUNTIME}>
        <SessionProviders profile={MEMBERS[0].profile} account={ACCOUNT}>
          <CallStatus />
          <Routes />
        </SessionProviders>
      </RuntimeConfigProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Join voice" }));
    await waitFor(() => expect(screen.getByTestId("call-status")).toHaveTextContent("connected"), { timeout: 5000 }); // first SDK import can be slow under load
    const room = livekitMock.rooms[0];

    act(() => navigation.push("/settings/profile"));
    expect(screen.getByText("Settings page")).toBeInTheDocument();
    expect(screen.queryByTestId("shell")).toBeNull(); // the app frame unmounted…
    expect(screen.getByTestId("call-status")).toHaveTextContent("connected"); // …the call did not
    // And the picture-in-picture call widget follows you there (it shows a video track).
    livekitMock.tracks = [mockCameraPlaceholder(mockParticipant(MOD_ID))];
    act(() => navigation.push("/settings/account"));
    expect(await screen.findByTestId("call-hud")).toBeInTheDocument();

    act(() => navigation.push(channelUrl(TAMBAYAN.id)));
    expect(screen.getByTestId("shell")).toBeInTheDocument();
    expect(room.disconnect).not.toHaveBeenCalled();
    expect(livekitMock.rooms).toHaveLength(1);
    expect(screen.getByTestId("call-status")).toHaveTextContent("connected");
  });
});
