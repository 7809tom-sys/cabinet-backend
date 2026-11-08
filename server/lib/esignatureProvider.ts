/**
 * The e-signature provider seam.
 *
 * The legal-contract tables, the onboarding gate, and the routers know nothing
 * about DocuSeal beyond this interface. Swapping to BoldSign, Dropbox Sign, or
 * the (earlier) self-hosted clickwrap means implementing this interface and
 * changing one factory line in `server/lib/esignatureProvider.ts`; no table, no
 * procedure signature, and no gate rule changes.
 *
 * Nothing here reads or prints credentials. The concrete provider holds the API
 * key in a closure and every error message is redacted before it can reach a
 * log line, an HTTP response, or the client.
 */

/** A signer a submission is created for. `externalId` is echoed back on webhooks. */
export type EsignSigner = {
  name: string;
  email: string;
  /** Our own identifier for (affiliate, document version); never shown to a signer. */
  externalId: string;
};

export type CreateSigningRequestInput = {
  /** Provider-side template built from the exact document version being signed. */
  templateId: string | number;
  signer: EsignSigner;
  /** Where the provider should send the signer when they finish (optional). */
  completedRedirectUrl?: string | null;
  /** Free-form values shown in the provider dashboard, never secret. */
  metadata?: Record<string, string>;
};

export type CreateSigningRequestResult = {
  /** Provider submission id, stored on the signing session. */
  submissionId: string;
  /** Provider submitter id for our signer, stored on the signing session. */
  submitterId: string | null;
  /** URL the frontend embeds (DocuSeal `<DocusealForm src=...>`) or opens. */
  embedSrc: string;
  /** Provider-native status at creation time. */
  status: string;
};

/** One file the provider produced for a completed submission: the signed PDF, the audit log. */
export type SignedArtifact = {
  kind: "signed_pdf" | "audit_log" | "combined_pdf";
  filename: string;
  mimeType: string;
  bytes: Buffer;
};

export type FetchSignedArtifactsInput = {
  submissionId: string;
  /** Provider's audit-log URL from the webhook payload, used when the API omits it. */
  auditLogUrl?: string | null;
};

export interface EsignatureProvider {
  /** Stable name stored on every signature row: "docuseal" today. */
  readonly name: "docuseal";

  /**
   * Create a signing request and return the embedded signing URL. Email
   * delivery is always disabled: the affiliate signs inside our portal, so a
   * stray provider email can never become the only path to a contract.
   */
  createSigningRequest(input: CreateSigningRequestInput): Promise<CreateSigningRequestResult>;

  /**
   * Re-fetch the embedded URL for a signing request that is still open, so a
   * reload of the portal resumes the same DocuSeal submission instead of
   * creating a duplicate one. Returns null when the provider no longer offers
   * the request (completed, expired, archived).
   */
  resumeSigningRequest(input: { submissionId: string; submitterId: string | null }): Promise<{ embedSrc: string } | null>;

  /**
   * Download the signed PDF and the audit trail for a completed submission.
   * Returns whatever the provider could produce; a partial result is valid
   * evidence, because the webhook payload already carried the audit-log URL.
   */
  fetchSignedArtifacts(input: FetchSignedArtifactsInput): Promise<SignedArtifact[]>;

  /**
   * Create a provider template from our document bytes. Used by the admin
   * "build template" action so an admin does not have to upload the contract
   * to DocuSeal by hand. Returns the provider template id to store.
   */
  createTemplateFromPdf(input: { name: string; pdf: Buffer; externalId?: string }): Promise<{ templateId: string }>;
}

/**
 * Thrown when DocuSeal credentials are absent. Routers turn this into a clear
 * "DocuSeal not configured" answer; there is deliberately no fallback signing
 * path, so a missing key can never look like a successful signature.
 */
export class EsignatureNotConfiguredError extends Error {
  constructor(message = "DocuSeal not configured: set DOCUSEAL_API_KEY (and DOCUSEAL_WEBHOOK_SECRET) in the server environment.") {
    super(message);
    this.name = "EsignatureNotConfiguredError";
  }
}

/** Thrown when the provider answered with an error or an unusable body. */
export class EsignatureProviderError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "EsignatureProviderError";
    this.status = status;
  }
}
