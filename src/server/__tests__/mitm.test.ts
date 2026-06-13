import { describe, expect, it } from "vitest";
import { resolveMitmdumpBinary } from "../mitm.js";

describe("resolveMitmdumpBinary", () => {
  it("uses RELA_CAPTURE_MITMDUMP_BIN first", () => {
    const result = resolveMitmdumpBinary({
      env: { RELA_CAPTURE_MITMDUMP_BIN: "/custom/mitmdump" },
      pathLookup: () => undefined
    });
    expect(result).toEqual({ ok: true, path: "/custom/mitmdump" });
  });

  it("uses PATH lookup when env is empty", () => {
    const result = resolveMitmdumpBinary({
      env: {},
      pathLookup: (name) => (name === "mitmdump" ? "/usr/local/bin/mitmdump" : undefined)
    });
    expect(result).toEqual({ ok: true, path: "/usr/local/bin/mitmdump" });
  });

  it("returns install guidance when missing", () => {
    const result = resolveMitmdumpBinary({ env: {}, pathLookup: () => undefined });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("mitmdump was not found");
    expect(result.message).toContain("brew install mitmproxy");
  });
});
