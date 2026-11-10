/**
 * Locks salesperson features until Job Boarding is complete.
 *
 * Same shape as the affiliate onboarding gate: a pure decision plus a loader.
 * A missing table (the hand-run SQL has not been pasted) does not lock anyone,
 * so this code can deploy before Tom runs docs/sql/0273_salesperson_job_boarding.tidb.sql.
 * Once the table exists, a sales_rep with an unfinished packet is refused.
 */

import { TRPCError } from "@trpc/server";
import { evaluateJobBoarding, type JobBoardingProgress } from "@shared/jobBoarding";
import { loadFeatureGate } from "./jobBoardingStore";

export function salespersonFeaturesOpen(progress: JobBoardingProgress): boolean {
  return evaluateJobBoarding(progress).verified;
}

export async function assertSalespersonFeatures(user: { id: number; role: string }): Promise<void> {
  if (user.role !== "sales_rep") return;
  const gate = await loadFeatureGate(user.id);
  if (gate.schemaMissing || gate.verified) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Finish Job Boarding before using salesperson tools. Open Job Boarding to complete your information, the non-compete, the W-9, and your government ID.",
  });
}
