import { describe, it, expect } from "vitest";
import {
  buildTawkEmbedUrl,
  isTawkConfigured,
  normalizeWidgetId,
} from "../shared/tawk";

/**
 * Validates the Tawk.to live-chat configuration.
 *
 * The widget is loaded purely client-side via an embed <script>, so there is no
 * server API to call with the credentials. Instead we (1) verify the pure URL
 * builder produces the expected embed URL, and (2) fetch the live embed script
 * to confirm the Property ID actually resolves to a real Tawk widget.
 */

const PROPERTY_ID = "6a3ea71335bb181d4aa8b755";
const WIDGET_ID = "default";

describe("Tawk.to config helpers", () => {
  it("treats a present property id as configured", () => {
    expect(isTawkConfigured(PROPERTY_ID)).toBe(true);
    expect(isTawkConfigured("")).toBe(false);
    expect(isTawkConfigured(undefined)).toBe(false);
  });

  it("defaults an empty widget id to 'default'", () => {
    expect(normalizeWidgetId(undefined)).toBe("default");
    expect(normalizeWidgetId("")).toBe("default");
    expect(normalizeWidgetId(" abc ")).toBe("abc");
  });

  it("builds the expected embed url", () => {
    expect(buildTawkEmbedUrl(PROPERTY_ID, WIDGET_ID)).toBe(
      `https://embed.tawk.to/${PROPERTY_ID}/${WIDGET_ID}`,
    );
    expect(buildTawkEmbedUrl("", WIDGET_ID)).toBeNull();
  });
});

describe("Tawk.to live embed reachability", () => {
  it("resolves to a real Tawk widget for the configured Property ID", async () => {
    const url = buildTawkEmbedUrl(PROPERTY_ID, WIDGET_ID)!;
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const body = await res.text();
    // The live script echoes the account key + widget id back to the client.
    expect(body).toContain(`$_Tawk_AccountKey='${PROPERTY_ID}'`);
    expect(body).toContain(`$_Tawk_WidgetId='${WIDGET_ID}'`);
  }, 20000);
});
