// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const APP = path.resolve(__dirname, "../..");
const eslint = new ESLint({ cwd: APP });
const restricted = async (code: string, filePath: string) =>
  (await eslint.lintText(code, { filePath: path.join(APP, filePath) }))[0].messages.filter((m) => m.ruleId === "no-restricted-syntax").map((m) => m.line);

describe("Pulse lint guard", () => {
  it("flags raw palette colours and [#hex] in components/pulse", async () => {
    const bad = [
      'export const a = <div className="bg-slate-900 p-2" />;',
      'export const b = <div className="hover:text-white/80" />;',
      "export const c = <div className={`border-black ${x}`} />;",
      'export const d = cn("text-gray-400");',
      'export const e = <div className="bg-[#121016]" />;',
      'export const f = <div className="ring-white" />;',
    ].join("\n");
    expect(await restricted(`const x = 1; declare const cn: (...a: string[]) => string;\n${bad}`, "src/components/pulse/Bad.tsx")).toEqual([2, 3, 4, 5, 6, 7]);
  }, 30_000);

  it("accepts Pulse tokens, look-alike words, and raw colours outside components/pulse", async () => {
    const ok = 'export const a = <div className="bg-pulse-surface text-pulse-muted whitespace-nowrap border-pulse-line" title="black and white" />;';
    expect(await restricted(ok, "src/components/pulse/Good.tsx")).toEqual([]);
    expect(await restricted('export const a = <div className="bg-slate-900" />;', "src/components/shell/Classic.tsx")).toEqual([]);
    const exemplar = "src/components/pulse/PulseSurface.tsx";
    expect(await restricted(fs.readFileSync(path.join(APP, exemplar), "utf8"), exemplar)).toEqual([]);
  }, 30_000);
});
