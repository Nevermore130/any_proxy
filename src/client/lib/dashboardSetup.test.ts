import { describe, expect, it } from "vitest";
import { compactRelayUrl } from "./dashboardSetup.js";

describe("dashboard setup helpers", () => {
  it("shows relay URLs in a compact dashboard form", () => {
    expect(compactRelayUrl("http://172.16.4.186:5177/relay/rela")).toBe(
      "172.16.4.186:5177/relay/rela"
    );
    expect(compactRelayUrl("/relay/rela")).toBe("/relay/rela");
  });
});
