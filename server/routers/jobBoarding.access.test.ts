import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptW9TaxId, W9_TAX_ID_ENCRYPTION_KEY_ENV } from "../lib/w9TaxIdCrypto";

const hoisted = vi.hoisted(() => ({
  loadProgress: vi.fn(),
  saveW9: vi.fn(),
  loadW9: vi.fn(),
  refreshVerification: vi.fn(),
  loadOnboarding: vi.fn(),
  ensureNonCompetePlaceholder: vi.fn(),
  loadSignatureForVersion: vi.fn(),
  loadPendingSession: vi.fn(),
  listCurrentIdentity: vi.fn(),
  loadIdentity: vi.fn(),
  findOnboardingByTokenHash: vi.fn(),
  storageGetSignedUrl: vi.fn(async (key: string) => `https://signed.example/${key}?exp=300`),
}));

vi.mock("../db", () => ({ getDb: async () => ({}) }));
vi.mock("../storage", () => ({
  storagePut: vi.fn(),
  storageGetSignedUrl: hoisted.storageGetSignedUrl,
}));
vi.mock("../lib/jobBoardingStore", async () => {
  const actual = await vi.importActual<typeof import("../lib/jobBoardingStore")>("../lib/jobBoardingStore");
  return {
    ...actual,
    loadProgress: hoisted.loadProgress,
    saveW9: hoisted.saveW9,
    loadW9: hoisted.loadW9,
    refreshVerification: hoisted.refreshVerification,
    loadOnboarding: hoisted.loadOnboarding,
    ensureNonCompetePlaceholder: hoisted.ensureNonCompetePlaceholder,
    loadSignatureForVersion: hoisted.loadSignatureForVersion,
    loadPendingSession: hoisted.loadPendingSession,
    listCurrentIdentity: hoisted.listCurrentIdentity,
    loadIdentity: hoisted.loadIdentity,
    findOnboardingByTokenHash: hoisted.findOnboardingByTokenHash,
  };
});

import { jobBoardingRouter } from "./jobBoarding";

const TIN = "123456789";

function caller(role: string, id = 4) {
  return jobBoardingRouter.createCaller({
    user: { id, role, email: "ada@example.com", name: "Ada" },
    req: { headers: {} },
    res: {},
  } as never);
}

describe("job boarding access and encryption", () => {
  beforeEach(() => {
    process.env[W9_TAX_ID_ENCRYPTION_KEY_ENV] = "test-only-job-boarding-key";
    hoisted.loadProgress.mockReset();
    hoisted.saveW9.mockReset();
    hoisted.loadW9.mockReset();
    hoisted.refreshVerification.mockReset();
    hoisted.loadOnboarding.mockReset();
    hoisted.ensureNonCompetePlaceholder.mockReset();
    hoisted.loadSignatureForVersion.mockReset();
    hoisted.loadPendingSession.mockReset();
    hoisted.listCurrentIdentity.mockReset();
    hoisted.loadIdentity.mockReset();
    hoisted.findOnboardingByTokenHash.mockReset();
    hoisted.refreshVerification.mockResolvedValue(false);
    hoisted.loadProgress.mockResolvedValue({
      informationComplete: true,
      nonCompeteSigned: true,
      w9Submitted: true,
      identityUploaded: false,
    });
  });

  it("stores an encrypted TIN, returns only the mask, and does not log the number", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    hoisted.saveW9.mockResolvedValue({});

    const result = await caller("user").submitW9({
      legalName: "Ada Lovelace",
      businessName: null,
      taxClassification: "individual",
      address: "1 Analytical Way",
      city: "London",
      state: "NA",
      zip: "00000",
      tinType: "ssn",
      tin: TIN,
      signatureName: "Ada Lovelace",
      signedOn: "2026-11-10",
    });

    expect(result.tin).toBeNull();
    expect(result.tinMasked).toBe("***-**-6789");
    const saved = hoisted.saveW9.mock.calls[0]?.[2] as { tinEnvelope: string; tinLast4: string };
    expect(saved.tinEnvelope.startsWith("cabinetdealz:w9tax:v1:")).toBe(true);
    expect(saved.tinEnvelope).not.toContain(TIN);
    expect(saved.tinLast4).toBe("6789");
    const logged = [error, log, info].flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(" "))).join("\n");
    expect(logged).not.toContain(TIN);
    error.mockRestore();
    log.mockRestore();
    info.mockRestore();
  });

  it("lets an admin reveal a TIN and refuses the salesperson and every other account", async () => {
    const envelope = encryptW9TaxId(TIN);
    hoisted.loadW9.mockResolvedValue({ tinEnvelope: envelope, tinLast4: "6789", tinType: "ssn" });

    await expect(caller("sales_rep").adminRevealTin({ userId: 4 })).rejects.toThrow(/permission/i);
    await expect(caller("user", 9).adminRevealTin({ userId: 4 })).rejects.toThrow(/permission/i);
    await expect(caller("admin", 1).adminRevealTin({ userId: 4 })).resolves.toEqual({
      tin: TIN,
      tinMasked: "***-**-6789",
      tinType: "ssn",
    });
  });

  it("serves an ID only through an admin signed link and hides the storage key from the salesperson", async () => {
    await expect(caller("sales_rep").adminIdentityLink({ documentId: 8 })).rejects.toThrow(/permission/i);
    hoisted.loadIdentity.mockResolvedValue({
      id: 8,
      storageKey: "salesperson-identity/4/id-front_abcd.jpg",
      supersededAt: null,
    });
    const link = await caller("admin", 1).adminIdentityLink({ documentId: 8 });
    expect(link.expiresInSeconds).toBe(300);
    expect(link.url).toContain("salesperson-identity/4/id-front_abcd.jpg");
    expect(hoisted.storageGetSignedUrl).toHaveBeenCalledWith("salesperson-identity/4/id-front_abcd.jpg", 300);

    const envelope = encryptW9TaxId(TIN);
    hoisted.loadOnboarding.mockResolvedValue({
      fullName: "Ada",
      email: "ada@example.com",
      phone: "555-0100",
      businessName: "Analytical",
      licenseNumber: null,
      address1: "1 Analytical Way",
      address2: null,
      city: "London",
      state: "NA",
      postalCode: "00000",
      informationCompletedAt: new Date(),
    });
    hoisted.ensureNonCompetePlaceholder.mockResolvedValue({
      document: { id: 1, slug: "salesperson-non-compete", title: "Salesperson non-compete", termYears: 2 },
      version: {
        id: 2,
        version: 1,
        title: "Salesperson non-compete",
        termYears: 2,
        kind: "markdown",
        bodyMarkdown: "Two-year non-compete — final text pending from Tom or his attorney",
        filename: null,
        docusealTemplateId: null,
      },
    });
    hoisted.loadSignatureForVersion.mockResolvedValue(null);
    hoisted.loadPendingSession.mockResolvedValue(null);
    hoisted.loadW9.mockResolvedValue({
      submittedAt: new Date(),
      legalName: "Ada Lovelace",
      businessName: null,
      taxClassification: "individual",
      llcClassification: null,
      address: "1 Analytical Way",
      city: "London",
      state: "NA",
      zip: "00000",
      tinType: "ssn",
      tinLast4: "6789",
      tinEnvelope: envelope,
      signatureName: "Ada Lovelace",
      signedOn: "2026-11-10",
    });
    hoisted.listCurrentIdentity.mockResolvedValue([{
      id: 8,
      label: "front",
      originalName: "license.jpg",
      mimeType: "image/jpeg",
      createdAt: new Date("2026-11-10T00:00:00.000Z"),
      storageKey: "salesperson-identity/4/id-front_abcd.jpg",
    }]);

    const status = await caller("sales_rep").myStatus();
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(TIN);
    expect(serialized).not.toContain(envelope);
    expect(serialized).not.toContain("salesperson-identity/");
    expect(status.w9?.tin).toBeNull();
    expect(status.w9?.tinMasked).toBe("***-**-6789");
    expect(status.nonCompete?.metadata).toMatchObject({ termYears: 2, termLabel: "2 years", placeholder: true });
  });

  it("refuses a verification link that belongs to someone else", async () => {
    hoisted.findOnboardingByTokenHash.mockResolvedValue({ userId: 99 });
    await expect(caller("user", 4).openVerification({ token: "a".repeat(24) })).rejects.toThrow(/does not belong/);
  });

  it("refuses the admin queue to a salesperson", async () => {
    await expect(caller("sales_rep").adminList()).rejects.toThrow(/permission/i);
  });
});
