import { describe, expect, it } from "vitest";
import { crmCustomerFileReadProgress, parseCrmCustomerListCsv, prepareCrmCustomerImport } from "./crmCustomerListImport";

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
    expect(result.skipped).toEqual([{ rowNumber: 3, contactName: "Jane Duplicate", reason: "Duplicate email or phone in this upload." }]);
  });

  it("reports whether a server-side skip is an existing CRM contact or duplicate import row", () => {
    const result = prepareCrmCustomerImport([
      { contactName: "Existing", contactEmail: "existing@example.com", contactPhone: null, company: null, location: null, notes: null },
      { contactName: "New", contactEmail: "new@example.com", contactPhone: "555-000-0000", company: null, location: null, notes: null },
      { contactName: "Duplicate new", contactEmail: null, contactPhone: "5550000000", company: null, location: null, notes: null },
    ], new Set(["email:existing@example.com"]));
    expect(result.accepted).toHaveLength(1);
    expect(result.skipped.map((row) => row.reason)).toEqual([
      "Duplicate email already exists in this CRM.",
      "Duplicate email or phone in this import.",
    ]);
  });

  it("reserves progress feedback for the parsing phase after the file has been read", () => {
    expect(crmCustomerFileReadProgress(50, 100)).toBe(43);
    expect(crmCustomerFileReadProgress(100, 100)).toBe(85);
    expect(crmCustomerFileReadProgress(0, 0)).toBe(5);
  });
});
