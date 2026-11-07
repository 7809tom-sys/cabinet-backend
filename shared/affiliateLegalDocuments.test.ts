/**
 * The contract-level rules, with no database and no provider.
 *
 * These pin the parts that must not drift: the onboarding gate's definition of
 * "signed", the immutable-version consequence (a new version un-signs the
 * contract), and the signer tag DocuSeal echoes back on a webhook.
 */
import { describe, expect, it } from "vitest";
import {
  LEGAL_SIGNING_CONSENT_TEXT,
  buildLegalSignerExternalId,
  canStartSigning,
  legalDocumentGate,
  parseLegalSignerExternalId,
  signerNamesMatch,
  type LegalDocumentGateRow,
} from "./affiliateLegalDocuments";

const versionId = 101;

function row(overrides: Partial<LegalDocumentGateRow> = {}): LegalDocumentGateRow {
  return {
    documentId: 1,
    slug: "affiliate-agreement",
    title: "Affiliate Agreement",
    isActive: true,
    requiredForMembership: true,
    currentVersionId: versionId,
    currentVersionNumber: 1,
    signedAt: null,
    sessionStatus: null,
    ...overrides,
  };
}

describe("legal document gate", () => {
  it("passes only when every required contract is signed", () => {
    const unsigned = legalDocumentGate([row()]);
    expect(unsigned.signedAll).toBe(false);
    expect(unsigned.pending.map((entry) => entry.status)).toEqual(["unsigned"]);

    const signed = legalDocumentGate([row({ signedAt: new Date("2026-11-01T12:00:00Z") })]);
    expect(signed.signedAll).toBe(true);
    expect(signed.pending).toEqual([]);
    expect(signed.documents[0]?.signedAt).toBe("2026-11-01T12:00:00.000Z");
  });

  it("does not require a contract that is inactive or not required for membership", () => {
    expect(legalDocumentGate([row({ isActive: false })]).signedAll).toBe(true);
    expect(legalDocumentGate([row({ requiredForMembership: false })]).signedAll).toBe(true);
    // An inactive document reports not_required even when it is marked required.
    expect(legalDocumentGate([row({ isActive: false }) ]).documents[0]?.status).toBe("not_required");
  });

  it("treats a signed contract whose next version was published as unsigned again", () => {
    // The signature is on the old version, so currentVersionId has moved on and
    // signedAt is null for the new one. This is the whole point of versions.
    const gate = legalDocumentGate([row({ currentVersionId: 202, currentVersionNumber: 2, signedAt: null })]);
    expect(gate.signedAll).toBe(false);
    expect(gate.pending[0]?.currentVersionNumber).toBe(2);
  });

  it("reports a required contract with no published version as unpublished, not as passing", () => {
    const gate = legalDocumentGate([row({ currentVersionId: null, currentVersionNumber: null })]);
    expect(gate.signedAll).toBe(false);
    expect(gate.unpublished).toHaveLength(1);
    expect(gate.pending).toEqual([]);
    expect(gate.unpublished[0]?.status).toBe("unpublished");
  });

  it("distinguishes in progress from declined and from never started", () => {
    expect(legalDocumentGate([row({ sessionStatus: "pending" })]).documents[0]?.status).toBe("in_progress");
    expect(legalDocumentGate([row({ sessionStatus: "declined" })]).documents[0]?.status).toBe("declined");
    expect(legalDocumentGate([row({ sessionStatus: "expired" })]).documents[0]?.status).toBe("declined");
    expect(legalDocumentGate([row({ sessionStatus: "completed" })]).documents[0]?.status).toBe("unsigned");
  });

  it("lets a signature outrank a stale session status", () => {
    const gate = legalDocumentGate([row({ signedAt: new Date("2026-11-02T00:00:00Z"), sessionStatus: "pending" })]);
    expect(gate.signedAll).toBe(true);
    expect(gate.documents[0]?.status).toBe("signed");
  });

  it("blocks on one unsigned contract among several signed ones", () => {
    const gate = legalDocumentGate([
      row({ documentId: 1, signedAt: new Date("2026-11-01T00:00:00Z") }),
      row({ documentId: 2, slug: "non-compete", title: "Non-Compete", currentVersionId: 303 }),
    ]);
    expect(gate.signedAll).toBe(false);
    expect(gate.pending.map((entry) => entry.documentId)).toEqual([2]);
  });
});

describe("DocuSeal signer tag", () => {
  it("round-trips the affiliate and document version", () => {
    const externalId = buildLegalSignerExternalId({ affiliateId: 42, documentVersionId: 907 });
    expect(externalId).toBe("cd-legal:a42:v907");
    expect(parseLegalSignerExternalId(externalId)).toEqual({ affiliateId: 42, documentVersionId: 907 });
  });

  it("rejects anything it did not build, so a stray signer is never attributed", () => {
    for (const value of ["", "42:907", "cd-legal:a0:v1", "cd-legal:a42", "a42:v907", null, undefined, 42]) {
      expect(parseLegalSignerExternalId(value)).toBeNull();
    }
  });
});

describe("starting a signing request", () => {
  const ready = {
    isActive: true,
    requiredForMembership: true,
    currentVersionId: versionId,
    alreadySigned: false,
    templateId: 555,
  };

  it("allows a published, unsiged contract that has a DocuSeal template", () => {
    expect(canStartSigning(ready)).toEqual({ ok: true });
  });

  it("refuses an inactive, unpublished, already signed, or template-less contract", () => {
    expect(canStartSigning({ ...ready, isActive: false })).toMatchObject({ ok: false });
    expect(canStartSigning({ ...ready, currentVersionId: null })).toMatchObject({ ok: false });
    expect(canStartSigning({ ...ready, alreadySigned: true })).toMatchObject({ ok: false });
    const noTemplate = canStartSigning({ ...ready, templateId: null });
    expect(noTemplate.ok).toBe(false);
    expect(noTemplate.ok === false ? noTemplate.reason : "").toMatch(/not ready for signing/);
  });
});

describe("signer name matching", () => {
  it("normalises spacing and case but never matches an empty name", () => {
    expect(signerNamesMatch("  Ada  Lovelace ", "ada lovelace")).toBe(true);
    expect(signerNamesMatch("Ada Lovelace", "Ada Byron")).toBe(false);
    expect(signerNamesMatch("", "")).toBe(false);
    expect(signerNamesMatch(null, "Ada")).toBe(false);
  });
});

describe("consent copy", () => {
  it("names ESIGN and UETA, because the record is only as good as the consent shown", () => {
    expect(LEGAL_SIGNING_CONSENT_TEXT).toMatch(/ESIGN/);
    expect(LEGAL_SIGNING_CONSENT_TEXT).toMatch(/UETA/);
    expect(LEGAL_SIGNING_CONSENT_TEXT).toMatch(/electronically/);
  });
});
