import { describe, expect, it } from "vitest";
import { workspaceLoadIssue } from "../workspace-documents";
describe("workspace failures", () => {
  it("distinguishes missing schema from channel permissions and expired sessions", () => {
    expect(workspaceLoadIssue({ code: "PGRST205" }).kind).toBe("setup");
    expect(workspaceLoadIssue({ code: "PGRST202" }).kind).toBe("setup");
    expect(workspaceLoadIssue({ code: "42501" }).kind).toBe("permission");
    expect(workspaceLoadIssue({ code: "PGRST301" }).kind).toBe("session");
    expect(workspaceLoadIssue(new TypeError("Failed to fetch"))).toMatchObject({ kind: "connection" });
  });
});
