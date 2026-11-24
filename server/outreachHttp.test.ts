import { describe, expect, it } from "vitest";
import { unsubscribePage } from "./outreachHttp";

describe("unsubscribe page", () => {
  it("confirms the unsubscribe without naming any supplier", () => {
    const html = unsubscribePage("CabinetDealz", true);
    expect(html).toContain("You're unsubscribed. CabinetDealz won't send you any more of these emails.");
    expect(html).toContain('name="robots" content="noindex"');
  });
  it("escapes the business name", () => {
    expect(unsubscribePage("<b>x</b>", false)).not.toContain("<b>x</b>");
  });
});
