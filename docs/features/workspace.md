# Shared workspace

Each text channel can hold shared documents that members edit together: **notes**, **task boards**
and **focus timers**, plus one **resource list** and one **whiteboard** per channel.

**Where.** `/tambayan/[serverId]/workspace` — a document library with a type filter; editors open
full screen on phones. **Code:** [`SharedWorkspaceView`](../../diskarte/src/components/workspace/SharedWorkspaceView.tsx),
[`WorkspaceAsset`](../../diskarte/src/components/workspace/WorkspaceAsset.tsx),
[`actions/workspace.ts`](../../diskarte/src/actions/workspace.ts),
[`lib/workspace-documents.ts`](../../diskarte/src/lib/workspace-documents.ts),
[`lib/workspace-assets.ts`](../../diskarte/src/lib/workspace-assets.ts).
**Tables:** `workspace_documents` (notes, boards, focus), `workspace_assets` (resources, whiteboard),
both in the Realtime publication.

## Document types and limits

| Type | Content | Limits (validated by Zod and again in SQL) |
| --- | --- | --- |
| Note | Markdown text | Title 1–100 chars; text ≤ 20,000 chars; whole payload ≤ 64 KB |
| Task board | Cards with a title and a status: To do / Doing / Done | ≤ 200 cards, unique ids, titles 1–160 chars |
| Focus timer | Goal and duration; a shared countdown | Goal ≤ 200 chars; 1–120 whole minutes; `endsAt` set from the **database clock** so every member sees the same end time |
| Resources | Links with title and description | ≤ 30 items, `https://` URLs only |
| Whiteboard | Freehand strokes on a 1200-unit canvas | ≤ 100 strokes, ≤ 2,500 points total, 5 colours, widths 1–12 |

## Permissions

Reading follows the channel: if you can see the channel (`can_view_channel`, including private-channel
grants) you can see its workspace. Editing (`can_edit_workspace`) additionally requires:

- a completed two-factor session and no platform ban;
- not being timed out in that Tambayan;
- for read-only channels, being an admin; for verification-only channels, being verified or a
  moderator.

Creating and deleting documents is recorded in the audit log (`workspace.create`, `workspace.delete`).

## Concurrent editing

Documents are not co-edited keystroke by keystroke. Each save sends the `revision` it was based on;
`save_workspace_document` / `save_workspace_asset` only succeed if that is still the latest revision
and then increment it. On a conflict:

1. The editor keeps your local changes (nothing is overwritten).
2. It shows the latest saved version.
3. You explicitly choose to keep yours against the new revision (then save again) or take theirs.

Other members' saves arrive live over Realtime. Leaving an editor with unsaved changes asks for
confirmation. Losing access while editing shows a permission state instead of failing silently.

## Errors and recovery

[`workspaceLoadIssue()`](../../diskarte/src/lib/workspace-documents.ts) distinguishes four states so
the UI can say what's wrong: **setup** (migration missing — run `npm run db:check`), **session**
(signed out/MFA), **permission** and **connection**.

## Tests

`tests/db/workspace.test.ts`, `tests/db/workspace-assets.test.ts`, `tests/ui/shared-workspace.test.tsx`,
`tests/ui/workspace-assets.test.tsx`, `src/lib/__tests__/workspace-load.test.ts`,
`e2e/sync-workspace.spec.ts`.

## Known limitations

- No real-time co-editing (CRDT/OT), cursors or comments; conflicts are resolved explicitly.
- One resource list and one whiteboard per channel; no images on the whiteboard.
- No document history beyond the current revision, and no export.
