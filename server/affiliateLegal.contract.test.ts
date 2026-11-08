/**
 * Affiliate legal contracts: admin store, affiliate portal, signing, and the
 * onboarding gate.
 *
 * Deterministic: the real router runs against in-memory rows, DocuSeal is a
 * stub provider, and storage is mocked. No network, no database, no bucket.
 *
 * The assertions that matter most:
 *   - "DocuSeal not configured" is a clear refusal, with no fallback signing
 *   - a signature only counts on the document's current version
 *   - signatures are append-only: the router exposes no update and no delete
 *   - a signed copy is only readable by the affiliate who signed, or an admin
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  affiliateLegalDocuments,
  affiliateLegalDocumentVersions,
  affiliateLegalSignatures,
  affiliateLegalSigningSessions,
} from "../drizzle/schema";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { memoryStore, type Row } from "./lib/__testDb";
import { getEsignatureProvider, setEsignatureProvider } from "./lib/docusealProvider";
import { hasSignedAllRequired, loadLegalDocumentGate } from "./lib/affiliateLegalContracts";
import type { EsignatureProvider } from "./lib/esignatureProvider";
import { storageGetSignedUrl, storagePut } from "./storage";
import { bucketForKey, PRIVATE_BUCKET } from "./storage";

const { getDbMock, accessMock, putMock, signMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  accessMock: vi.fn(),
  putMock: vi.fn(async (key: string) => ({ key, url: `/manus-storage/${key}` })),
  signMock: vi.fn(async (key: string) => `https://signed.example/${key}`),
}));

vi.mock("./db", () => ({
  getDb: getDbMock,
  notInConflict: () => undefined,
  getPricingSettings: async () => ({}),
  getPlatformPricingSettings: async () => ({}),
}));
vi.mock("./lib/affiliateAccess", () => ({
  resolveAffiliateAccess: accessMock,
  loadAffiliateResolution: async () => ({ access: null, ambiguousAffiliateIds: [], link: null }),
}));
vi.mock("./storage", async () => {
  const actual = await vi.importActual<typeof import("./storage")>("./storage");
  return {
    ...actual,
    storagePut: putMock,
    storageGetSignedUrl: signMock,
    storageFetchObject: vi.fn(async () => new Response(Buffer.from("%PDF-1.4 stored"), { status: 200 })),
  };
});

const AFFILIATE_ID = 3;
const DOCUMENT_ID = 11;
const VERSION_ID = 21;

let tables: Map<unknown, Row[]>;

function seedStore() {
  tables = new Map<unknown, Row[]>([
    [
      affiliateLegalDocuments,
      [
        {
          id: DOCUMENT_ID,
          slug: "affiliate-agreement",
          title: "Affiliate Agreement",
          summary: "The membership contract.",
          sortOrder: 10,
          isActive: true,
          requiredForMembership: true,
          currentVersionId: VERSION_ID,
          createdByUserId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 12,
          slug: "brand-guidelines",
          title: "Brand Guidelines",
          summary: null,
          sortOrder: 20,
          isActive: true,
          requiredForMembership: false,
          currentVersionId: null,
          createdByUserId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ],
    [
      affiliateLegalDocumentVersions,
      [
        {
          id: VERSION_ID,
          documentId: DOCUMENT_ID,
          version: 1,
          title: "Affiliate Agreement",
          kind: "markdown",
          bodyMarkdown: "# Agreement\n\nYou agree.",
          fileKey: null,
          filename: null,
          mimeType: "text/markdown",
          sizeBytes: 24,
          contentSha256: "a".repeat(64),
          docusealTemplateId: 555,
          publishedAt: new Date(),
          createdByUserId: 1,
          createdAt: new Date(),
        },
      ],
    ],
    [affiliateLegalSignatures, []],
    [affiliateLegalSigningSessions, []],
  ]);
  getDbMock.mockResolvedValue(memoryStore(tables));
}

function adminCtx(): TrpcContext {
  return {
    user: { id: 1, openId: "o-admin", name: "Admin", email: "admin@cabinetdealz.test", role: "admin" } as TrpcContext["user"],
    req: { protocol: "https", headers: { "user-agent": "vitest" } } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function affiliateCtx(email = "ada@example.test"): TrpcContext {
  return {
    user: { id: 42, openId: "o-affiliate", name: "Ada", email, role: "partner" } as TrpcContext["user"],
    req: {
      protocol: "https",
      headers: { "user-agent": "vitest-agent", "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
      socket: { remoteAddress: "10.0.0.1" },
    } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function stubProvider(overrides: Partial<EsignatureProvider> = {}): EsignatureProvider {
  return {
    name: "docuseal",
    createSigningRequest: vi.fn(async () => ({
      submissionId: "900",
      submitterId: "77",
      embedSrc: "https://docuseal.example/s/embed",
      status: "sent",
    })),
    resumeSigningRequest: vi.fn(async () => null),
    fetchSignedArtifacts: vi.fn(async () => []),
    createTemplateFromPdf: vi.fn(async () => ({ templateId: "4242" })),
    ...overrides,
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  seedStore();
  accessMock.mockReset();
  accessMock.mockResolvedValue({ affiliateId: AFFILIATE_ID, isOwner: true, accessCrm: true, accessDesigner: true, accessMarketing: true, teamMemberId: null });
  putMock.mockClear();
  signMock.mockClear();
  setEsignatureProvider(null);
});

describe("admin legal document store", () => {
  it("publishes a first version with a server-computed SHA-256", async () => {
    const caller = appRouter.createCaller(adminCtx());
    const saved = await caller.affiliateLegal.adminSaveDocument({
      title: "Non-Compete",
      slug: "non-compete",
      version: { bodyMarkdown: "Two years." },
    });
    expect(saved.id).toBeGreaterThan(0);
    expect(saved.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    const rows = tables.get(affiliateLegalDocumentVersions) ?? [];
    const created = rows.find((row) => row.id === saved.versionId);
    expect(created?.version).toBe(1);
    expect(created?.kind).toBe("markdown");
    // The document now points at the version it just published.
    const document = (tables.get(affiliateLegalDocuments) ?? []).find((row) => row.id === saved.id);
    expect(document?.currentVersionId).toBe(saved.versionId);
  });

  it("publishing an edit inserts a new immutable version instead of rewriting the old one", async () => {
    const caller = appRouter.createCaller(adminCtx());
    const first = await caller.affiliateLegal.adminSaveDocument({
      id: DOCUMENT_ID,
      title: "Affiliate Agreement",
      version: { bodyMarkdown: "Version two text." },
    });
    expect(first.version).toBe(2);
    const rows = tables.get(affiliateLegalDocumentVersions) ?? [];
    expect(rows).toHaveLength(2);
    // The version that was signed is untouched, byte for byte.
    const original = rows.find((row) => row.id === VERSION_ID);
    expect(original?.bodyMarkdown).toBe("# Agreement\n\nYou agree.");
    expect(original?.contentSha256).toBe("a".repeat(64));
    const document = (tables.get(affiliateLegalDocuments) ?? []).find((row) => row.id === DOCUMENT_ID);
    expect(document?.currentVersionId).toBe(first.versionId);
  });

  it("rejects a slug that is already taken", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.affiliateLegal.adminSaveDocument({ title: "Duplicate", slug: "affiliate-agreement" }),
    ).rejects.toThrow(/already exists/);
  });

  it("stores an uploaded PDF privately and refuses a file that is not a PDF", async () => {
    const caller = appRouter.createCaller(adminCtx());
    const pdf = Buffer.from("%PDF-1.4\ncontract").toString("base64");
    const saved = await caller.affiliateLegal.adminSaveDocument({
      title: "Membership Contract",
      slug: "membership-contract",
      version: { pdfBase64: pdf, filename: "contract.pdf" },
    });
    expect(saved.versionId).toBeGreaterThan(0);
    const key = putMock.mock.calls[0]?.[0] as string;
    expect(key.startsWith("affiliate-legal-documents/")).toBe(true);
    expect(bucketForKey(key)).toBe(PRIVATE_BUCKET);

    await expect(
      caller.affiliateLegal.adminSaveDocument({
        title: "Bad Upload",
        slug: "bad-upload",
        version: { pdfBase64: Buffer.from("not a pdf").toString("base64"), filename: "x.pdf" },
      }),
    ).rejects.toThrow(/not a PDF/);
  });

  it("builds a DocuSeal template from an uploaded PDF and stores its id on the version", async () => {
    vi.stubEnv("DOCUSEAL_API_KEY", "test-key-value");
    const provider = stubProvider({ createTemplateFromPdf: vi.fn(async () => ({ templateId: "4242" })) });
    setEsignatureProvider(provider);
    const caller = appRouter.createCaller(adminCtx());
    const saved = await caller.affiliateLegal.adminSaveDocument({
      title: "Membership Contract",
      slug: "membership-contract",
      version: {
        pdfBase64: Buffer.from("%PDF-1.4\ncontract").toString("base64"),
        filename: "contract.pdf",
        buildTemplate: true,
      },
    });
    expect(saved.docusealTemplateId).toBe(4242);
    expect(provider.createTemplateFromPdf).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Membership Contract v1", externalId: `cd-legal-doc-${saved.id}-v1` }),
    );
    const version = (tables.get(affiliateLegalDocumentVersions) ?? []).find((row) => row.id === saved.versionId);
    expect(version?.docusealTemplateId).toBe(4242);
  });

  it("refuses to build a template from markdown, and refuses when DocuSeal is not configured", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.affiliateLegal.adminSaveDocument({
        title: "Markdown Contract",
        slug: "markdown-contract",
        version: { bodyMarkdown: "# text", buildTemplate: true },
      }),
    ).rejects.toThrow(/from a PDF version/);

    vi.stubEnv("DOCUSEAL_API_KEY", "");
    await expect(
      caller.affiliateLegal.adminSaveDocument({
        title: "PDF Contract",
        slug: "pdf-contract",
        version: { pdfBase64: Buffer.from("%PDF-1.4 x").toString("base64"), buildTemplate: true },
      }),
    ).rejects.toThrow(/DocuSeal not configured/);
  });

  it("does not expose a way to delete or rewrite a signature", () => {
    const caller = appRouter.createCaller(adminCtx()) as unknown as Record<string, Record<string, unknown>>;
    const procedures = Object.keys(caller.affiliateLegal ?? {});
    expect(procedures.filter((name) => /delete|remove|updateSignature|editSignature/i.test(name))).toEqual([]);
  });

  it("only admins reach the admin surface", async () => {
    const caller = appRouter.createCaller(affiliateCtx());
    await expect(caller.affiliateLegal.adminList()).rejects.toThrow(/permission/i);
    await expect(
      caller.affiliateLegal.adminSaveDocument({ title: "Nope", slug: "nope" }),
    ).rejects.toThrow(/permission/i);
  });
});

describe("affiliate portal", () => {
  it("lists required contracts and shows them as unsigned", async () => {
    const caller = appRouter.createCaller(affiliateCtx());
    const result = await caller.affiliateLegal.myRequiredDocuments();
    expect(result.signedAll).toBe(false);
    expect(result.documents.map((entry) => entry.slug)).toEqual(["affiliate-agreement", "brand-guidelines"]);
    const agreement = result.documents[0]!;
    expect(agreement.required).toBe(true);
    expect(agreement.status).toBe("unsigned");
    expect(agreement.signingReady).toBe(true);
    expect(agreement.kind).toBe("markdown");
    // The optional document never blocks and is not marked required.
    expect(result.documents[1]!.required).toBe(false);
  });

  it("reports a version with an open signing request as in progress, for Resume", async () => {
    tables.set(affiliateLegalSigningSessions, [
      {
        id: 500,
        affiliateId: AFFILIATE_ID,
        documentId: DOCUMENT_ID,
        documentVersionId: VERSION_ID,
        providerSubmissionId: "900",
        providerSubmitterId: "77",
        status: "pending",
      },
    ]);
    const caller = appRouter.createCaller(affiliateCtx());
    const result = await caller.affiliateLegal.myRequiredDocuments();
    expect(result.inProgressVersionIds).toEqual([VERSION_ID]);
    expect(result.documents[0]?.status).toBe("in_progress");
  });

  it("requires affiliate access", async () => {
    accessMock.mockResolvedValue(null);
    const caller = appRouter.createCaller(affiliateCtx());
    await expect(caller.affiliateLegal.myRequiredDocuments()).rejects.toThrow(/Affiliate access required/);
    await expect(caller.affiliateLegal.startSigning({ documentId: DOCUMENT_ID, consent: true, typedLegalName: "Ada Lovelace" })).rejects.toThrow(
      /Affiliate access required/,
    );
  });

  it("refuses to start signing when DocuSeal is not configured, with a clear message", async () => {
    vi.stubEnv("DOCUSEAL_API_KEY", "");
    setEsignatureProvider(stubProvider());
    const caller = appRouter.createCaller(affiliateCtx());
    const error = await caller.affiliateLegal
      .startSigning({ documentId: DOCUMENT_ID, consent: true, typedLegalName: "Ada Lovelace" })
      .catch((caught: unknown) => caught as Error);
    expect(error.message).toMatch(/DocuSeal not configured/);
    expect(error.message).toMatch(/DOCUSEAL_API_KEY/);
    // Nothing was created and no provider call was attempted.
    expect(tables.get(affiliateLegalSigningSessions)).toEqual([]);
  });

  it("requires explicit consent before a request is created", async () => {
    vi.stubEnv("DOCUSEAL_API_KEY", "test-key-value");
    const provider = stubProvider();
    setEsignatureProvider(provider);
    const caller = appRouter.createCaller(affiliateCtx());
    await expect(
      // consent is a literal true; a caller that omits it fails validation.
      caller.affiliateLegal.startSigning({ documentId: DOCUMENT_ID, typedLegalName: "Ada Lovelace" } as never),
    ).rejects.toThrow();
    expect(provider.createSigningRequest).not.toHaveBeenCalled();
  });

  it("creates a DocuSeal submission with our signer tag and records a pending session", async () => {
    vi.stubEnv("DOCUSEAL_API_KEY", "test-key-value");
    const provider = stubProvider();
    setEsignatureProvider(provider);
    const caller = appRouter.createCaller(affiliateCtx());
    const started = await caller.affiliateLegal.startSigning({
      documentId: DOCUMENT_ID,
      consent: true,
      typedLegalName: "Ada Lovelace",
    });

    expect(started.embedSrc).toBe("https://docuseal.example/s/embed");
    expect(started.resume).toBe(false);
    expect(provider.createSigningRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 555,
        signer: expect.objectContaining({
          name: "Ada Lovelace",
          email: "ada@example.test",
          externalId: `cd-legal:a${AFFILIATE_ID}:v${VERSION_ID}`,
        }),
      }),
    );
    const sessions = tables.get(affiliateLegalSigningSessions) ?? [];
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      affiliateId: AFFILIATE_ID,
      documentVersionId: VERSION_ID,
      providerSubmissionId: "900",
      status: "pending",
    });
  });

  it("resumes an open request instead of filing a second submission", async () => {
    vi.stubEnv("DOCUSEAL_API_KEY", "test-key-value");
    tables.set(affiliateLegalSigningSessions, [
      {
        id: 500,
        affiliateId: AFFILIATE_ID,
        documentId: DOCUMENT_ID,
        documentVersionId: VERSION_ID,
        provider: "docuseal",
        providerSubmissionId: "900",
        providerSubmitterId: "77",
        status: "pending",
        createdAt: new Date(),
      },
    ]);
    const provider = stubProvider({
      resumeSigningRequest: vi.fn(async () => ({ embedSrc: "https://docuseal.example/s/resumed" })),
    });
    setEsignatureProvider(provider);
    const caller = appRouter.createCaller(affiliateCtx());
    const started = await caller.affiliateLegal.startSigning({
      documentId: DOCUMENT_ID,
      consent: true,
      typedLegalName: "Ada Lovelace",
    });
    expect(started.resume).toBe(true);
    expect(started.embedSrc).toBe("https://docuseal.example/s/resumed");
    expect(provider.createSigningRequest).not.toHaveBeenCalled();
    expect(tables.get(affiliateLegalSigningSessions)).toHaveLength(1);
  });

  it("refuses a contract that has no DocuSeal template yet", async () => {
    vi.stubEnv("DOCUSEAL_API_KEY", "test-key-value");
    setEsignatureProvider(stubProvider());
    tables.set(affiliateLegalDocumentVersions, [
      ...(tables.get(affiliateLegalDocumentVersions) ?? []).map((row) => ({ ...row, docusealTemplateId: null })),
    ]);
    const caller = appRouter.createCaller(affiliateCtx());
    await expect(
      caller.affiliateLegal.startSigning({ documentId: DOCUMENT_ID, consent: true, typedLegalName: "Ada Lovelace" }),
    ).rejects.toThrow(/not ready for signing/);
  });

  it("refuses to sign the same version twice", async () => {
    vi.stubEnv("DOCUSEAL_API_KEY", "test-key-value");
    setEsignatureProvider(stubProvider());
    tables.set(affiliateLegalSignatures, [
      {
        id: 1,
        affiliateId: AFFILIATE_ID,
        documentVersionId: VERSION_ID,
        documentId: DOCUMENT_ID,
        completedAt: new Date(),
      },
    ]);
    const caller = appRouter.createCaller(affiliateCtx());
    await expect(
      caller.affiliateLegal.startSigning({ documentId: DOCUMENT_ID, consent: true, typedLegalName: "Ada Lovelace" }),
    ).rejects.toThrow(/already signed/);
  });
});

describe("signed copies", () => {
  it("lets the owning affiliate read their signed copy through a short-lived URL", async () => {
    tables.set(affiliateLegalSignatures, [
      {
        id: 7,
        affiliateId: AFFILIATE_ID,
        documentId: DOCUMENT_ID,
        documentVersionId: VERSION_ID,
        signedPdfKey: "affiliate-legal-signatures/a3/v21/signed-7.pdf",
        auditLogKey: "affiliate-legal-signatures/a3/v21/audit-7.pdf",
      },
    ]);
    const caller = appRouter.createCaller(affiliateCtx());
    const link = await caller.affiliateLegal.signedCopyLink({ signatureId: 7, kind: "signed" });
    expect(link.url).toContain("affiliate-legal-signatures/");
    expect(signMock).toHaveBeenCalled();
    expect(bucketForKey("affiliate-legal-signatures/a3/v21/signed-7.pdf")).toBe(PRIVATE_BUCKET);
  });

  it("refuses another affiliate's signed copy and allows an admin", async () => {
    tables.set(affiliateLegalSignatures, [
      {
        id: 7,
        affiliateId: 999,
        documentId: DOCUMENT_ID,
        documentVersionId: VERSION_ID,
        signedPdfKey: "affiliate-legal-signatures/a999/v21/signed-7.pdf",
        auditLogKey: null,
      },
    ]);
    const affiliate = appRouter.createCaller(affiliateCtx());
    await expect(affiliate.affiliateLegal.signedCopyLink({ signatureId: 7, kind: "signed" })).rejects.toThrow(
      /another affiliate/,
    );

    const admin = appRouter.createCaller(adminCtx());
    const link = await admin.affiliateLegal.signedCopyLink({ signatureId: 7, kind: "signed" });
    expect(link.url).toContain("signed-7.pdf");
  });

  it("says so when no stored copy exists rather than inventing a link", async () => {
    tables.set(affiliateLegalSignatures, [
      { id: 8, affiliateId: AFFILIATE_ID, documentId: DOCUMENT_ID, documentVersionId: VERSION_ID, signedPdfKey: null, auditLogKey: null },
    ]);
    const caller = appRouter.createCaller(affiliateCtx());
    await expect(caller.affiliateLegal.signedCopyLink({ signatureId: 8, kind: "signed" })).rejects.toThrow(
      /No stored copy/,
    );
  });
});

describe("onboarding gate", () => {
  it("is false until the required contract is signed, then true", async () => {
    expect(await hasSignedAllRequired(AFFILIATE_ID)).toBe(false);
    tables.set(affiliateLegalSignatures, [
      {
        id: 1,
        affiliateId: AFFILIATE_ID,
        documentId: DOCUMENT_ID,
        documentVersionId: VERSION_ID,
        completedAt: new Date("2026-11-05T10:00:00Z"),
      },
    ]);
    expect(await hasSignedAllRequired(AFFILIATE_ID)).toBe(true);
  });

  it("goes false again when a new version of a signed contract is published", async () => {
    tables.set(affiliateLegalSignatures, [
      { id: 1, affiliateId: AFFILIATE_ID, documentId: DOCUMENT_ID, documentVersionId: VERSION_ID, completedAt: new Date() },
    ]);
    expect(await hasSignedAllRequired(AFFILIATE_ID)).toBe(true);

    tables.set(affiliateLegalDocumentVersions, [
      ...(tables.get(affiliateLegalDocumentVersions) ?? []),
      {
        id: 22,
        documentId: DOCUMENT_ID,
        version: 2,
        title: "Affiliate Agreement",
        kind: "markdown",
        bodyMarkdown: "New terms.",
        contentSha256: "b".repeat(64),
        docusealTemplateId: 556,
        publishedAt: new Date(),
      },
    ]);
    tables.set(
      affiliateLegalDocuments,
      (tables.get(affiliateLegalDocuments) ?? []).map((row) => (row.id === DOCUMENT_ID ? { ...row, currentVersionId: 22 } : row)),
    );
    expect(await hasSignedAllRequired(AFFILIATE_ID)).toBe(false);
  });

  it("does not block on a required contract that has no published version yet, but reports it", async () => {
    tables.set(
      affiliateLegalDocuments,
      (tables.get(affiliateLegalDocuments) ?? []).map((row) => (row.id === DOCUMENT_ID ? { ...row, currentVersionId: null } : row)),
    );
    const gate = await loadLegalDocumentGate((await getDbMock()) as never, AFFILIATE_ID);
    expect(gate.signedAll).toBe(false);
    expect(gate.unpublished.map((entry) => entry.slug)).toEqual(["affiliate-agreement"]);
  });

  it("exposes the gate to the affiliate and to an admin for one affiliate", async () => {
    const affiliate = appRouter.createCaller(affiliateCtx());
    const mine = await affiliate.affiliateLegal.myGate();
    expect(mine.signedAll).toBe(false);
    expect(mine.pending.map((entry) => entry.slug)).toEqual(["affiliate-agreement"]);

    tables.set(affiliateLegalSignatures, [
      { id: 1, affiliateId: AFFILIATE_ID, documentId: DOCUMENT_ID, documentVersionId: VERSION_ID, completedAt: new Date() },
    ]);
    const admin = appRouter.createCaller(adminCtx());
    const view = await admin.affiliateLegal.adminAffiliateGate({ affiliateId: AFFILIATE_ID });
    expect(view.signedAllRequired).toBe(true);
    expect(view.signatures).toHaveLength(1);

    await expect(affiliate.affiliateLegal.adminAffiliateGate({ affiliateId: AFFILIATE_ID })).rejects.toThrow(/permission/i);
  });
});

describe("provider seam", () => {
  it("returns the same provider instance and can be replaced", () => {
    setEsignatureProvider(null);
    const first = getEsignatureProvider();
    expect(getEsignatureProvider()).toBe(first);
    const replacement = stubProvider();
    setEsignatureProvider(replacement);
    expect(getEsignatureProvider()).toBe(replacement);
    setEsignatureProvider(null);
  });
});

// Keeps the unused-import lint honest about storagePut in the mocked module.
void storagePut;
