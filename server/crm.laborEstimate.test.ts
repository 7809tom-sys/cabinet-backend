import { describe, expect, it } from "vitest";
import { laborEstimateMatchesDeal } from "./routers/crm";

describe("CRM labor estimate selection", () => {
  const deal = { orderRequestId: 41, contactEmail: "Customer@example.com" };

  it("allows an estimate explicitly tied to the deal order", () => {
    expect(laborEstimateMatchesDeal(
      { orderRequestId: 41, customerEmail: "other@example.com" },
      deal,
    )).toBe(true);
  });

  it("allows an estimate for the same customer email case-insensitively", () => {
    expect(laborEstimateMatchesDeal(
      { orderRequestId: null, customerEmail: "customer@EXAMPLE.com" },
      deal,
    )).toBe(true);
  });

  it("rejects another customer's unrelated labor estimate", () => {
    expect(laborEstimateMatchesDeal(
      { orderRequestId: 97, customerEmail: "other@example.com" },
      deal,
    )).toBe(false);
  });

  it("does not accept a missing identity as a match", () => {
    expect(laborEstimateMatchesDeal(
      { orderRequestId: null, customerEmail: null },
      { orderRequestId: null, contactEmail: null },
    )).toBe(false);
  });

  it("accepts only the explicit automatic estimator deal when there is no customer email", () => {
    expect(laborEstimateMatchesDeal({ orderRequestId: null, customerEmail: null, crmDealId: 12 },
      { id: 12, orderRequestId: null, contactEmail: null })).toBe(true);
    expect(laborEstimateMatchesDeal({ orderRequestId: null, customerEmail: null, crmDealId: 13 },
      { id: 12, orderRequestId: null, contactEmail: null })).toBe(false);
  });
});
