import { describe, expect, it } from "vitest";
import { compareVersions } from "./whatsNewHelpers.js";

describe("whatsNewHelpers", () => {

  describe("compareVersions", () => {
    it("compares versions correctly", () => {
      expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
      expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
      expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
      expect(compareVersions("1.1.0", "1.0.9")).toBe(1);
      expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
      expect(compareVersions("0.1.0", "0.2.0")).toBe(-1);
    });

    it("handles missing version parts", () => {
      expect(compareVersions("1.0", "1.0.0")).toBe(0);
      expect(compareVersions("1", "1.0.0")).toBe(0);
      expect(compareVersions("1.1", "1.0.9")).toBe(1);
    });

    it("handles invalid version parts", () => {
      expect(compareVersions("1.x.0", "1.0.0")).toBe(0);
      expect(compareVersions("a.b.c", "0.0.0")).toBe(0);
    });
  });

});
