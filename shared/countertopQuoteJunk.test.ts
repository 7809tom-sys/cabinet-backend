import { describe, expect, it } from "vitest";
import {
  COUNTERTOP_QUOTE_JUNK_LABELS,
  countertopQuoteJunkLabel,
  JOB_SITE_ADDRESS_REQUIRED_SINCE,
  getCountertopQuoteJunkReason,
  isCompleteJobSiteAddress,
  isJunkCountertopQuote,
  isTestQuoteEmail,
  TEST_QUOTE_EMAIL_DOMAINS,
  VITEST_COUNTERTOP_NOTE,
} from "./countertopQuoteJunk";

const AFTER_CUTOFF = new Date(JOB_SITE_ADDRESS_REQUIRED_SINCE.getTime() + 24 * 60 * 60 * 1000);
const BEFORE_CUTOFF = new Date(JOB_SITE_ADDRESS_REQUIRED_SINCE.getTime() - 24 * 60 * 60 * 1000);

const completeQuote = {
  contactName: "Dana Whitfield",
  contactEmail: "dana.whitfield@gmail.com",
  notes: "Please quote 42 sq ft of quartz, kitchen plus island.",
  jobSiteAddress: "12 Main St, Waukesha, WI 53186",
  createdAt: AFTER_CUTOFF,
};

describe("countertop quote email rules", () => {
  it("flags the reserved fake domains", () => {
    expect(isTestQuoteEmail("buyer@example.com")).toBe(true);
    expect(isTestQuoteEmail("someone@mailinator.com")).toBe(true);
    expect(isTestQuoteEmail("qa@cabinetdealz.test")).toBe(true);
  });

  it("flags the reserved non-deliverable suffixes", () => {
    expect(isTestQuoteEmail("tester@anything.test")).toBe(true);
    expect(isTestQuoteEmail("tester@anything.invalid")).toBe(true);
    expect(isTestQuoteEmail("tester@anything.example")).toBe(true);
    expect(isTestQuoteEmail("tester@anything.localhost")).toBe(true);
  });

  it("is case and whitespace insensitive, like the SQL LOWER(TRIM(...))", () => {
    expect(isTestQuoteEmail("  Buyer@Example.COM  ")).toBe(true);
  });

  it("keeps real customers out", () => {
    expect(isTestQuoteEmail("tom@cabinetdealz.com")).toBe(false);
    expect(isTestQuoteEmail("homeowner@gmail.com")).toBe(false);
    expect(isTestQuoteEmail("builder@contractor.com")).toBe(false);
    expect(isTestQuoteEmail("")).toBe(false);
    expect(isTestQuoteEmail(null)).toBe(false);
  });

  it("does not match a test-looking local part on a real domain", () => {
    expect(isTestQuoteEmail("test@cabinetdealz.com")).toBe(false);
    expect(isTestQuoteEmail("example@gmail.com")).toBe(false);
  });

  it("pins the exact domain list the review script uses", () => {
    expect([...TEST_QUOTE_EMAIL_DOMAINS].sort()).toEqual([
      "10minutemail.com",
      "cabinetdealz.test",
      "discard.email",
      "example.com",
      "example.edu",
      "example.invalid",
      "example.net",
      "example.org",
      "fakeinbox.com",
      "guerrillamail.com",
      "mailinator.com",
      "mailnull.com",
      "sharklasers.com",
      "tempmail.com",
      "test.com",
      "trashmail.com",
      "yopmail.com",
    ]);
  });
});

describe("job site address completeness", () => {
  it("accepts a normal one-line and two-line address", () => {
    expect(isCompleteJobSiteAddress("12 Main St, Waukesha, WI 53186")).toBe(true);
    expect(isCompleteJobSiteAddress("12 Main St, Unit 4, Waukesha, WI 53186")).toBe(true);
    expect(isCompleteJobSiteAddress("12 Main St, Waukesha, WI 53186-1234")).toBe(true);
  });

  it("rejects anything without street, city, state and ZIP", () => {
    expect(isCompleteJobSiteAddress(null)).toBe(false);
    expect(isCompleteJobSiteAddress("")).toBe(false);
    expect(isCompleteJobSiteAddress("Waukesha, WI 53186")).toBe(false);
    expect(isCompleteJobSiteAddress("12 Main St, Waukesha")).toBe(false);
    expect(isCompleteJobSiteAddress("12 Main St, Waukesha, WI")).toBe(false);
    expect(isCompleteJobSiteAddress("12 Main St, Waukesha, WI 531")).toBe(false);
    expect(isCompleteJobSiteAddress("Main St, Waukesha, WI 53186")).toBe(false);
  });
});

describe("countertop quote junk rules", () => {
  it("says nothing about a complete, real-looking quote", () => {
    expect(getCountertopQuoteJunkReason(completeQuote)).toBeNull();
    expect(isJunkCountertopQuote(completeQuote)).toBe(false);
  });

  it("flags the row the countertop vitest leaves behind, even with a real domain", () => {
    expect(getCountertopQuoteJunkReason({ ...completeQuote, notes: VITEST_COUNTERTOP_NOTE })).toBe("test_note");
  });

  it("puts a test email ahead of any address hint", () => {
    expect(getCountertopQuoteJunkReason({ ...completeQuote, contactEmail: "buyer@example.com", jobSiteAddress: null }))
      .toBe("test_email_domain");
  });

  it("flags a quote submitted without a job site address after the field shipped", () => {
    expect(getCountertopQuoteJunkReason({ ...completeQuote, jobSiteAddress: null })).toBe("incomplete_address");
    expect(getCountertopQuoteJunkReason({ ...completeQuote, jobSiteAddress: "  " })).toBe("incomplete_address");
    expect(getCountertopQuoteJunkReason({ ...completeQuote, jobSiteAddress: "12 Main St, Waukesha, WI" }))
      .toBe("incomplete_address");
  });

  it("never flags a quote that predates the address field", () => {
    expect(getCountertopQuoteJunkReason({ ...completeQuote, jobSiteAddress: null, createdAt: BEFORE_CUTOFF })).toBeNull();
  });

  it("never flags a quote created from a placed order, even before the fabricator email is negotiated", () => {
    // The order proves the request is real; the fabricator's email and the job
    // site address are recorded later, when a shop is negotiated with.
    expect(getCountertopQuoteJunkReason({
      contactEmail: null,
      notes: null,
      jobSiteAddress: null,
      createdAt: new Date(),
      orderRequestId: 1234,
    })).toBeNull();
  });

  it("never guesses when the creation time is unknown", () => {
    expect(getCountertopQuoteJunkReason({ ...completeQuote, jobSiteAddress: null, createdAt: null })).toBeNull();
    expect(getCountertopQuoteJunkReason({ ...completeQuote, jobSiteAddress: null, createdAt: undefined })).toBeNull();
    expect(getCountertopQuoteJunkReason({ ...completeQuote, jobSiteAddress: null, createdAt: "not a date" })).toBeNull();
  });

  it("labels every reason so the admin UI can say why a row is deletable", () => {
    for (const reason of ["test_email_domain", "test_note", "incomplete_address"] as const) {
      expect(COUNTERTOP_QUOTE_JUNK_LABELS[reason]).toBeTruthy();
    }
  });

  it("labels an unknown reason without throwing", () => {
    expect(countertopQuoteJunkLabel("incomplete_address")).toBe("no job site address");
    expect(countertopQuoteJunkLabel(undefined)).toBe("junk");
    expect(countertopQuoteJunkLabel("something_new")).toBe("junk");
  });
});
