import { getTableName } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("../db", () => ({ getDb: getDbMock }));

import { assertSalespersonFeatures, salespersonFeaturesOpen } from "./salespersonOnboardingGate";

function dbWith(row: { informationCompletedAt?: Date | null } | null, extras?: {
  version?: boolean;
  signature?: boolean;
  w9?: boolean;
  identity?: boolean;
}) {
  const profile = row
    ? [{
      id: 1,
      userId: 7,
      informationCompletedAt: row.informationCompletedAt ?? null,
      verifiedAt: null,
    }]
    : [];
  return {
    select: () => ({
      from: (table: unknown) => {
        const name = getTableName(table as never);
        const rows = rowsFor(name, profile, extras);
        const chain = {
          where: () => chain,
          orderBy: () => chain,
          limit: async (count: number) => rows.slice(0, count),
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve(rows).then(resolve, reject),
        };
        return chain;
      },
    }),
  };
}

function rowsFor(
  name: string,
  profile: Array<Record<string, unknown>>,
  extras?: { version?: boolean; signature?: boolean; w9?: boolean; identity?: boolean },
) {
  if (name === "salesperson_onboarding") return profile;
  if (name === "salesperson_legal_documents") {
    return extras?.version ? [{ id: 3, slug: "salesperson-non-compete", currentVersionId: 9, termYears: 2 }] : [];
  }
  if (name === "salesperson_legal_document_versions") {
    return extras?.version ? [{ id: 9, documentId: 3, version: 1, termYears: 2, title: "Salesperson non-compete" }] : [];
  }
  if (name === "salesperson_legal_signatures") return extras?.signature ? [{ id: 1 }] : [];
  if (name === "salesperson_w9") return extras?.w9 ? [{ submittedAt: new Date() }] : [];
  if (name === "salesperson_identity_documents") return extras?.identity ? [{ id: 4 }] : [];
  return [];
}

describe("salesperson onboarding gate", () => {
  beforeEach(() => {
    getDbMock.mockReset();
  });

  it("treats the four steps as the only way through", () => {
    expect(salespersonFeaturesOpen({
      informationComplete: true,
      nonCompeteSigned: false,
      w9Submitted: true,
      identityUploaded: true,
    })).toBe(false);
    expect(salespersonFeaturesOpen({
      informationComplete: true,
      nonCompeteSigned: true,
      w9Submitted: true,
      identityUploaded: true,
    })).toBe(true);
  });

  it("locks a sales rep until the packet is complete and leaves every other role alone", async () => {
    getDbMock.mockResolvedValue(dbWith({ informationCompletedAt: new Date() }));
    await expect(assertSalespersonFeatures({ id: 7, role: "sales_rep" })).rejects.toThrow(/Job Boarding/);
    await expect(assertSalespersonFeatures({ id: 7, role: "designer" })).resolves.toBeUndefined();
    await expect(assertSalespersonFeatures({ id: 7, role: "admin" })).resolves.toBeUndefined();
  });

  it("opens salesperson tools once every step is recorded", async () => {
    getDbMock.mockResolvedValue(dbWith(
      { informationCompletedAt: new Date() },
      { version: true, signature: true, w9: true, identity: true },
    ));
    await expect(assertSalespersonFeatures({ id: 7, role: "sales_rep" })).resolves.toBeUndefined();
  });

  it("does not lock anyone when the Job Boarding tables have not been created yet", async () => {
    getDbMock.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              const error = new Error("Table 'cabinet_dealz.salesperson_onboarding' doesn't exist");
              (error as { code?: string }).code = "ER_NO_SUCH_TABLE";
              throw error;
            },
          }),
        }),
      }),
    });
    await expect(assertSalespersonFeatures({ id: 7, role: "sales_rep" })).resolves.toBeUndefined();
  });
});
