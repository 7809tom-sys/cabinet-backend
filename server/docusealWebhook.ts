/**
 * DocuSeal webhook: the only path that creates a signature record.
 *
 * Registered BEFORE express.json(), exactly like the Stripe and vendor-mail
 * webhooks, because the HMAC covers the exact bytes DocuSeal sent. A parsed and
 * re-serialised body would never verify.
 *
 * Flow for one completed form:
 *   1. verify X-Docuseal-Signature against DOCUSEAL_WEBHOOK_SECRET
 *   2. read the affiliate + document version from the submitter's external_id
 *      (recorded when the signing request was created), never from the payload
 *   3. write the append-only signature row
 *   4. copy DocuSeal's signed PDF and audit log into our private bucket
 *
 * Idempotency: a retried event returns 200 with `duplicate: true`. The storage
 * copy still runs for a duplicate that has no stored copy yet, so a webhook that
 * arrived before a transient storage failure can complete later.
 *
 * Nothing is logged from the payload except ids and event type: a webhook body
 * contains a signer's name, email, and IP address.
 */

import type { Express, Request, Response } from "express";
import express from "express";
import { getDb } from "./db";
import {
  docusealConfig,
  redactDocusealSecrets,
  verifyDocusealSignature,
} from "./lib/docuseal";
import { getEsignatureProvider } from "./lib/docusealProvider";
import {
  completeSessionsForSubmission,
  markSessionStatus,
  recordSignature,
  storeSignatureArtifacts,
} from "./lib/affiliateLegalContracts";
import {
  affiliateLegalDocuments,
  affiliateLegalDocumentVersions,
  affiliateLegalSignatures,
} from "../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { parseLegalSignerExternalId } from "@shared/affiliateLegalDocuments";
import { parseJobBoardingSignerExternalId, SALESPERSON_LEGAL_SIGNATURE_PREFIX } from "@shared/jobBoarding";
import {
  attachSignatureFiles,
  markSalespersonSessionStatus,
  recordSalespersonSignature,
} from "./lib/jobBoardingStore";
import { storagePut } from "./storage";

const LOG = "[DocuSeal Webhook]";

/** The webhook events this endpoint acts on. Everything else is acknowledged and ignored. */
export const DOCUSEAL_HANDLED_EVENTS = [
  "form.completed",
  "submission.completed",
  "form.declined",
  "submission.expired",
] as const;

export type DocusealWebhookEventType = (typeof DOCUSEAL_HANDLED_EVENTS)[number];

export type DocusealWebhookPayload = {
  event_type?: string;
  timestamp?: string;
  data?: {
    id?: number;
    email?: string | null;
    name?: string | null;
    ip?: string | null;
    ua?: string | null;
    role?: string | null;
    status?: string | null;
    external_id?: string | null;
    completed_at?: string | null;
    declined_at?: string | null;
    audit_log_url?: string | null;
    submission?: {
      id?: number;
      audit_log_url?: string | null;
      combined_document_url?: string | null;
      status?: string | null;
    };
    submitters?: Array<{
      id?: number;
      email?: string | null;
      name?: string | null;
      ip?: string | null;
      ua?: string | null;
      status?: string | null;
      external_id?: string | null;
      completed_at?: string | null;
      audit_log_url?: string | null;
    }>;
    template?: { id?: number | null };
  };
};

function header(req: Request, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

function asDate(value: string | null | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

/** A stable event id for the duplicate guard, since DocuSeal sends no event id. */
export function docusealEventKey(payload: DocusealWebhookPayload): string | null {
  const kind = payload.event_type;
  if (!kind) return null;
  const submissionId = payload.data?.submission?.id ?? null;
  const submitterId = payload.data?.id ?? null;
  if (kind === "form.completed" || kind === "form.declined") {
    return submitterId != null ? `${kind}:submitter:${submitterId}` : null;
  }
  if (kind === "submission.completed" || kind === "submission.expired") {
    return submissionId != null ? `${kind}:submission:${submissionId}` : null;
  }
  return null;
}

/**
 * The signer this event describes. A `form.*` event carries the one submitter;
 * a `submission.*` event carries all of them and the relevant one is matched by
 * our external id.
 */
function signersForEvent(payload: DocusealWebhookPayload) {
  const data = payload.data;
  if (!data) return [];
  const isSubmissionLevel = payload.event_type?.startsWith("submission.");
  const list = isSubmissionLevel ? data.submitters ?? [] : [data];
  return list
    .map((entry) => {
      const parsed = parseLegalSignerExternalId(entry.external_id);
      if (!parsed) return null;
      return {
        affiliateId: parsed.affiliateId,
        documentVersionId: parsed.documentVersionId,
        submitterId: entry.id != null ? String(entry.id) : null,
        name: (entry.name ?? "").trim() || null,
        email: (entry.email ?? "").trim() || null,
        ip: (entry.ip ?? "").trim() || null,
        userAgent: (entry.ua ?? "").trim().slice(0, 512) || null,
        completedAt: entry.completed_at ?? null,
        auditLogUrl: entry.audit_log_url ?? data.submission?.audit_log_url ?? data.audit_log_url ?? null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

function jobBoardingSignersForEvent(payload: DocusealWebhookPayload) {
  const data = payload.data;
  if (!data) return [];
  const isSubmissionLevel = payload.event_type?.startsWith("submission.");
  const list = isSubmissionLevel ? data.submitters ?? [] : [data];
  return list
    .map((entry) => {
      const parsed = parseJobBoardingSignerExternalId(entry.external_id);
      if (!parsed) return null;
      return {
        userId: parsed.userId,
        documentVersionId: parsed.documentVersionId,
        submitterId: entry.id != null ? String(entry.id) : null,
        name: (entry.name ?? "").trim() || null,
        email: (entry.email ?? "").trim() || null,
        completedAt: entry.completed_at ?? null,
        auditLogUrl: entry.audit_log_url ?? data.submission?.audit_log_url ?? data.audit_log_url ?? null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

type WebhookDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function markSalespersonSessionQuietly(
  db: WebhookDb,
  submissionId: string,
  status: "declined" | "expired",
) {
  try {
    await markSalespersonSessionStatus(db, submissionId, status);
  } catch (error) {
    console.error(
      `${LOG} salesperson session was not updated:`,
      error instanceof Error ? error.message : "unknown error",
    );
  }
}

async function recordJobBoardingCompletions(
  db: WebhookDb,
  payload: DocusealWebhookPayload,
  signers: ReturnType<typeof jobBoardingSignersForEvent>,
) {
  const submissionId = payload.data?.submission?.id != null ? String(payload.data.submission.id) : "";
  const eventKey = docusealEventKey(payload);
  for (const signer of signers) {
    const recorded = await recordSalespersonSignature(db, {
      userId: signer.userId,
      documentVersionId: signer.documentVersionId,
      providerSubmissionId: submissionId,
      providerSubmitterId: signer.submitterId,
      providerEventId: eventKey,
      signerName: signer.name,
      signerEmail: signer.email,
      completedAt: asDate(signer.completedAt, new Date()),
    });
    if (!recorded.ok) {
      console.error(`${LOG} salesperson signature was not recorded: ${recorded.reason}`);
      continue;
    }
    if (!submissionId) continue;
    try {
      const artifacts = await getEsignatureProvider().fetchSignedArtifacts({
        submissionId,
        auditLogUrl: signer.auditLogUrl,
      });
      const files: { signedPdfKey?: string; auditLogKey?: string } = {};
      for (const artifact of artifacts) {
        const stored = await storagePut(
          `${SALESPERSON_LEGAL_SIGNATURE_PREFIX}${signer.userId}/${artifact.kind}.pdf`,
          artifact.bytes,
          artifact.mimeType,
        );
        if (!stored.key.startsWith(SALESPERSON_LEGAL_SIGNATURE_PREFIX)) continue;
        if (artifact.kind === "audit_log") files.auditLogKey = stored.key;
        else files.signedPdfKey = stored.key;
      }
      if (files.signedPdfKey || files.auditLogKey) {
        await attachSignatureFiles(db, recorded.signatureId, files);
      }
    } catch (error) {
      console.error(
        `${LOG} salesperson signed copy was not stored:`,
        error instanceof Error ? error.message : "unknown error",
      );
    }
  }
}

export function registerDocusealWebhook(app: Express): void {
  app.post(
    "/api/docuseal/webhook",
    express.raw({ type: "*/*", limit: "5mb" }),
    async (req: Request, res: Response) => {
      const config = docusealConfig();
      if (!config.webhookSecret) {
        // Fail closed. An endpoint without a secret would accept forged signatures.
        console.error(`${LOG} DOCUSEAL_WEBHOOK_SECRET is not set, so every webhook is refused.`);
        res.status(503).json({ error: "DocuSeal webhook is not configured." });
        return;
      }

      const raw = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(typeof req.body === "string" ? req.body : "");
      const verification = verifyDocusealSignature({
        secret: config.webhookSecret,
        header: header(req, "x-docuseal-signature"),
        rawBody: raw,
      });
      if (!verification.ok) {
        if (verification.reason !== "missing_header") {
          console.error(`${LOG} Refused a webhook: ${verification.reason}.`);
        }
        res.status(401).json({ error: "Invalid signature." });
        return;
      }

      let payload: DocusealWebhookPayload;
      try {
        payload = JSON.parse(raw.toString("utf8")) as DocusealWebhookPayload;
      } catch {
        res.status(400).json({ error: "Body is not valid JSON." });
        return;
      }

      const eventType = payload.event_type ?? "";
      if (!(DOCUSEAL_HANDLED_EVENTS as readonly string[]).includes(eventType)) {
        // Acknowledged so DocuSeal stops retrying, deliberately not stored.
        res.json({ received: true, handled: false, eventType });
        return;
      }

      const db = await getDb();
      if (!db) {
        res.status(503).json({ error: "Database not available." });
        return;
      }

      const submissionId = payload.data?.submission?.id != null ? String(payload.data.submission.id) : null;
      console.log(`${LOG} ${eventType} submission=${submissionId ?? "unknown"}`);

      if (eventType === "form.declined") {
        if (submissionId) {
          await markSessionStatus(db, submissionId, "declined");
          await markSalespersonSessionQuietly(db, submissionId, "declined");
        }
        res.json({ received: true, handled: true, eventType });
        return;
      }
      if (eventType === "submission.expired") {
        if (submissionId) {
          await markSessionStatus(db, submissionId, "expired");
          await markSalespersonSessionQuietly(db, submissionId, "expired");
        }
        res.json({ received: true, handled: true, eventType });
        return;
      }

      const jobSigners = jobBoardingSignersForEvent(payload);
      if ((eventType === "form.completed" || eventType === "submission.completed") && jobSigners.length) {
        await recordJobBoardingCompletions(db, payload, jobSigners);
      }

      const signers = signersForEvent(payload);
      if (!signers.length) {
        if (jobSigners.length) {
          res.json({ received: true, handled: true, eventType });
          return;
        }
        // A completion with no recognisable external id is not ours to record.
        // 200 so DocuSeal stops retrying: retrying cannot add the missing tag.
        console.error(`${LOG} ${eventType} carried no cd-legal external_id; nothing recorded.`);
        res.json({ received: true, handled: false, reason: "unrecognised_signer" });
        return;
      }

      const eventKey = docusealEventKey(payload);
      const results: Array<{ documentVersionId: number; duplicate: boolean; storageComplete: boolean }> = [];

      for (const signer of signers) {
        const [version] = await db
          .select({
            id: affiliateLegalDocumentVersions.id,
            documentId: affiliateLegalDocumentVersions.documentId,
            docusealTemplateId: affiliateLegalDocumentVersions.docusealTemplateId,
          })
          .from(affiliateLegalDocumentVersions)
          .where(eq(affiliateLegalDocumentVersions.id, signer.documentVersionId))
          .limit(1);
        if (!version) {
          console.error(`${LOG} Unknown document version ${signer.documentVersionId}; skipped.`);
          continue;
        }

        const recorded = await recordSignature(db, {
          affiliateId: signer.affiliateId,
          userId: null,
          documentId: version.documentId,
          documentVersionId: version.id,
          provider: "docuseal",
          providerSubmissionId: submissionId ?? "",
          providerSubmitterId: signer.submitterId,
          // Only one signature row may own a given event key.
          providerEventId: eventKey,
          signerName: signer.name,
          signerEmail: signer.email,
          signerIp: signer.ip,
          signerUserAgent: signer.userAgent,
          providerAuditLogUrl: signer.auditLogUrl,
          completedAt: asDate(signer.completedAt, new Date()),
        });
        if (!recorded.ok) {
          console.error(`${LOG} Signature for version ${signer.documentVersionId} was not recorded: ${recorded.reason}`);
          continue;
        }

        // The signature row exists from here on, whatever happens to storage.
        let storageComplete = false;
        const [existingRow] = await db
          .select({
            signedPdfKey: affiliateLegalSignatures.signedPdfKey,
            auditLogKey: affiliateLegalSignatures.auditLogKey,
          })
          .from(affiliateLegalSignatures)
          .where(eq(affiliateLegalSignatures.id, recorded.signatureId))
          .limit(1);
        storageComplete = Boolean(existingRow?.signedPdfKey);

        if (!storageComplete && submissionId) {
          try {
            const artifacts = await getEsignatureProvider().fetchSignedArtifacts({
              submissionId,
              auditLogUrl: signer.auditLogUrl,
            });
            const signedPdf = artifacts.find((artifact) => artifact.kind === "signed_pdf") ?? null;
            const auditLog = artifacts.find((artifact) => artifact.kind === "audit_log") ?? null;
            const stored = await storeSignatureArtifacts(db, {
              signatureId: recorded.signatureId,
              affiliateId: signer.affiliateId,
              documentVersionId: signer.documentVersionId,
              signedPdf: signedPdf
                ? { bytes: signedPdf.bytes, mimeType: signedPdf.mimeType, filename: signedPdf.filename }
                : null,
              auditLog: auditLog
                ? { bytes: auditLog.bytes, mimeType: auditLog.mimeType, filename: auditLog.filename }
                : null,
            });
            storageComplete = Boolean(stored.signedPdfKey);
            if (!storageComplete) {
              console.error(`${LOG} No signed PDF was available for submission ${submissionId}.`);
            }
          } catch (error) {
            // Answering 500 makes DocuSeal retry, and the retry re-attempts the
            // copy without writing a second signature.
            console.error(
              `${LOG} Evidence copy failed for submission ${submissionId}:`,
              redactDocusealSecrets(error instanceof Error ? error.message : "unknown error"),
            );
            res.status(500).json({ error: "The signed copy could not be stored yet." });
            return;
          }
        }

        results.push({
          documentVersionId: signer.documentVersionId,
          duplicate: recorded.duplicate,
          storageComplete,
        });
      }

      // The signature is stored, so the session is closed. This runs after the
      // insert: a failure here cannot lose a signature that already exists.
      if (submissionId) await completeSessionsForSubmission(db, submissionId);

      res.json({ received: true, handled: true, eventType, signatures: results });
    },
  );
}

/**
 * Test seam: the document a webhook just signed, so a test can assert without a
 * database round-trip through a Drizzle select.
 */
export async function findSignatureForDocumentVersion(
  affiliateId: number,
  documentVersionId: number,
): Promise<typeof affiliateLegalSignatures.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(affiliateLegalSignatures)
    .where(
      and(
        eq(affiliateLegalSignatures.affiliateId, affiliateId),
        eq(affiliateLegalSignatures.documentVersionId, documentVersionId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Kept for callers that need to resolve a document by its slug. */
export async function findLegalDocumentBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(affiliateLegalDocuments)
    .where(eq(affiliateLegalDocuments.slug, slug))
    .limit(1);
  return row ?? null;
}
