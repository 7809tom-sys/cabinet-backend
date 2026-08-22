import { describe, expect, it } from "vitest";
import { parseCrmCustomerListCsv } from "./crmCustomerListImport";

describe("parseCrmCustomerListCsv", () => {
  it("maps common customer-list headers and removes duplicate identities", () => {
    const result = parseCrmCustomerListCsv([
      "Name,Email,Phone,Company,City,Notes",
      'Jane Doe,jane@example.com,555-123-4567,"Doe, LLC",Tampa,"Kitchen remodel"',
      "Jane Duplicate,JANE@example.com,555-123-4567,Doe LLC,Tampa,Repeat",
    ].join("\n"));
    expect(result.rows).toEqual([{
      contactName: "Jane Doe", contactEmail: "jane@example.com", contactPhone: "555-123-4567",
      company: "Doe, LLC", location: "Tampa", notes: "Kitchen remodel",
    }]);
    expect(result.rejected).toBe(1);
  });
});
