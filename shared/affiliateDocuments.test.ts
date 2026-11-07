import { describe, expect, it } from "vitest";
import {
  AFFILIATE_DOCUMENT_TYPES,
  MAX_AFFILIATE_DOCUMENT_BYTES,
  affiliateDocumentExtension,
  affiliateDocumentGateStatus,
  hasRequiredAffiliateDocuments,
  incompleteRequiredAffiliateDocuments,
  isAffiliateDocumentMimeType,
  isAffiliateDocumentType,
  isRequiredAffiliateDocumentType,
  requiredAffiliateDocumentState,
} from "./affiliateDocuments";

const approved = (docType: string) => ({ docType, status: "approved", supersededAt: null });

const allRequiredApproved = [
  approved("driver_license"),
  approved("ssn_card"),
  approved("business_card"),
];

describe("affiliate document types", () => {
  it("accepts only the four onboarding document types", () => {
    expect(AFFILIATE_DOCUMENT_TYPES).toEqual([
      "driver_license",
      "ssn_card",
      "business_card",
      "reseller_certificate",
    ]);
    for (const docType of AFFILIATE_DOCUMENT_TYPES) expect(isAffiliateDocumentType(docType)).toBe(true);
    expect(isAffiliateDocumentType("passport")).toBe(false);
    expect(isAffiliateDocumentType(null)).toBe(false);
  });

  it("marks the license, SSN card, and business card as required and the reseller certificate as not", () => {
    expect(isRequiredAffiliateDocumentType("driver_license")).toBe(true);
    expect(isRequiredAffiliateDocumentType("ssn_card")).toBe(true);
    expect(isRequiredAffiliateDocumentType("business_card")).toBe(true);
    expect(isRequiredAffiliateDocumentType("reseller_certificate")).toBe(false);
  });
});

describe("upload validation", () => {
  it("accepts jpg, png, heic, heif, and pdf only", () => {
    expect(isAffiliateDocumentMimeType("image/jpeg")).toBe(true);
    expect(isAffiliateDocumentMimeType("image/png")).toBe(true);
    expect(isAffiliateDocumentMimeType("image/heic")).toBe(true);
    expect(isAffiliateDocumentMimeType("image/heif")).toBe(true);
    expect(isAffiliateDocumentMimeType("application/pdf")).toBe(true);
    expect(isAffiliateDocumentMimeType("image/svg+xml")).toBe(false);
    expect(isAffiliateDocumentMimeType("application/zip")).toBe(false);
    expect(isAffiliateDocumentMimeType("image/webp")).toBe(false);
  });

  it("gives the storage key an extension of its own, never the client filename", () => {
    expect(affiliateDocumentExtension("image/jpeg")).toBe("jpg");
    expect(affiliateDocumentExtension("image/png")).toBe("png");
    expect(affiliateDocumentExtension("image/heic")).toBe("heic");
    expect(affiliateDocumentExtension("application/pdf")).toBe("pdf");
    expect(affiliateDocumentExtension("text/html")).toBeNull();
  });

  it("caps uploads at 10 MB", () => {
    expect(MAX_AFFILIATE_DOCUMENT_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("onboarding gate", () => {
  it("blocks onboarding until every required document is approved", () => {
    expect(hasRequiredAffiliateDocuments([])).toBe(false);
    expect(hasRequiredAffiliateDocuments(allRequiredApproved)).toBe(true);
    expect(hasRequiredAffiliateDocuments(allRequiredApproved.filter((row) => row.docType !== "ssn_card"))).toBe(false);
    expect(hasRequiredAffiliateDocuments([
      ...allRequiredApproved.filter((row) => row.docType !== "business_card"),
      { docType: "business_card", status: "pending", supersededAt: null },
    ])).toBe(false);
    expect(hasRequiredAffiliateDocuments([
      ...allRequiredApproved.filter((row) => row.docType !== "driver_license"),
      { docType: "driver_license", status: "rejected", supersededAt: null },
    ])).toBe(false);
  });

  it("does not need the optional reseller certificate", () => {
    expect(hasRequiredAffiliateDocuments(allRequiredApproved)).toBe(true);
  });

  it("ignores a replaced upload even though it was approved", () => {
    const replaced = [
      { docType: "driver_license", status: "approved", supersededAt: new Date("2026-01-01") },
      { docType: "driver_license", status: "pending", supersededAt: null },
      approved("ssn_card"),
      approved("business_card"),
    ];
    expect(hasRequiredAffiliateDocuments(replaced)).toBe(false);
    expect(affiliateDocumentGateStatus(replaced, "driver_license")).toBe("pending");
  });

  it("reports each required document with a status the dashboard can render", () => {
    const rows = [
      { docType: "driver_license", status: "approved", supersededAt: null },
      { docType: "ssn_card", status: "pending", supersededAt: null },
    ];
    expect(requiredAffiliateDocumentState(rows)).toEqual([
      { docType: "driver_license", label: "Driver's license", status: "approved" },
      { docType: "ssn_card", label: "Social Security card", status: "pending" },
      { docType: "business_card", label: "Business card", status: "missing" },
    ]);
    expect(incompleteRequiredAffiliateDocuments(rows).map((row) => row.docType))
      .toEqual(["ssn_card", "business_card"]);
  });

  it("treats an unrecognized stored status as not approved rather than a pass", () => {
    const rows = [
      ...allRequiredApproved.filter((row) => row.docType !== "business_card"),
      { docType: "business_card", status: "whatever", supersededAt: null },
    ];
    expect(affiliateDocumentGateStatus(rows, "business_card")).toBe("rejected");
    expect(hasRequiredAffiliateDocuments(rows)).toBe(false);
  });
});
