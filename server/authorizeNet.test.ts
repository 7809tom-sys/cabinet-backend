import { describe, it, expect } from "vitest";
import { normalizeResponse, endpointFor } from "./authorizeNet";

describe("authorizeNet.endpointFor", () => {
  it("uses the sandbox endpoint for sandbox", () => {
    expect(endpointFor("sandbox")).toContain("apitest.authorize.net");
  });
  it("uses the production endpoint for production", () => {
    expect(endpointFor("production")).toBe("https://api.authorize.net/xml/v1/request.api");
  });
});

describe("authorizeNet.normalizeResponse", () => {
  it("maps responseCode 1 to approved with transaction details", () => {
    const r = normalizeResponse({
      transactionResponse: {
        responseCode: "1",
        authCode: "ABC123",
        avsResultCode: "Y",
        transId: "60123456789",
        accountNumber: "XXXX1111",
        accountType: "Visa",
        messages: [{ code: "1", description: "This transaction has been approved." }],
      },
      messages: { resultCode: "Ok", message: [{ code: "I00001", text: "Successful." }] },
    });
    expect(r.status).toBe("approved");
    expect(r.transactionId).toBe("60123456789");
    expect(r.authCode).toBe("ABC123");
    expect(r.cardLast4).toBe("1111");
    expect(r.cardType).toBe("Visa");
  });

  it("maps responseCode 2 to declined and surfaces the message", () => {
    const r = normalizeResponse({
      transactionResponse: {
        responseCode: "2",
        transId: "0",
        errors: [{ errorCode: "2", errorText: "This transaction has been declined." }],
      },
      messages: { resultCode: "Ok" },
    });
    expect(r.status).toBe("declined");
    expect(r.message).toContain("declined");
  });

  it("maps responseCode 4 (held for review) to declined", () => {
    const r = normalizeResponse({
      transactionResponse: { responseCode: "4", transId: "99" },
    });
    expect(r.status).toBe("declined");
  });

  it("maps a top-level Error (bad credentials) to error", () => {
    const r = normalizeResponse({
      messages: {
        resultCode: "Error",
        message: [{ code: "E00007", text: "User authentication failed." }],
      },
    });
    expect(r.status).toBe("error");
    expect(r.message).toContain("authentication failed");
  });

  it("never throws on a malformed/empty response and defaults to error", () => {
    const r = normalizeResponse({});
    expect(r.status).toBe("error");
    expect(r.transactionId).toBeNull();
  });
});
