import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { OWNER_ID, SERVER_ID, ServerFixture, channels, makeMember } from "../fixtures/server";

const note = { id: "70000000-0000-4000-8000-000000000050", server_id: SERVER_ID, channel_id: channels[0].id, title: "Study notes", kind: "note", content: { text: "Original" }, revision: 1, created_by: OWNER_ID, updated_by: OWNER_ID, created_at: "2026-10-14T00:00:00Z", updated_at: "2026-10-14T00:00:00Z" };
const fake = createFakeSupabase({ workspace_documents: [note] });
const members = [makeMember(OWNER_ID, "Kapitan", "admin")];
const save = vi.fn(async () => ({ ok: false, error: "Someone updated this item. Your changes are preserved; review the latest version before saving.", code: "CONFLICT" }));
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));
vi.mock("@/actions/workspace", () => ({ saveWorkspaceAction: (...args: unknown[]) => { void args; return save(); }, deleteWorkspaceAction: vi.fn() }));
const { SharedWorkspaceView } = await import("@/components/workspace/SharedWorkspaceView");

beforeEach(() => { vi.mocked(fake.client.rpc).mockResolvedValue({ data: true, error: null } as never); save.mockClear(); });
describe("shared workspace editing", () => {
  it("identifies unapplied migrations instead of reporting a misleading permission error", async () => {
    vi.mocked(fake.client.rpc).mockResolvedValue({ data: null, error: { code: "PGRST202" } } as never);
    render(<ServerFixture members={members}><SharedWorkspaceView /></ServerFixture>);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("database migration hasn’t been applied"));
    expect(screen.getByText("Server setup instructions")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Shared note" })).toBeNull();
    vi.mocked(fake.client.rpc).mockResolvedValue({ data: true, error: null } as never);
    await userEvent.setup().click(screen.getByRole("button", { name: "Check setup again" }));
    expect(await screen.findByRole("button", { name: /Study notes/ })).toBeInTheDocument();
    expect(screen.queryByText(/database migration hasn’t been applied/)).toBeNull();
  });
  it("preserves local notes after a concurrent-save conflict", async () => {
    const user = userEvent.setup();
    render(<ServerFixture members={members}><SharedWorkspaceView /></ServerFixture>);
    await user.click(await screen.findByRole("button", { name: /Study notes/ }));
    const text = screen.getByLabelText("Note (Markdown supported)");
    await user.clear(text); await user.type(text, "My local edits");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Someone updated");
    expect(text).toHaveValue("My local edits");
    expect(save).toHaveBeenCalledOnce();
  });
  it("presents a read-only view when channel editing is denied", async () => {
    vi.mocked(fake.client.rpc).mockResolvedValue({ data: false, error: null } as never);
    const user = userEvent.setup();
    render(<ServerFixture members={members}><SharedWorkspaceView /></ServerFixture>);
    await waitFor(() => expect(screen.getByRole("button", { name: /Study notes/ })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Shared note" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Study notes/ }));
    expect(screen.queryByRole("button", { name: "Save note" })).toBeNull();
    expect(screen.getByText("Original")).toBeInTheDocument();
  });
});
