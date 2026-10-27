import { describe, expect, it, vi } from "vitest";
import { readStripeChargeFacts } from "./stripeChargeFacts";

describe("readStripeChargeFacts", () => {
  it("uses amount_received and the balance transaction fee and net", async () => {
    const retrieveBalanceTransaction = vi.fn();
    const facts = await readStripeChargeFacts({
      retrievePaymentIntent: async () => ({
        id: "pi_520",
        amount: 52000,
        amount_received: 52000,
        currency: "usd",
        latest_charge: {
          id: "ch_520",
          balance_transaction: { id: "txn_520", fee: 1508, net: 50492 },
        },
      }),
      retrieveCharge: async () => { throw new Error("charge retrieve should not be needed"); },
      retrieveBalanceTransaction,
    }, { paymentIntentId: "pi_520" });
    expect(facts).toMatchObject({
      amountReceivedCents: 52000,
      feeCents: 1508,
      netCents: 50492,
      chargeId: "ch_520",
      paymentIntentId: "pi_520",
      currency: "usd",
    });
    expect(retrieveBalanceTransaction).not.toHaveBeenCalled();
  });

  it("loads a balance transaction that was returned as an id", async () => {
    const facts = await readStripeChargeFacts({
      retrievePaymentIntent: async () => ({
        id: "pi_520",
        amount_received: 52000,
        currency: "usd",
        latest_charge: "ch_520",
      }),
      retrieveCharge: async () => ({ id: "ch_520", balance_transaction: "txn_520", currency: "usd" }),
      retrieveBalanceTransaction: async () => ({ id: "txn_520", fee: 1500, net: 50500 }),
    }, { paymentIntentId: "pi_520" });
    expect(facts?.feeCents).toBe(1500);
    expect(facts?.netCents).toBe(50500);
    expect(facts?.amountReceivedCents).toBe(52000);
  });
});
