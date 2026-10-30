import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./CrmBoard.tsx", import.meta.url), "utf8");

describe("CRM Email PDF to Customer button", () => {
  it("enables the button from the resolved invoice recipient, not only the lead email", () => {
    expect(source).toContain("Email PDF to Customer");
    expect(source).toContain("const customerEmail = ((invoiceRecipient ? invoiceRecipient.email : deal.contactEmail) ?? \"\").trim();");
    expect(source).toContain("disabled={!customerEmail || !smtpReady || sendInvoiceEmail.isPending}");
    expect(source).toContain("invoiceRecipient={invoiceRecipient}");
  });

  it("calls sendInvoiceEmail without a typed address so the server resolves the recipient", () => {
    const start = source.indexOf("function emailInvoice()");
    const end = source.indexOf("const ServiceRow", start);
    const button = source.slice(start, end);
    expect(button).toContain("sendInvoiceEmail.mutate({");
    expect(button).toContain("dealId,");
    expect(button).toContain("lines: previewLines,");
    expect(button).not.toContain("to:");
  });
});
