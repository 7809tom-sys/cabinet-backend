// Wires the outreach engine to the real database, mailer, AI and owner alerts.
// Only the scheduler and the public outreach routes call this.

import { getDb } from "../../db";
import { sendEmail } from "../../email";
import { ENV } from "../../_core/env";
import { invokeLLM } from "../../_core/llm";
import { notifyOwner } from "../../_core/notification";
import type { LlmInvoke } from "./ai";
import { readOutreachEnv } from "./config";
import { noteDesignStart, runOutreachTick, type OutreachDeps } from "./engine";
import { createOutreachStore } from "./store";
import { isMissingSchemaError } from "../orderSchemaGuard";

export const OUTREACH_LOG = "[Outreach]";

/** The configured AI, or null when no key is set (drafts then use the fixed templates). */
export function outreachLlm(): LlmInvoke | null {
  if (!ENV.geminiApiKey) return null;
  return (params) => invokeLLM(params as Parameters<typeof invokeLLM>[0]) as ReturnType<LlmInvoke>;
}

export async function buildOutreachDeps(): Promise<OutreachDeps | null> {
  const db = await getDb();
  if (!db) return null;
  return {
    store: createOutreachStore(db),
    env: readOutreachEnv(),
    sendEmail: (opts) => sendEmail(opts),
    llm: outreachLlm(),
    notifyOwner: (title, content) => notifyOwner({ title, content }),
  };
}

/** Scheduler entry. Returns immediately while OUTREACH_ENABLED is not "true". */
export async function runScheduledOutreach(): Promise<void> {
  if (!readOutreachEnv().envEnabled) return;
  const deps = await buildOutreachDeps();
  if (!deps) return;
  try {
    const report = await runOutreachTick(deps);
    if (report.ran && (report.drafted || report.sent || report.failed)) {
      console.log(OUTREACH_LOG, JSON.stringify(report));
    }
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.warn(`${OUTREACH_LOG} Outreach tables are missing; run docs/sql/0286 first.`);
      return;
    }
    throw error;
  }
}

/**
 * Hook for the designer's email gate. Fire-and-forget: it never throws and
 * never delays or changes the guest email form's response.
 */
export function recordOutreachDesignStart(email: string): void {
  if (!readOutreachEnv().envEnabled) return;
  void (async () => {
    const deps = await buildOutreachDeps();
    if (deps) await noteDesignStart(deps, email);
  })().catch((error) => {
    if (!isMissingSchemaError(error)) console.warn(`${OUTREACH_LOG} design-start signal failed`, error instanceof Error ? error.name : "unknown");
  });
}
