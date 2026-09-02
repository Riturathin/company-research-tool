import { describe, expect, it } from "vitest";
import { emptyReportData, normalizeErrorDetail } from "./api";

describe("api helpers", () => {
  it("normalizes structured backend errors", () => {
    const error = normalizeErrorDetail({ title: "Research failed", points: ["Try again.", "Check settings."] }, "Fallback");
    expect(error.title).toBe("Research failed");
    expect(error.points.join(" ")).toBe("Try again. Check settings.");
  });

  it("creates a report shell with missing data represented safely", () => {
    const data = emptyReportData();
    expect(data.overview).toBeNull();
    expect(data.key_people).toEqual([]);
    expect(data.financials.market_cap).toBeNull();
  });
});
