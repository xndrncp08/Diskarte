import { z } from "zod";
import type { Tables } from "@/lib/supabase/database.types";

export const noteSchema = z.object({ text: z.string().max(20000) });
export const cardSchema = z.object({ id: z.uuid(), title: z.string().trim().min(1).max(160), status: z.enum(["todo", "doing", "done"]) });
export const boardSchema = z.object({ cards: z.array(cardSchema).max(200) });
export const focusSchema = z.object({ goal: z.string().max(200), minutes: z.number().int().min(1).max(120), endsAt: z.iso.datetime({ offset: true }).nullable().optional() });
export type WorkspaceDocument = Tables<"workspace_documents">;
export type BoardCard = z.infer<typeof cardSchema>;
export function workspaceLoadIssue(error: unknown): { kind: "setup" | "session" | "permission" | "connection"; message: string } {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(code)) return { kind: "setup", message: "Shared workspace isn’t enabled on this server yet. Its database migration hasn’t been applied." };
  if (["PGRST301", "PGRST302", "PGRST303"].includes(code)) return { kind: "session", message: "Your session needs to be refreshed. Sign in again to open the workspace." };
  if (code === "42501") return { kind: "permission", message: "You don’t have access to this channel’s workspace." };
  return { kind: "connection", message: "Workspace couldn’t connect. Check your connection and try again." };
}
export function workspaceContent(kind: string, content: unknown) {
  return (kind === "note" ? noteSchema : kind === "board" ? boardSchema : focusSchema).safeParse(content);
}
