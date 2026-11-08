/**
 * DocuSeal implementation of EsignatureProvider.
 *
 * This file is the only place that knows DocuSeal is the provider. The routers
 * and the onboarding gate go through `getEsignatureProvider()`, so replacing
 * DocuSeal with BoldSign, Dropbox Sign, or a self-hosted clickwrap means
 * writing one more object with this shape and changing the factory below.
 */

import { createDocusealClient, docusealConfig, isDocusealConfigured, type DocusealClient } from "./docuseal";
import {
  EsignatureNotConfiguredError,
  EsignatureProviderError,
  type CreateSigningRequestInput,
  type CreateSigningRequestResult,
  type EsignatureProvider,
  type FetchSignedArtifactsInput,
  type SignedArtifact,
} from "./esignatureProvider";

function safeFilename(name: string, fallback: string): string {
  const cleaned = name.trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 120) : fallback;
}

export function createDocusealProvider(options: { client?: DocusealClient; env?: NodeJS.ProcessEnv } = {}): EsignatureProvider {
  const client = options.client ?? createDocusealClient({ env: options.env });

  return {
    name: "docuseal",

    async createSigningRequest(input: CreateSigningRequestInput): Promise<CreateSigningRequestResult> {
      const templateId = Number(input.templateId);
      if (!Number.isInteger(templateId) || templateId <= 0) {
        throw new EsignatureProviderError("This contract has no DocuSeal template yet.");
      }
      const { submitters } = await client.createSubmission({
        templateId,
        signer: {
          name: input.signer.name,
          email: input.signer.email,
          externalId: input.signer.externalId,
        },
        completedRedirectUrl: input.completedRedirectUrl ?? null,
        metadata: input.metadata,
      });
      // With one submitter DocuSeal answers one entry; match on our external id
      // first so a template with a second role cannot hand back the wrong one.
      const submitter =
        submitters.find((entry) => entry.external_id === input.signer.externalId) ?? submitters[0];
      if (!submitter || !submitter.embed_src) {
        throw new EsignatureProviderError("DocuSeal did not return an embedded signing URL.");
      }
      return {
        submissionId: String(submitter.submission_id ?? ""),
        submitterId: submitter.id != null ? String(submitter.id) : null,
        embedSrc: submitter.embed_src,
        status: submitter.status ?? "sent",
      };
    },

    async fetchSignedArtifacts(input: FetchSignedArtifactsInput): Promise<SignedArtifact[]> {
      const artifacts: SignedArtifact[] = [];
      const documents = await client.getSubmissionDocuments(input.submissionId);
      for (let index = 0; index < documents.length; index += 1) {
        const document = documents[index]!;
        const file = await client.downloadFile(document.url);
        const base = safeFilename(document.name, `signed-${input.submissionId}-${index + 1}`);
        artifacts.push({
          kind: "signed_pdf",
          filename: base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`,
          mimeType: file.contentType.startsWith("application/pdf") ? file.contentType : "application/pdf",
          bytes: file.bytes,
        });
      }
      // The audit trail is a separate file that DocuSeal exposes by URL. The
      // webhook payload usually carries it; the API's document list may not.
      if (input.auditLogUrl) {
        try {
          const audit = await client.downloadFile(input.auditLogUrl);
          artifacts.push({
            kind: "audit_log",
            filename: `audit-log-${safeFilename(input.submissionId, "submission")}.pdf`,
            mimeType: audit.contentType.startsWith("application/pdf") ? audit.contentType : "application/pdf",
            bytes: audit.bytes,
          });
        } catch (error) {
          // Evidence that could not be copied is reported to the caller, which
          // still keeps the provider URL on the signature row.
          throw new EsignatureProviderError(
            `DocuSeal audit log could not be downloaded: ${error instanceof Error ? error.message : "unknown error"}`,
          );
        }
      }
      return artifacts;
    },

    async createTemplateFromPdf(input: { name: string; pdf: Buffer; externalId?: string }) {
      const { templateId } = await client.createTemplateFromPdf(input);
      return { templateId: String(templateId) };
    },

    async resumeSigningRequest(input: { submissionId: string; submitterId: string | null }) {
      if (!input.submitterId) return null;
      const submitter = await client.getSubmitter(input.submitterId);
      if (!submitter || !submitter.embed_src) return null;
      // Only an open request can be resumed. A completed or declined signer has
      // no signing form to show, and the portal must not offer one.
      if (submitter.status && !["sent", "opened", "awaiting"].includes(submitter.status)) return null;
      return { embedSrc: submitter.embed_src };
    },
  };
}

let cached: EsignatureProvider | null = null;

/**
 * The one place the provider is chosen. A router never constructs a provider
 * itself, so this line is the whole swap.
 */
export function getEsignatureProvider(): EsignatureProvider {
  if (!cached) cached = createDocusealProvider();
  return cached;
}

/** Tests replace the provider and reset it afterwards. */
export function setEsignatureProvider(provider: EsignatureProvider | null): void {
  cached = provider;
}

/** True when the signing API key is present. Used for the "not configured" answer. */
export function esignatureConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return isDocusealConfigured(env);
}

export function esignatureWebhookConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return docusealConfig(env).webhookSecret.length > 0;
}

export { EsignatureNotConfiguredError, EsignatureProviderError };
