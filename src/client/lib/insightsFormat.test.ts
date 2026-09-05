import { describe, expect, it } from "vitest";
import {
  changeTone,
  formatChange,
  formatCount,
  formatLatency,
  formatRate,
  windowLabel
} from "./insightsFormat.js";

describe("insights format helpers", () => {
  it("formats compact counts and latency", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(13400)).toBe("13.4k");
    expect(formatCount(13_400_000)).toBe("13.4M");
    expect(formatCount(null)).toBe("—");
    expect(formatLatency(102.4)).toBe("102 ms");
    expect(formatLatency(null)).toBe("—");
    expect(formatRate(28.061)).toBe("28.06%");
  });

  it("formats change pills and polarity", () => {
    expect(formatChange(4.48)).toBe("+4.48%");
    expect(formatChange(-4.48)).toBe("−4.48%");
    expect(formatChange(null)).toBeNull();
    expect(changeTone("requests", 10)).toBe("good");
    expect(changeTone("latency", 10)).toBe("bad");
    expect(changeTone("latency", -4)).toBe("good");
    expect(changeTone("errors", 20)).toBe("bad");
    expect(changeTone("errors", 0)).toBe("neutral");
    expect(changeTone("errors", null)).toBe("none");
  });

  it("labels windows", () => {
    expect(windowLabel("15m")).toBe("Last 15m");
    expect(windowLabel("all")).toBe("All retained");
  });
});
