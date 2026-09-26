import { vi } from "vitest";
// This module backs vi.mock factories, so it must not import app code (components import the very
// modules being mocked, which would deadlock the async mock factories).
const AUTHOR = {
  id: "00000000-0000-4000-8000-00000000000a",
  username: "kapitan",
  display_name: "Kapitan",
  avatar_url: null,
  avatar_preset: "araw",
};

/** Server-action doubles shared by the UI/component suites (wire with vi.mock in each test file). */
export const messageActions = {
  sendMessageAction: vi.fn(async (input: { id: string; channelId: string; content: string; replyToId?: string | null }) => ({
    ok: true,
    data: {
      message: {
        id: input.id,
        channel_id: input.channelId,
        server_id: "10000000-0000-4000-8000-000000000001",
        author_id: AUTHOR.id,
        content: input.content,
        attachments: [],
        reply_to_id: input.replyToId ?? null,
        pinned: false,
        pinned_at: null,
        pinned_by: null,
        edited_at: null,
        created_at: new Date().toISOString(),
        author: AUTHOR,
      },
    },
  })),
  editMessageAction: vi.fn(async () => ({ ok: true })),
  deleteMessageAction: vi.fn(async () => ({ ok: true })),
  setPinnedAction: vi.fn(async () => ({ ok: true })),
  toggleReactionAction: vi.fn(async () => ({ ok: true })),
};

export const serverActions = {
  leaveServerAction: vi.fn(async () => ({ ok: true })),
  regenerateInviteAction: vi.fn(async () => ({ ok: true, data: { code: "NEWCODE234" } })),
  createChannelAction: vi.fn(async () => ({ ok: true })),
  updateChannelAction: vi.fn(async () => ({ ok: true })),
  deleteChannelAction: vi.fn(async () => ({ ok: true })),
  updateServerAction: vi.fn(async () => ({ ok: true })),
  deleteServerAction: vi.fn(async () => ({ ok: true })),
  setMemberRoleAction: vi.fn(async () => ({ ok: true })),
  kickMemberAction: vi.fn(async () => ({ ok: true })),
  createServerAction: vi.fn(async () => ({ ok: true, data: { serverId: "10000000-0000-4000-8000-000000000001" } })),
  joinServerAction: vi.fn(async () => ({ ok: true, data: { serverId: "10000000-0000-4000-8000-000000000001" } })),
};

export const profileActions = {
  setStatusAction: vi.fn(async () => ({ ok: true })),
  updateProfileAction: vi.fn(async () => ({ ok: true })),
};

export const toastMock = { toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }), Toaster: () => null };
