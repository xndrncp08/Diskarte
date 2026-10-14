import { beforeEach, describe, expect, it } from "vitest";
import { clearDiagnostics, diagnosticSnapshot, recordDiagnostic } from "@/lib/diagnostics";
import { requestErrorRecord } from "@/lib/server-observability";
beforeEach(clearDiagnostics);
describe("privacy-conscious diagnostics", () => {
  it("excludes error messages, stack traces, query strings and headers", () => {
    const error = Object.assign(new Error("Bearer secret and private message"), { digest: "123456" });
    const record = requestErrorRecord(error, "POST", "/tambayan/[serverId]?token=secret", "action");
    expect(record).toMatchObject({ route: "/tambayan/[serverId]", digest: "123456", errorKind: "Error" });
    expect(JSON.stringify(record)).not.toMatch(/Bearer|private message|secret|stack|headers/);
  });
  it("bounds session memory and stores only connection event metadata", () => {
    for (let i = 0; i < 200; i++) recordDiagnostic("realtime", "connected", i);
    expect(diagnosticSnapshot()).toHaveLength(100);
    expect(Object.keys(diagnosticSnapshot()[0])).toEqual(["at", "scope", "event", "latencyMs"]);
    clearDiagnostics(); expect(diagnosticSnapshot()).toEqual([]);
  });
});
