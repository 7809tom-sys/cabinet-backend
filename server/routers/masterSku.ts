/**
 * Master SKU Alias Program Router
 *
 * Admin-only procedures for managing duplicate cabinet codes across suppliers.
 * The program maintains a `sku_master_aliases` table that maps secondary/alias
 * codes to a single canonical master code. An AI scan can generate merge
 * suggestions which admins then approve or dismiss.
 *
 * Procedures:
 *  - listSuggestions   — list AI-generated merge suggestions (filterable by status)
 *  - approveSuggestion — approve a suggestion → creates alias, handles conflicts
 *  - dismissSuggestion — mark a suggestion as a false positive
 *  - listAliases       — list all current alias→master mappings (searchable)
 *  - deleteAlias       — remove an alias mapping
 *  - listRules         — list matching rules with weight/enabled state
 *  - updateRule        — update a rule's weight or enabled state
 *  - triggerAiScan     — use LLM to compare catalog SKUs and generate new suggestions
 */
import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { adminProcedure, router } from "../_core/trpc";
import {
  cabinets,
  skuMasterAliases,
  skuMergeSuggestions,
  skuMatchingRules,
} from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize a SKU code for comparison: uppercase, strip hyphens/spaces */
function normalize(code: string): string {
  return code.toUpperCase().replace(/[-\s]/g, "");
}

/** Levenshtein distance between two strings (for similarity scoring) */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Convert edit distance to a 0-100 similarity score */
function editSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return Math.round((1 - dist / maxLen) * 100);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const masterSkuRouter = router({
  /**
   * List AI-generated merge suggestions, optionally filtered by status.
   */
  listSuggestions: adminProcedure
    .input(
      z.object({
        status: z.enum(["pending", "approved", "dismissed", "all"]).default("pending"),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };

      const conditions = [];
      if (input.status !== "all") {
        conditions.push(eq(skuMergeSuggestions.status, input.status));
      }

      const offset = (input.page - 1) * input.pageSize;

      const [rows, countResult] = await Promise.all([
        db
          .select()
          .from(skuMergeSuggestions)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(skuMergeSuggestions.similarityScore), desc(skuMergeSuggestions.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(skuMergeSuggestions)
          .where(conditions.length ? and(...conditions) : undefined),
      ]);

      return { rows, total: Number(countResult[0]?.count ?? 0) };
    }),

  /**
   * Approve a suggestion: create an alias record in sku_master_aliases.
   * If the aliasCode already exists as an alias pointing to a different master,
   * the older alias is marked conflictStatus='conflict' and the new one wins.
   */
  approveSuggestion: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const [suggestion] = await db
        .select()
        .from(skuMergeSuggestions)
        .where(eq(skuMergeSuggestions.id, input.id))
        .limit(1);

      if (!suggestion) throw new Error("Suggestion not found");
      if (suggestion.status !== "pending") throw new Error("Suggestion already reviewed");

      const { aliasCode, masterCode } = suggestion;

      // Check for existing alias with the same aliasCode
      const [existing] = await db
        .select()
        .from(skuMasterAliases)
        .where(eq(skuMasterAliases.aliasCode, aliasCode))
        .limit(1);

      if (existing) {
        if (existing.masterCode === masterCode) {
          // Alias already exists with the same master — just mark suggestion approved
        } else {
          // Conflict: mark the old alias as conflicted, then create the new one
          await db
            .update(skuMasterAliases)
            .set({ conflictStatus: "conflict" })
            .where(eq(skuMasterAliases.id, existing.id));

          await db.insert(skuMasterAliases).values({
            aliasCode,
            masterCode,
            notes: `Approved from AI suggestion #${input.id}`,
            conflictStatus: "conflict",
            createdBy: ctx.user.id,
          });
        }
      } else {
        // Clean insert
        await db.insert(skuMasterAliases).values({
          aliasCode,
          masterCode,
          notes: `Approved from AI suggestion #${input.id}`,
          conflictStatus: "ok",
          createdBy: ctx.user.id,
        });
      }

      // Mark suggestion as approved
      await db
        .update(skuMergeSuggestions)
        .set({
          status: "approved",
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(skuMergeSuggestions.id, input.id));

      return { ok: true };
    }),

  /**
   * Dismiss a suggestion as a false positive.
   */
  dismissSuggestion: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      await db
        .update(skuMergeSuggestions)
        .set({
          status: "dismissed",
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(skuMergeSuggestions.id, input.id));

      return { ok: true };
    }),

  /**
   * List all current alias→master mappings with optional search.
   */
  listAliases: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        conflictOnly: z.boolean().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };

      const conditions = [];
      if (input.search) {
        const like_ = `%${input.search}%`;
        conditions.push(
          or(
            like(skuMasterAliases.aliasCode, like_),
            like(skuMasterAliases.masterCode, like_)
          )
        );
      }
      if (input.conflictOnly) {
        conditions.push(eq(skuMasterAliases.conflictStatus, "conflict"));
      }

      const offset = (input.page - 1) * input.pageSize;

      const [rows, countResult] = await Promise.all([
        db
          .select()
          .from(skuMasterAliases)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(asc(skuMasterAliases.aliasCode))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(skuMasterAliases)
          .where(conditions.length ? and(...conditions) : undefined),
      ]);

      return { rows, total: Number(countResult[0]?.count ?? 0) };
    }),

  /**
   * Delete an alias mapping.
   */
  deleteAlias: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      await db
        .delete(skuMasterAliases)
        .where(eq(skuMasterAliases.id, input.id));

      return { ok: true };
    }),

  /**
   * List all matching rules.
   */
  listRules: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    return db
      .select()
      .from(skuMatchingRules)
      .orderBy(desc(skuMatchingRules.weight), asc(skuMatchingRules.ruleName));
  }),

  /**
   * Update a matching rule's weight or enabled state.
   */
  updateRule: adminProcedure
    .input(
      z.object({
        id: z.number(),
        weight: z.number().min(1).max(10).optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const update: Record<string, unknown> = {};
      if (input.weight !== undefined) update.weight = input.weight;
      if (input.enabled !== undefined) update.enabled = input.enabled;

      if (Object.keys(update).length === 0) return { ok: true };

      await db
        .update(skuMatchingRules)
        .set(update)
        .where(eq(skuMatchingRules.id, input.id));

      return { ok: true };
    }),

  /**
   * Trigger an AI-assisted scan of the cabinet catalog to find potential
   * duplicate SKU codes across suppliers. Generates new pending suggestions
   * in sku_merge_suggestions.
   *
   * Strategy:
   * 1. Load all cabinets with their alias columns (sku, vendorSku, altSku1-3)
   * 2. Run deterministic normalization checks (same as potentialMerges)
   * 3. For ambiguous pairs, ask the LLM to evaluate similarity and provide
   *    a human-readable reason
   * 4. Insert new suggestions (skip if already exists with same pair)
   */
  triggerAiScan: adminProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");

    // Load all cabinets
    const rows = await db
      .select({
        id: cabinets.id,
        masterCode: cabinets.masterCode,
        description: cabinets.description,
        category: cabinets.category,
        sku: cabinets.sku,
        vendorSku: cabinets.vendorSku,
        altSku1: cabinets.altSku1,
        altSku2: cabinets.altSku2,
        altSku3: cabinets.altSku3,
        showInCatalog: cabinets.showInCatalog,
        showInDesigner: cabinets.showInDesigner,
      })
      .from(cabinets)
      .orderBy(asc(cabinets.masterCode));

    // Load existing suggestions to avoid duplicates
    const existingSuggestions = await db
      .select({ aliasCode: skuMergeSuggestions.aliasCode, masterCode: skuMergeSuggestions.masterCode })
      .from(skuMergeSuggestions);

    const existingPairs = new Set(
      existingSuggestions.map((s) => `${s.aliasCode}|${s.masterCode}`)
    );

    // Load existing aliases to skip already-resolved pairs
    const existingAliases = await db
      .select({ aliasCode: skuMasterAliases.aliasCode })
      .from(skuMasterAliases);
    const resolvedAliases = new Set(existingAliases.map((a) => a.aliasCode));

    // Build normalized code map
    const byNorm = new Map<string, typeof rows[0][]>();
    for (const row of rows) {
      const norm = normalize(row.masterCode);
      if (!byNorm.has(norm)) byNorm.set(norm, []);
      byNorm.get(norm)!.push(row);
    }

    // Build alias owner map
    const aliasOwner = new Map<string, typeof rows[0]>();
    for (const row of rows) {
      for (const alias of [row.sku, row.vendorSku, row.altSku1, row.altSku2, row.altSku3]) {
        if (alias) aliasOwner.set(alias.toUpperCase(), row);
      }
    }

    type Candidate = {
      aliasCode: string;
      masterCode: string;
      score: number;
      reason: string;
    };

    const candidates: Candidate[] = [];
    const seen = new Set<string>();

    const addCandidate = (aliasCode: string, masterCode: string, score: number, reason: string) => {
      if (aliasCode === masterCode) return;
      if (resolvedAliases.has(aliasCode)) return;
      const pairKey = `${aliasCode}|${masterCode}`;
      if (seen.has(pairKey) || existingPairs.has(pairKey)) return;
      seen.add(pairKey);
      candidates.push({ aliasCode, masterCode, score, reason });
    };

    // 1. Normalized code collision (deterministic, high confidence)
    for (const group of Array.from(byNorm.values())) {
      if (group.length > 1) {
        for (let i = 0; i < group.length - 1; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const a = group[i];
            const b = group[j];
            // Use the one with the lower id as the master (oldest = canonical)
            const [master, alias] = a.id < b.id ? [a, b] : [b, a];
            addCandidate(
              alias.masterCode,
              master.masterCode,
              95,
              `Codes are identical when hyphens/spaces are removed (${normalize(a.masterCode)})`
            );
          }
        }
      }
    }

    // 2. One cabinet's masterCode appears in another's alias fields
    for (const row of rows) {
      const owner = aliasOwner.get(row.masterCode.toUpperCase());
      if (owner && owner.id !== row.id) {
        const [master, alias] = owner.id < row.id ? [owner, row] : [row, owner];
        addCandidate(
          alias.masterCode,
          master.masterCode,
          90,
          `"${alias.masterCode}" is already listed as an alias on ${master.masterCode}`
        );
      }
    }

    // 3. High edit-distance similarity (fuzzy match)
    const allCodes = rows.map((r) => r.masterCode);
    for (let i = 0; i < allCodes.length; i++) {
      for (let j = i + 1; j < allCodes.length; j++) {
        const normA = normalize(allCodes[i]);
        const normB = normalize(allCodes[j]);
        const score = editSimilarity(normA, normB);
        if (score >= 80 && score < 95) {
          const a = rows[i];
          const b = rows[j];
          const [master, alias] = a.id < b.id ? [a, b] : [b, a];
          addCandidate(
            alias.masterCode,
            master.masterCode,
            score,
            `Codes are ${score}% similar after normalization (${normA} vs ${normB})`
          );
        }
      }
    }

    // Cap at 50 candidates to keep LLM costs reasonable
    const topCandidates = candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);

    // 4. For medium-confidence candidates (score 80-90), ask the LLM to verify
    const mediumConfidence = topCandidates.filter((c) => c.score >= 80 && c.score < 90);

    if (mediumConfidence.length > 0) {
      try {
        const prompt = `You are a cabinet SKU deduplication expert. Review these potential duplicate cabinet codes and determine if they likely refer to the same physical cabinet sold under different codes by different suppliers.

For each pair, respond with whether it IS a duplicate (true/false) and a brief reason.

Pairs to evaluate:
${mediumConfidence
  .map(
    (c, i) =>
      `${i + 1}. aliasCode="${c.aliasCode}" vs masterCode="${c.masterCode}" (similarity: ${c.score}%)`
  )
  .join("\n")}

Return a JSON array with objects: { index: number, isDuplicate: boolean, reason: string, adjustedScore: number }`;

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "You are a cabinet product catalog expert. Analyze SKU codes and determine if they are duplicates. Always respond with valid JSON.",
            },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "sku_analysis",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        index: { type: "integer" },
                        isDuplicate: { type: "boolean" },
                        reason: { type: "string" },
                        adjustedScore: { type: "integer" },
                      },
                      required: ["index", "isDuplicate", "reason", "adjustedScore"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["results"],
                additionalProperties: false,
              },
            },
          },
        });

        const rawContent = response.choices?.[0]?.message?.content;
        const content = typeof rawContent === 'string' ? rawContent : null;
        if (content) {
          const parsed = JSON.parse(content) as {
            results: Array<{
              index: number;
              isDuplicate: boolean;
              reason: string;
              adjustedScore: number;
            }>;
          };

          for (const result of parsed.results) {
            const candidate = mediumConfidence[result.index - 1];
            if (candidate) {
              if (result.isDuplicate) {
                candidate.score = Math.max(candidate.score, result.adjustedScore);
                candidate.reason = result.reason;
              } else {
                // Remove false positives from the list
                const idx = topCandidates.indexOf(candidate);
                if (idx !== -1) topCandidates.splice(idx, 1);
              }
            }
          }
        }
      } catch (err) {
        // LLM failure is non-fatal — keep deterministic results
        console.error("[masterSku] LLM scan error:", err);
      }
    }

    // Insert new suggestions
    let inserted = 0;
    for (const c of topCandidates) {
      const pairKey = `${c.aliasCode}|${c.masterCode}`;
      if (existingPairs.has(pairKey)) continue;
      try {
        await db.insert(skuMergeSuggestions).values({
          aliasCode: c.aliasCode,
          masterCode: c.masterCode,
          similarityScore: c.score,
          reason: c.reason,
          status: "pending",
        });
        inserted++;
      } catch {
        // Skip duplicates (unique constraint violation)
      }
    }

    return { inserted, total: topCandidates.length };
  }),

  /**
   * Approve all pending suggestions in bulk (one click).
   * Skips any that are already reviewed. Handles conflicts the same way
   * as the single approveSuggestion procedure.
   */
  approveAll: adminProcedure
    .input(
      z.object({
        minScore: z.number().min(0).max(100).default(0),
      })
    )
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const pending = await db
        .select()
        .from(skuMergeSuggestions)
        .where(eq(skuMergeSuggestions.status, "pending"));

      let approved = 0;
      let skipped = 0;

      for (const suggestion of pending) {
        const { aliasCode, masterCode } = suggestion;

        // Check for existing alias with the same aliasCode
        const [existing] = await db
          .select()
          .from(skuMasterAliases)
          .where(eq(skuMasterAliases.aliasCode, aliasCode))
          .limit(1);

        if (existing) {
          if (existing.masterCode === masterCode) {
            // Already aliased correctly — just mark approved
          } else {
            // Conflict: mark old as conflicted, insert new
            await db
              .update(skuMasterAliases)
              .set({ conflictStatus: "conflict" })
              .where(eq(skuMasterAliases.id, existing.id));

            await db.insert(skuMasterAliases).values({
              aliasCode,
              masterCode,
              notes: `Bulk approved from AI suggestion #${suggestion.id}`,
              conflictStatus: "conflict",
              createdBy: ctx.user.id,
            });
          }
        } else {
          await db.insert(skuMasterAliases).values({
            aliasCode,
            masterCode,
            notes: `Bulk approved from AI suggestion #${suggestion.id}`,
            conflictStatus: "ok",
            createdBy: ctx.user.id,
          });
        }

        await db
          .update(skuMergeSuggestions)
          .set({
            status: "approved",
            reviewedBy: ctx.user.id,
            reviewedAt: new Date(),
          })
          .where(eq(skuMergeSuggestions.id, suggestion.id));

        approved++;
      }

      return { approved, skipped };
    }),

  /**
   * Get summary counts for the dashboard badge.
   */
  summaryCounts: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { pendingSuggestions: 0, totalAliases: 0, conflictAliases: 0 };

    const [pendingResult, aliasResult, conflictResult] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(skuMergeSuggestions)
        .where(eq(skuMergeSuggestions.status, "pending")),
      db.select({ count: sql<number>`COUNT(*)` }).from(skuMasterAliases),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(skuMasterAliases)
        .where(eq(skuMasterAliases.conflictStatus, "conflict")),
    ]);

    return {
      pendingSuggestions: Number(pendingResult[0]?.count ?? 0),
      totalAliases: Number(aliasResult[0]?.count ?? 0),
      conflictAliases: Number(conflictResult[0]?.count ?? 0),
    };
  }),
});
