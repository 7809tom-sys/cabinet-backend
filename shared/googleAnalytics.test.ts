import { describe, expect, it } from "vitest";
import {
  normalizeGa4MeasurementId,
  shouldTrackGoogleAnalytics,
} from "./googleAnalytics";

describe("Google Analytics configuration", () => {
  it("accepts a normalized GA4 Measurement ID and rejects empty, legacy, or injected values", () => {
    expect(normalizeGa4MeasurementId(" g-PSW1MY7HB4 ")).toBe("G-PSW1MY7HB4");
    expect(normalizeGa4MeasurementId("")).toBeNull();
    expect(normalizeGa4MeasurementId("UA-12345-1")).toBeNull();
    expect(normalizeGa4MeasurementId("G-PSW1MY7HB4<script>")).toBeNull();
  });

  it("tracks every real Cabinet Dealz or affiliate host while excluding local and temporary preview hosts", () => {
    expect(shouldTrackGoogleAnalytics({ measurementId: "G-PSW1MY7HB4", hostname: "www.cabinetdealz.com" })).toBe(true);
    expect(shouldTrackGoogleAnalytics({ measurementId: "G-PSW1MY7HB4", hostname: "sales-demo.cabinetdealz.com" })).toBe(true);
    expect(shouldTrackGoogleAnalytics({ measurementId: "G-PSW1MY7HB4", hostname: "reaves-way-cabinet-shop.cabinetdealz.com" })).toBe(true);
    expect(shouldTrackGoogleAnalytics({ measurementId: "G-PSW1MY7HB4", hostname: "my-affiliate.example" })).toBe(true);
    expect(shouldTrackGoogleAnalytics({ measurementId: "G-PSW1MY7HB4", hostname: "cabinetz-dq7pucbp.manus.space" })).toBe(true);
    expect(shouldTrackGoogleAnalytics({ measurementId: "G-PSW1MY7HB4", hostname: "localhost" })).toBe(false);
    expect(shouldTrackGoogleAnalytics({ measurementId: "G-PSW1MY7HB4", hostname: "127.0.0.1" })).toBe(false);
    expect(shouldTrackGoogleAnalytics({ measurementId: "G-PSW1MY7HB4", hostname: "3000-iiiccrm83w0u12z611siq-33db4eec.us1.manus.computer" })).toBe(false);
    expect(shouldTrackGoogleAnalytics({ measurementId: null, hostname: "www.cabinetdealz.com" })).toBe(false);
  });
});
