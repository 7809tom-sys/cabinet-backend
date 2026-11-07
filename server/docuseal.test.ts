/**
 * DocuSeal transport, credential handling, and webhook signature verification.
 *
 * Nothing here touches the network: `fetchImpl` is a stub, and every assertion
 * about the API key is an assertion that it never appears in an error, a return
 * value, or a log argument.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  DOCUSEAL_DEFAULT_API_URL,
  createDocusealClient,
  docusealConfig,
  isDocusealConfigured,
  redactDocusealSecrets,
  verifyDocusealSignature,
} from "./lib/docuseal";
import { createDocusealProvider } from "./lib/docusealProvider";
import { EsignatureNotConfiguredError, EsignatureProviderError } from "./lib/esignatureProvider";

const API_KEY = "ds_live_super_secret_key_value";
const WEBHOOK_SECRET = `whsec_${Buffer.from("docuseal-webhook-test-key").toString("base64")}`;

const ENV = {
  DOCUSEAL_API_KEY: API_KEY,
  DOCUSEAL_WEBHOOK_SECRET: WEBHOOK_SECRET,
  DOCUSEAL_API_URL: "https://api.docuseal.test",
};

const EMPTY_ENV: Record<string, string> = {};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("DocuSeal configuration", () => {
  it("defaults the API URL and reports what is missing", () => {
    expect(docusealConfig(EMPTY_ENV)).toEqual({
      apiKey: "",
      apiUrl: DOCUSEAL_DEFAULT_API_URL,
      webhookSecret: "",
    });
    expect(isDocusealConfigured(EMPTY_ENV)).toBe(false);
    expect(isDocusealConfigured(ENV)).toBe(true);
  });

  it("falls back to the documented URL rather than fetching a placeholder value", () => {
    expect(docusealConfig({ DOCUSEAL_API_URL: "not-a-url" }).apiUrl).toBe(DOCUSEAL_DEFAULT_API_URL);
    expect(docusealConfig({ DOCUSEAL_API_URL: "https://eu.api.docuseal.com/" }).apiUrl).toBe("https://eu.api.docuseal.com");
  });

  it("scrubs the key and the secret out of a message", () => {
    const message = redactDocusealSecrets(`failed with ${API_KEY} and ${WEBHOOK_SECRET}`, ENV);
    expect(message).not.toContain(API_KEY);
    expect(message).not.toContain(WEBHOOK_SECRET);
    expect(message).toContain("[redacted]");
  });
});

describe("DocuSeal client", () => {
  it("refuses every call with no API key, so there is no fallback signing path", async () => {
    const client = createDocusealClient({ env: EMPTY_ENV, fetchImpl: vi.fn() });
    expect(client.isConfigured).toBe(false);
    await expect(
      client.createSubmission({ templateId: 1, signer: { name: "A", email: "a@x.test", externalId: "cd-legal:a1:v2" } }),
    ).rejects.toBeInstanceOf(EsignatureNotConfiguredError);
    await expect(client.getSubmissionDocuments("1")).rejects.toBeInstanceOf(EsignatureNotConfiguredError);
    await expect(client.createTemplateFromPdf({ name: "x", pdf: Buffer.from("%PDF-1.4") })).rejects.toBeInstanceOf(
      EsignatureNotConfiguredError,
    );
    await expect(client.downloadFile("https://docuseal.test/file.pdf")).rejects.toBeInstanceOf(
      EsignatureNotConfiguredError,
    );
  });

  it("creates a submission with email delivery off and returns the embedded URL", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        {
          id: 77,
          submission_id: 900,
          email: "ada@example.test",
          external_id: "cd-legal:a7:v42",
          status: "sent",
          embed_src: "https://docuseal.test/s/embed-abc",
        },
      ]),
    );
    const client = createDocusealClient({ env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await client.createSubmission({
      templateId: 1234,
      signer: { name: "Ada Lovelace", email: "ada@example.test", externalId: "cd-legal:a7:v42" },
    });

    expect(result.submitters[0]?.embed_src).toBe("https://docuseal.test/s/embed-abc");
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.docuseal.test/submissions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-Auth-Token"]).toBe(API_KEY);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.template_id).toBe(1234);
    // Email off: the affiliate signs in our portal, never from a provider email.
    expect(body.send_email).toBe(false);
    const submitters = body.submitters as Array<Record<string, unknown>>;
    expect(submitters[0]).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.test",
      external_id: "cd-legal:a7:v42",
    });
  });

  it("accepts the wrapped { submitters } shape as well as the bare array", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ submitters: [{ id: 1, submission_id: 2, email: null, embed_src: "https://docuseal.test/s/x" }] }),
    );
    const client = createDocusealClient({ env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await client.createSubmission({
      templateId: 1,
      signer: { name: "A", email: "a@x.test", externalId: "cd-legal:a1:v1" },
    });
    expect(result.submitters).toHaveLength(1);
  });

  it("reports an unusable response instead of pretending a signing URL exists", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const client = createDocusealClient({ env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(
      client.createSubmission({ templateId: 1, signer: { name: "A", email: "a@x.test", externalId: "cd-legal:a1:v1" } }),
    ).rejects.toBeInstanceOf(EsignatureProviderError);
  });

  it("never puts the API key in an error, even when the provider echoes it", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(`denied for token ${API_KEY}`, { status: 401 }),
    );
    const client = createDocusealClient({ env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client.createSubmission({
      templateId: 1,
      signer: { name: "A", email: "a@x.test", externalId: "cd-legal:a1:v1" },
    }).catch((caught: unknown) => caught as Error);
    expect(error).toBeInstanceOf(EsignatureProviderError);
    expect(error.message).not.toContain(API_KEY);
    expect(error.message).toContain("401");
  });

  it("reads the signed documents for a completed submission", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ id: 900, documents: [{ name: "agreement", url: "https://docuseal.test/file/a.pdf" }] }),
    );
    const client = createDocusealClient({ env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    const documents = await client.getSubmissionDocuments("900");
    expect(documents).toEqual([{ name: "agreement", url: "https://docuseal.test/file/a.pdf" }]);
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toBe("https://api.docuseal.test/submissions/900/documents");
  });

  it("builds a template from our own PDF bytes as base64", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 4242, slug: "abc" }));
    const client = createDocusealClient({ env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    const created = await client.createTemplateFromPdf({
      name: "Affiliate Agreement v1",
      pdf: Buffer.from("%PDF-1.4 test"),
      externalId: "cd-legal-doc-1-v1",
    });
    expect(created.templateId).toBe(4242);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.docuseal.test/templates/pdf");
    const body = JSON.parse(String(init.body)) as { documents: Array<{ file: string }> };
    expect(Buffer.from(body.documents[0]!.file, "base64").toString("utf8")).toBe("%PDF-1.4 test");
  });

  it("downloads a provider file with the API key", async () => {
    const bytes = Buffer.from("%PDF-1.7 signed");
    const fetchImpl = vi.fn(async () => new Response(bytes, { headers: { "content-type": "application/pdf" } }));
    const client = createDocusealClient({ env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    const file = await client.downloadFile("https://docuseal.test/file/signed.pdf");
    expect(file.bytes.toString("utf8")).toBe("%PDF-1.7 signed");
    expect(file.contentType).toBe("application/pdf");
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Auth-Token"]).toBe(API_KEY);
  });
});

describe("DocuSeal provider", () => {
  it("picks our submitter out of a multi-role submission by external id", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        { id: 1, submission_id: 50, email: "company@x.test", external_id: null, embed_src: "https://docuseal.test/s/staff" },
        { id: 2, submission_id: 50, email: "ada@x.test", external_id: "cd-legal:a7:v42", embed_src: "https://docuseal.test/s/ada" },
      ]),
    );
    const provider = createDocusealProvider({
      client: createDocusealClient({ env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch }),
    });
    const result = await provider.createSigningRequest({
      templateId: 1234,
      signer: { name: "Ada", email: "ada@x.test", externalId: "cd-legal:a7:v42" },
    });
    expect(result).toMatchObject({
      submissionId: "50",
      submitterId: "2",
      embedSrc: "https://docuseal.test/s/ada",
    });
  });

  it("refuses a template id that is not a usable number", async () => {
    const provider = createDocusealProvider({
      client: createDocusealClient({ env: ENV, fetchImpl: vi.fn() as unknown as typeof fetch }),
    });
    await expect(
      provider.createSigningRequest({
        templateId: "not-a-number",
        signer: { name: "A", email: "a@x.test", externalId: "cd-legal:a1:v1" },
      }),
    ).rejects.toBeInstanceOf(EsignatureProviderError);
  });

  it("resumes only a still-open signing request", async () => {
    const openFetch = vi.fn(async () =>
      jsonResponse({ id: 2, submission_id: 50, status: "sent", embed_src: "https://docuseal.test/s/again" }),
    );
    const openProvider = createDocusealProvider({
      client: createDocusealClient({ env: ENV, fetchImpl: openFetch as unknown as typeof fetch }),
    });
    await expect(openProvider.resumeSigningRequest({ submissionId: "50", submitterId: "2" })).resolves.toEqual({
      embedSrc: "https://docuseal.test/s/again",
    });

    const completedFetch = vi.fn(async () => jsonResponse({ id: 2, submission_id: 50, status: "completed", embed_src: "https://docuseal.test/s/done" }));
    const completedProvider = createDocusealProvider({
      client: createDocusealClient({ env: ENV, fetchImpl: completedFetch as unknown as typeof fetch }),
    });
    await expect(completedProvider.resumeSigningRequest({ submissionId: "50", submitterId: "2" })).resolves.toBeNull();
    await expect(completedProvider.resumeSigningRequest({ submissionId: "50", submitterId: null })).resolves.toBeNull();
  });

  it("collects the signed PDF and the audit trail separately", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const target = String(input);
      if (target.endsWith("/documents")) {
        return jsonResponse({ documents: [{ name: "Affiliate Agreement", url: "https://docuseal.test/file/signed.pdf" }] });
      }
      if (target.includes("audit-log")) {
        return new Response(Buffer.from("audit"), { headers: { "content-type": "application/pdf" } });
      }
      return new Response(Buffer.from("signed"), { headers: { "content-type": "application/pdf" } });
    });
    const provider = createDocusealProvider({
      client: createDocusealClient({ env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch }),
    });
    const artifacts = await provider.fetchSignedArtifacts({
      submissionId: "900",
      auditLogUrl: "https://docuseal.test/file/audit-log.pdf",
    });
    expect(artifacts.map((artifact) => artifact.kind)).toEqual(["signed_pdf", "audit_log"]);
    expect(artifacts[0]?.filename).toBe("Affiliate_Agreement.pdf");
    expect(artifacts[1]?.bytes.toString("utf8")).toBe("audit");
  });
});

describe("DocuSeal webhook signature", () => {
  const body = JSON.stringify({ event_type: "form.completed", data: { id: 1 } });

  function sign(payload: string, key: string, timestamp = Math.floor(Date.now() / 1000)): string {
    return `${timestamp}.${createHmac("sha256", key).update(`${timestamp}.${payload}`).digest("hex")}`;
  }

  it("accepts a correctly signed body", () => {
    expect(
      verifyDocusealSignature({ secret: WEBHOOK_SECRET, header: sign(body, WEBHOOK_SECRET), rawBody: body }),
    ).toEqual({ ok: true });
  });

  it("accepts the base64 payload of a whsec_ secret as the key too", () => {
    const decoded = Buffer.from(WEBHOOK_SECRET.slice("whsec_".length), "base64");
    expect(verifyDocusealSignature({ secret: WEBHOOK_SECRET, header: sign(body, decoded.toString("utf8")), rawBody: body })).toEqual(
      { ok: true },
    );
  });

  it("fails closed with no secret configured", () => {
    expect(verifyDocusealSignature({ secret: "", header: sign(body, WEBHOOK_SECRET), rawBody: body })).toEqual({
      ok: false,
      reason: "missing_secret",
    });
  });

  it("rejects a missing, malformed, stale, or tampered signature", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyDocusealSignature({ secret: WEBHOOK_SECRET, header: null, rawBody: body })).toEqual({
      ok: false,
      reason: "missing_header",
    });
    expect(verifyDocusealSignature({ secret: WEBHOOK_SECRET, header: "garbage", rawBody: body })).toEqual({
      ok: false,
      reason: "malformed_header",
    });
    const stale = sign(body, WEBHOOK_SECRET, now - 3600);
    expect(verifyDocusealSignature({ secret: WEBHOOK_SECRET, header: stale, rawBody: body })).toEqual({
      ok: false,
      reason: "timestamp_out_of_tolerance",
    });
    const tampered = `${body} `;
    expect(verifyDocusealSignature({ secret: WEBHOOK_SECRET, header: sign(body, WEBHOOK_SECRET), rawBody: tampered })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
    expect(verifyDocusealSignature({ secret: WEBHOOK_SECRET, header: sign(body, "another-key"), rawBody: body })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("verifies against raw bytes, which is why the route is registered before express.json()", () => {
    const raw = Buffer.from(body, "utf8");
    // A re-serialised body with different spacing must not verify.
    const reserialised = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyDocusealSignature({ secret: WEBHOOK_SECRET, header: sign(body, WEBHOOK_SECRET), rawBody: raw })).toEqual({
      ok: true,
    });
    expect(
      verifyDocusealSignature({ secret: WEBHOOK_SECRET, header: sign(body, WEBHOOK_SECRET), rawBody: reserialised }),
    ).toMatchObject({ ok: false });
  });
});
