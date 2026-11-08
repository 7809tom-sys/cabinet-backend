/**
 * DocuSeal REST client and webhook signature verification.
 *
 * Endpoints used (all documented at https://www.docuseal.com/docs/api):
 *   POST /templates/pdf            build a template from our PDF bytes
 *   POST /submissions             create a submission, returns embed_src per signer
 *   GET  /submissions/{id}/documents  the signed PDF(s) once completed
 *
 * Calls go over `fetch` against the documented REST API with the X-Auth-Token
 * header. That is the same API the @docuseal/api SDK wraps, without pulling a
 * second HTTP stack into the server.
 *
 * Credentials:
 *   DOCUSEAL_API_KEY        required for every API call
 *   DOCUSEAL_API_URL        optional, defaults to https://api.docuseal.com
 *   DOCUSEAL_WEBHOOK_SECRET required to accept a webhook (a whsec_... value)
 *
 * The key and the secret are read here and nowhere else. No function in this
 * module returns either one, prints either one, or includes either one in an
 * error message: `redactDocusealSecrets` scrubs them out of anything a provider
 * error body might echo back.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { EsignatureNotConfiguredError, EsignatureProviderError } from "./esignatureProvider";

export const DOCUSEAL_DEFAULT_API_URL = "https://api.docuseal.com";

/** Replay tolerance for a webhook timestamp, in seconds. */
export const DOCUSEAL_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export type DocusealConfig = {
  apiKey: string;
  apiUrl: string;
  webhookSecret: string;
};

type Env = Record<string, string | undefined>;

function trimmed(value: string | undefined): string {
  return (value ?? "").trim();
}

/**
 * Reads the DocuSeal settings. Never throws and never logs: a caller checks
 * `apiKey` to decide between "not configured" and a real API call.
 */
export function docusealConfig(env: Env = process.env): DocusealConfig {
  const apiUrl = trimmed(env.DOCUSEAL_API_URL) || DOCUSEAL_DEFAULT_API_URL;
  return {
    apiKey: trimmed(env.DOCUSEAL_API_KEY),
    // A placeholder or a typo must not become a fetch target. Anything that is
    // not an http(s) URL falls back to the documented default.
    apiUrl: /^https?:\/\//i.test(apiUrl) ? apiUrl.replace(/\/+$/, "") : DOCUSEAL_DEFAULT_API_URL,
    webhookSecret: trimmed(env.DOCUSEAL_WEBHOOK_SECRET),
  };
}

export function isDocusealConfigured(env: Env = process.env): boolean {
  return docusealConfig(env).apiKey.length > 0;
}

export function isDocusealWebhookConfigured(env: Env = process.env): boolean {
  return docusealConfig(env).webhookSecret.length > 0;
}

/** Replaces any occurrence of the key or the secret in a string. */
export function redactDocusealSecrets(message: string, env: Env = process.env): string {
  const { apiKey, webhookSecret } = docusealConfig(env);
  let out = message;
  for (const secret of [apiKey, webhookSecret]) {
    if (secret.length >= 6) out = out.split(secret).join("[redacted]");
  }
  return out;
}

/**
 * Both errors are the seam's own types, so a router catches a DocuSeal failure
 * with the same `instanceof` it would use for any other provider.
 */
export class DocusealNotConfiguredError extends EsignatureNotConfiguredError {
  constructor() {
    super("DocuSeal not configured: set DOCUSEAL_API_KEY in the server environment.");
    this.name = "DocusealNotConfiguredError";
  }
}

export class DocusealRequestError extends EsignatureProviderError {
  constructor(message: string, status: number | null = null) {
    super(message, status);
    this.name = "DocusealRequestError";
  }
}

function url(base: string, path: string): string {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readErrorBody(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  return text.slice(0, 400);
}

export type DocusealSubmitter = {
  id: number;
  submission_id: number;
  uuid?: string;
  email: string | null;
  slug?: string;
  status?: string;
  name?: string | null;
  external_id?: string | null;
  embed_src?: string;
};

export type DocusealSubmissionDocument = {
  name: string;
  url: string;
};

export type DocusealClientOptions = {
  env?: Env;
  /** Injected in tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

/**
 * The smallest client we need. Every method throws DocusealNotConfiguredError
 * when there is no API key, so a router can answer "DocuSeal not configured"
 * with no fallback path.
 */
export function createDocusealClient(options: DocusealClientOptions = {}) {
  const env = options.env ?? process.env;
  const config = docusealConfig(env);
  const doFetch = options.fetchImpl ?? fetch;

  function requireKey(): DocusealConfig {
    if (!config.apiKey) throw new DocusealNotConfiguredError();
    return config;
  }

  async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const active = requireKey();
    let response: Response;
    try {
      response = await doFetch(url(active.apiUrl, path), {
        method,
        headers: {
          "X-Auth-Token": active.apiKey,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "network error";
      throw new DocusealRequestError(redactDocusealSecrets(`DocuSeal request failed: ${message}`, env));
    }
    if (!response.ok) {
      const detail = redactDocusealSecrets(await readErrorBody(response), env);
      throw new DocusealRequestError(`DocuSeal answered ${response.status}: ${detail || "no detail"}`, response.status);
    }
    if (response.status === 204) return {} as T;
    const text = await response.text();
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new DocusealRequestError("DocuSeal answered with a body that is not JSON.");
    }
  }

  return {
    isConfigured: config.apiKey.length > 0,

    /**
     * POST /submissions. Email delivery is always off: the affiliate signs in
     * our own embedded frame, so a provider email is never the only route to a
     * contract, and never needed at all.
     */
    async createSubmission(input: {
      templateId: number;
      signer: { name: string; email: string; externalId: string };
      completedRedirectUrl?: string | null;
      metadata?: Record<string, string>;
    }): Promise<{ submitters: DocusealSubmitter[] }> {
      const payload: Record<string, unknown> = {
        template_id: input.templateId,
        send_email: false,
        submitters: [
          {
            name: input.signer.name,
            email: input.signer.email,
            external_id: input.signer.externalId,
            ...(input.metadata ? { metadata: input.metadata } : {}),
            ...(input.completedRedirectUrl ? { completed_redirect_url: input.completedRedirectUrl } : {}),
          },
        ],
      };
      const result = await request<DocusealSubmitter[] | { submitters?: DocusealSubmitter[] }>(
        "POST",
        "/submissions",
        payload,
      );
      const submitters = Array.isArray(result) ? result : result?.submitters ?? [];
      if (!submitters.length) {
        throw new DocusealRequestError("DocuSeal did not return a submitter for the signing request.");
      }
      return { submitters };
    },

    /** GET /submissions/{id}/documents — the final signed files once completed. */
    async getSubmissionDocuments(submissionId: string): Promise<DocusealSubmissionDocument[]> {
      const result = await request<{ documents?: DocusealSubmissionDocument[] }>(
        "GET",
        `/submissions/${encodeURIComponent(submissionId)}/documents`,
      );
      return Array.isArray(result?.documents) ? result.documents.filter((doc) => doc && typeof doc.url === "string") : [];
    },

    /** GET /submitters/{id} — used to resume an open signing request. */
    async getSubmitter(submitterId: string): Promise<DocusealSubmitter | null> {
      const result = await request<DocusealSubmitter>("GET", `/submitters/${encodeURIComponent(submitterId)}`);
      return result && typeof result === "object" ? result : null;
    },

    /** POST /templates/pdf — a template built from our own PDF bytes. */
    async createTemplateFromPdf(input: { name: string; pdf: Buffer; externalId?: string }): Promise<{ templateId: number }> {
      const result = await request<{ id?: number }>("POST", "/templates/pdf", {
        name: input.name,
        ...(input.externalId ? { external_id: input.externalId } : {}),
        documents: [{ name: input.name, file: input.pdf.toString("base64") }],
      });
      if (!result?.id) throw new DocusealRequestError("DocuSeal did not return a template id.");
      return { templateId: result.id };
    },

    /**
     * Download a provider file (a signed document or the audit log) with the
     * API key. Used to copy evidence into our private bucket so it survives a
     * DocuSeal retention change or an account move.
     */
    async downloadFile(fileUrl: string): Promise<{ bytes: Buffer; contentType: string }> {
      const active = requireKey();
      let target: URL;
      try {
        target = new URL(fileUrl);
      } catch {
        throw new DocusealRequestError("DocuSeal returned a file URL that cannot be parsed.");
      }
      if (target.protocol !== "https:" && target.protocol !== "http:") {
        throw new DocusealRequestError("DocuSeal returned a file URL with an unsupported scheme.");
      }
      let response: Response;
      try {
        response = await doFetch(target.toString(), {
          headers: { "X-Auth-Token": active.apiKey },
          signal: AbortSignal.timeout(30_000),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "network error";
        throw new DocusealRequestError(redactDocusealSecrets(`DocuSeal file download failed: ${message}`, env));
      }
      if (!response.ok) {
        throw new DocusealRequestError(`DocuSeal file download answered ${response.status}.`, response.status);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      return { bytes, contentType: response.headers.get("content-type") || "application/pdf" };
    },
  };
}

export type DocusealClient = ReturnType<typeof createDocusealClient>;

/** The webhook request headers this module reads. */
export type DocusealSignatureHeaders = {
  signature: string | null | undefined;
};

export type DocusealSignatureFailure =
  | "missing_secret"
  | "missing_header"
  | "malformed_header"
  | "timestamp_out_of_tolerance"
  | "bad_signature";

export type DocusealSignatureResult = { ok: true } | { ok: false; reason: DocusealSignatureFailure };

function hmacHex(key: Buffer | string, payload: string): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

function equalsConstantTime(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verifies the `X-Docuseal-Signature` header: `[timestamp].[hex hmac]`, where
 * the MAC is HMAC-SHA256 over `${timestamp}.${rawBody}`.
 *
 * The secret is documented as a `whsec_...` value. DocuSeal does not say
 * whether the MAC key is that literal string or its base64 payload, so both
 * candidates are accepted: a wrong-but-plausible interpretation cannot let an
 * invalid signature through, it only decides which key matches.
 *
 * A missing secret fails closed. There is no "skip verification" mode, because
 * an unverified webhook is the one thing that could forge a signature record.
 */
export function verifyDocusealSignature(input: {
  secret: string | null | undefined;
  header: string | null | undefined;
  rawBody: Buffer | string | null | undefined;
  now?: number;
  toleranceSeconds?: number;
}): DocusealSignatureResult {
  const secret = (input.secret ?? "").trim();
  if (!secret) return { ok: false, reason: "missing_secret" };
  const header = (input.header ?? "").trim();
  if (!header) return { ok: false, reason: "missing_header" };

  const separator = header.indexOf(".");
  if (separator <= 0) return { ok: false, reason: "malformed_header" };
  const timestamp = header.slice(0, separator);
  const signature = header.slice(separator + 1).trim();
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || !signature) return { ok: false, reason: "malformed_header" };

  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  const tolerance = input.toleranceSeconds ?? DOCUSEAL_SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - sentAt) > tolerance) return { ok: false, reason: "timestamp_out_of_tolerance" };

  const raw = typeof input.rawBody === "string" ? Buffer.from(input.rawBody, "utf8") : input.rawBody;
  if (!raw || raw.length === 0) return { ok: false, reason: "malformed_header" };

  const candidates: (Buffer | string)[] = [secret];
  if (secret.startsWith("whsec_")) {
    try {
      const decoded = Buffer.from(secret.slice("whsec_".length), "base64");
      if (decoded.length > 0) candidates.push(decoded);
    } catch {
      // The literal form above is still tried.
    }
  }

  const expectedPayload = `${timestamp}.${raw.toString("utf8")}`;
  for (const key of candidates) {
    if (equalsConstantTime(hmacHex(key, expectedPayload), signature)) return { ok: true };
  }
  return { ok: false, reason: "bad_signature" };
}
