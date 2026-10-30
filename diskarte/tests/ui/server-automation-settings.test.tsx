import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { OWNER_ID, SERVER_ID, ServerFixture, channels, makeMember } from "../fixtures/server";

const fake = createFakeSupabase({});
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));
vi.mock("@/actions/servers", async () => (await import("../mocks/actions")).serverActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

const { serverActions } = await import("../mocks/actions");
const { ServerSettingsDialog } = await import("@/components/server/ServerSettingsDialog");
const text = channels.find((c) => c.type === "text")!;

describe("server automation settings", () => {
  it("saves rules, a welcome message and community levels from Overview", async () => {
    const user = userEvent.setup();
    render(
      <ServerFixture members={[makeMember(OWNER_ID, "Kapitan", "admin")]}>
        <ServerSettingsDialog open onClose={() => undefined} initialTab="overview" />
      </ServerFixture>,
    );
    await user.selectOptions(screen.getByLabelText("Post in"), text.id);
    const message = screen.getByLabelText("Message");
    await user.clear(message);
    await user.type(message, "Hi {{user}!");
    await user.type(screen.getByLabelText("Rules"), "Be kind.");
    await user.click(screen.getByRole("switch", { name: /Community levels/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(serverActions.updateServerAction).toHaveBeenCalledWith(
        expect.objectContaining({ serverId: SERVER_ID, levelsEnabled: true, rules: "Be kind.", welcome: { channelId: text.id, message: "Hi {user}!" } }),
      ),
    );
  });
});
