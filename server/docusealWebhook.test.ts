/**
 * DocuSeal webhook end to end over a real HTTP server.
 *
 * The route is exercised with the signature header DocuSeal actually sends, so
 * these tests catch the one thing a unit test cannot: that the raw body reaches
 * the handler unparsed. express.json() is registered afterwards, exactly as in
 * server/_core/index.ts.
 *
 * No network leaves the process: DocuSeal's API is a stub provider and storage
 * is mocked. The database is the in-memory store.
 */
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  affiliateLegalDocuments,
  affiliateLegalDocumentVersions,
  affiliateLegalSignatures,
  affiliateLegalSigningSessions,
} from "../drizzle/schema";
import { memoryStore, type Row } from "./lib/__testDb";
import { setEsignatureProvider } from "./lib/docusealProvider";
import type { EsignatureProvider } from "./lib/esignatureProvider";
import { registerDocusealWebhook } from "./docusealWebhook";

const { getDbMock, putMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  putMock: vi.fn(async (key: string) => ({ key, url: `/manus-storage/${key}` })),
}));

vi.mock("./db", () => ({
  getDb: getDbMock,
  notInConflict: () => undefined,
  getPricingSettings: async () => ({}),
  getPlatformPricingSettings: async () => ({}),
}));
vi.mock("./storage", async () => {
  const actual = await vi.importActual<typeof import("./storage")>("./storage");
  return { ...actual, storagePut: putMock };
});

const WEBHOOK_SECRET = `whsec_${Buffer.from("docuseal-webhook-test-key").toString("base64")}`;
const AFFILIATE_ID = 3;
const DOCUMENT_ID = 11;
const VERSION_ID = 21;

let tables: Map<unknown, Row[]>;
let server: Server | null = null;
let baseUrl = "";

function seed() {
  tables = new Map<unknown, Row[]>([
    [
      affiliateLegalDocuments,
      [
        {
          id: DOCUMENT_ID,
          slug: "affiliate-agreement",
          title: "Affiliate Agreement",
          isActive: true,
          requiredForMembership: true,
          currentVersionId: VERSION_ID,
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
          bodyMarkdown: "# Agreement",
          contentSha256: "a".repeat(64),
          docusealTemplateId: 555,
        },
      ],
    ],
    [affiliateLegalSignatures, []],
    [
      affiliateLegalSigningSessions,
      [
        {
          id: 500,
          affiliateId: AFFILIATE_ID,
          documentId: DOCUMENT_ID,
          documentVersionId: VERSION_ID,
          providerSubmissionId: "900",
          providerSubmitterId: "77",
          status: "pending",
        },
      ],
    ],
  ]);
  getDbMock.mockResolvedValue(memoryStore(tables));
}

function signingProvider(overrides: Partial<EsignatureProvider> = {}): EsignatureProvider {
  return {
    name: "docuseal",
    createSigningRequest: vi.fn(),
    resumeSigningRequest: vi.fn(async () => null),
    fetchSignedArtifacts: vi.fn(async () => [
      { kind: "signed_pdf", filename: "signed.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.7 signed") },
      { kind: "audit_log", filename: "audit.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.7 audit") },
    ]),
    createTemplateFromPdf: vi.fn(async () => ({ templateId: "1" })),
    ...overrides,
  };
}

async function startServer(): Promise<void> {
  const app = express();
  registerDocusealWebhook(app);
  // Same order as production: the webhook is registered before the JSON parser.
  app.use(express.json({ limit: "5mb" }));
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once("listening", () => resolve()));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
}

function sign(payload: string, secret = WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000)): string {
  return `${timestamp}.${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;
}

function formCompletedPayload(): string {
  return JSON.stringify({
    event_type: "form.completed",
    timestamp: "2026-11-07T12:00:00Z",
    data: {
      id: 77,
      email: "ada@example.test",
      name: "Ada Lovelace",
      ip: "203.0.113.9",
      ua: "Mozilla/5.0 (signer browser)",
      status: "completed",
      external_id: `cd-legal:a${AFFILIATE_ID}:v${VERSION_ID}`,
      completed_at: "2026-11-07T11:59:30.000Z",
      audit_log_url: "https://docuseal.example/file/audit-log.pdf",
      submission: {
        id: 900,
        status: "completed",
        audit_log_url: "https://docuseal.example/file/audit-log.pdf",
      },
      template: { id: 555 },
    },
  });
}

async function post(body: string, signature: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["x-docuseal-signature"] = signature;
  const response = await fetch(`${baseUrl}/api/docuseal/webhook`, { method: "POST", headers, body });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("DOCUSEAL_WEBHOOK_SECRET", WEBHOOK_SECRET);
  vi.stubEnv("DOCUSEAL_API_KEY", "test-key-value");
  seed();
  putMock.mockClear();
  setEsignatureProvider(signingProvider());
});

afterEach(async () => {
  setEsignatureProvider(null);
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
});

describe("DocuSeal webhook", () => {
  it("records a signature, copies the evidence, and closes the session", async () => {
    const provider = signingProvider();
    setEsignatureProvider(provider);
    await startServer();

    const body = formCompletedPayload();
    const result = await post(body, sign(body));
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({ received: true, handled: true, eventType: "form.completed" });

    const signatures = tables.get(affiliateLegalSignatures) ?? [];
    expect(signatures).toHaveLength(1);
    const signature = signatures[0]!;
    expect(signature).toMatchObject({
      affiliateId: AFFILIATE_ID,
      documentId: DOCUMENT_ID,
      documentVersionId: VERSION_ID,
      documentSlug: "affiliate-agreement",
      documentVersion: 1,
      documentTitle: "Affiliate Agreement",
      contentSha256: "a".repeat(64),
      provider: "docuseal",
      providerSubmissionId: "900",
      providerSubmitterId: "77",
      signerName: "Ada Lovelace",
      signerEmail: "ada@example.test",
      signerIp: "203.0.113.9",
      providerAuditLogUrl: "https://docuseal.example/file/audit-log.pdf",
    });
    // The provider's audit timestamp is kept, not the moment we received it.
    expect((signature.completedAt as Date).toISOString()).toBe("2026-11-07T11:59:30.000Z");

    expect(provider.fetchSignedArtifacts).toHaveBeenCalledWith({ submissionId: "900", auditLogUrl: "https://docuseal.example/file/audit-log.pdf" });
    expect(putMock).toHaveBeenCalledTimes(2);
    const keys = putMock.mock.calls.map((call) => call[0] as string);
    expect(keys.every((key) => key.startsWith(`affiliate-legal-signatures/a${AFFILIATE_ID}/v${VERSION_ID}/`))).toBe(true);
    expect(signature.signedPdfKey).toBeTruthy();
    expect(signature.auditLogKey).toBeTruthy();

    const sessions = tables.get(affiliateLegalSigningSessions) ?? [];
    expect(sessions[0]?.status).toBe("completed");
  });

  it("is idempotent: a replayed webhook writes no second signature", async () => {
    await startServer();
    const body = formCompletedPayload();
    expect((await post(body, sign(body))).status).toBe(200);
    const second = await post(body, sign(body));
    expect(second.status).toBe(200);
    expect(second.json.signatures).toMatchObject([{ duplicate: true }]);
    expect(tables.get(affiliateLegalSignatures)).toHaveLength(1);
  });

  it("refuses a missing, wrong, or stale signature and writes nothing", async () => {
    await startServer();
    const body = formCompletedPayload();

    expect((await post(body, null)).status).toBe(401);
    expect((await post(body, sign(body, "another-secret"))).status).toBe(401);
    const stale = sign(body, WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 3600);
    expect((await post(body, stale)).status).toBe(401);
    // A body that was modified after signing fails too.
    expect((await post(`${body} `, sign(body))).status).toBe(401);
    expect(tables.get(affiliateLegalSignatures)).toEqual([]);
  });

  it("fails closed with 503 when no webhook secret is configured", async () => {
    vi.stubEnv("DOCUSEAL_WEBHOOK_SECRET", "");
    await startServer();
    const body = formCompletedPayload();
    const result = await post(body, sign(body));
    expect(result.status).toBe(503);
    expect(String(result.json.error)).toMatch(/not configured/);
    expect(tables.get(affiliateLegalSignatures)).toEqual([]);
  });

  it("acknowledges and ignores events it does not act on", async () => {
    await startServer();
    const body = JSON.stringify({ event_type: "form.viewed", data: { id: 77 } });
    const result = await post(body, sign(body));
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({ handled: false, eventType: "form.viewed" });
    expect(tables.get(affiliateLegalSignatures)).toEqual([]);
  });

  it("records nothing for a signer it cannot attribute, and does not invite a retry loop", async () => {
    await startServer();
    const body = JSON.stringify({
      event_type: "form.completed",
      data: { id: 77, external_id: "someone-elses-id", submission: { id: 900 } },
    });
    const result = await post(body, sign(body));
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({ handled: false, reason: "unrecognised_signer" });
    expect(tables.get(affiliateLegalSignatures)).toEqual([]);
  });

  it("keeps the signature when the evidence copy fails, and asks DocuSeal to retry", async () => {
    const failing = signingProvider({
      fetchSignedArtifacts: vi.fn(async () => {
        throw new Error("docuseal download timed out");
      }),
    });
    setEsignatureProvider(failing);
    await startServer();

    const body = formCompletedPayload();
    const result = await post(body, sign(body));
    expect(result.status).toBe(500);

    // The signature is legally made; only its stored copy is missing.
    const signatures = tables.get(affiliateLegalSignatures) ?? [];
    expect(signatures).toHaveLength(1);
    expect(signatures[0]?.signedPdfKey ?? null).toBeNull();
    expect(signatures[0]?.providerAuditLogUrl).toBe("https://docuseal.example/file/audit-log.pdf");

    // The retry completes the copy without creating a second signature.
    setEsignatureProvider(signingProvider());
    const retry = await post(body, sign(body));
    expect(retry.status).toBe(200);
    expect(tables.get(affiliateLegalSignatures)).toHaveLength(1);
    expect((tables.get(affiliateLegalSignatures) ?? [])[0]?.signedPdfKey).toBeTruthy();
  });

  it("marks a declined form on the session without recording a signature", async () => {
    await startServer();
    const body = JSON.stringify({
      event_type: "form.declined",
      data: {
        id: 77,
        status: "declined",
        decline_reason: "Wanted a lawyer to review it",
        external_id: `cd-legal:a${AFFILIATE_ID}:v${VERSION_ID}`,
        submission: { id: 900 },
      },
    });
    const result = await post(body, sign(body));
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({ handled: true, eventType: "form.declined" });
    expect((tables.get(affiliateLegalSigningSessions) ?? [])[0]?.status).toBe("declined");
    expect(tables.get(affiliateLegalSignatures)).toEqual([]);
  });

  it("handles a submission.completed event for each tagged submitter", async () => {
    await startServer();
    const body = JSON.stringify({
      event_type: "submission.completed",
      data: {
        submission: { id: 900, status: "completed", audit_log_url: "https://docuseal.example/file/audit-log.pdf" },
        submitters: [
          {
            id: 77,
            status: "completed",
            name: "Ada Lovelace",
            email: "ada@example.test",
            external_id: `cd-legal:a${AFFILIATE_ID}:v${VERSION_ID}`,
            completed_at: "2026-11-07T11:59:30.000Z",
          },
          { id: 78, status: "completed", external_id: "some-other-integration" },
        ],
      },
    });
    const result = await post(body, sign(body));
    expect(result.status).toBe(200);
    expect(tables.get(affiliateLegalSignatures)).toHaveLength(1);
  });
});
