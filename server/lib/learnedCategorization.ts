/**
 * Learned Categorization Rules
 * 
 * When an admin recategorizes an item in the admin panel, we learn the pattern
 * and apply it to future uploads. These rules have the highest priority and
 * can never be overridden by default categorization logic.
 */

import { getDb } from "../db";
import { categorizationRules, cabinets } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export interface LearnedRule {
  patternType: "code_prefix" | "code_contains" | "exact_code" | "dimensions";
  pattern: string;
  targetCategory: string;
  confidence: number;
}

/**
 * Extract a pattern from a cabinet code and its new category.
 * Returns possible patterns that could be learned.
 */
export function extractPattern(code: string, newCategory: string): LearnedRule[] {
  const patterns: LearnedRule[] = [];
  const codeUpper = (code || "").toUpperCase();

  // Always learn the exact code (highest confidence)
  patterns.push({
    patternType: "exact_code",
    pattern: codeUpper,
    targetCategory: newCategory,
    confidence: 100,
  });

  // Learn code prefix (first letter)
  if (codeUpper.length > 0) {
    patterns.push({
      patternType: "code_prefix",
      pattern: codeUpper[0],
      targetCategory: newCategory,
      confidence: 50,
    });
  }

  // Learn common keywords in code
  const keywords = ["MOLDING", "TRIM", "TOE", "COLD", "PROM", "CMA", "CORBEL", "KNEE", "SGH", "SPICE"];
  for (const keyword of keywords) {
    if (codeUpper.includes(keyword)) {
      patterns.push({
        patternType: "code_contains",
        pattern: keyword,
        targetCategory: newCategory,
        confidence: 75,
      });
    }
  }

  return patterns;
}

/**
 * Record that an admin recategorized an item, and learn from it.
 * This creates or updates learned rules based on the change.
 */
export async function recordCategoryChange(
  cabinetId: number,
  oldCategory: string,
  newCategory: string,
  adminUserId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Get the cabinet to extract its code
  const [cabinet] = await db
    .select({ masterCode: cabinets.masterCode })
    .from(cabinets)
    .where(eq(cabinets.id, cabinetId))
    .limit(1);

  if (!cabinet) return;

  // Extract patterns from this change
  const patterns = extractPattern(cabinet.masterCode, newCategory);

  // Store or update each pattern
  for (const pattern of patterns) {
    // Check if this rule already exists
    const [existing] = await db
      .select({ id: categorizationRules.id, confidence: categorizationRules.confidence })
      .from(categorizationRules)
      .where(
        and(
          eq(categorizationRules.patternType, pattern.patternType),
          eq(categorizationRules.pattern, pattern.pattern),
          eq(categorizationRules.targetCategory, pattern.targetCategory)
        )
      )
      .limit(1);

    if (existing) {
      // Increase confidence if we see the same pattern again
      await db
        .update(categorizationRules)
        .set({
          confidence: existing.confidence + 10,
          updatedAt: new Date(),
        })
        .where(eq(categorizationRules.id, existing.id));
    } else {
      // Create new rule
      await db.insert(categorizationRules).values({
        patternType: pattern.patternType,
        pattern: pattern.pattern,
        targetCategory: pattern.targetCategory,
        confidence: pattern.confidence,
        sourceCAbinetId: cabinetId,
        createdByUserId: adminUserId,
      } as any);
    }
  }
}

/**
 * Check if a cabinet code matches any learned rules.
 * Returns the target category if a match is found, null otherwise.
 * Learned rules have the highest priority and can never be overridden.
 */
export async function checkLearnedRules(code: string, width?: number, height?: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const codeUpper = (code || "").toUpperCase();

  // Check exact code match first (highest priority)
  const [exactMatch] = await db
    .select({ targetCategory: categorizationRules.targetCategory })
    .from(categorizationRules)
    .where(
      and(
        eq(categorizationRules.patternType, "exact_code"),
        eq(categorizationRules.pattern, codeUpper)
      )
    )
    .orderBy(categorizationRules.confidence)
    .limit(1);

  if (exactMatch) return exactMatch.targetCategory;

  // Check code prefix match
  if (codeUpper.length > 0) {
    const [prefixMatch] = await db
      .select({ targetCategory: categorizationRules.targetCategory })
      .from(categorizationRules)
      .where(
        and(
          eq(categorizationRules.patternType, "code_prefix"),
          eq(categorizationRules.pattern, codeUpper[0])
        )
      )
      .orderBy(categorizationRules.confidence)
      .limit(1);

    if (prefixMatch) return prefixMatch.targetCategory;
  }

  // Check code contains match
  const [containsMatch] = await db
    .select({ targetCategory: categorizationRules.targetCategory })
    .from(categorizationRules)
    .where(eq(categorizationRules.patternType, "code_contains"))
    .limit(1);

  if (containsMatch) {
    // Check if any keyword in the pattern matches the code
    const keywords = await db
      .select({ pattern: categorizationRules.pattern, targetCategory: categorizationRules.targetCategory })
      .from(categorizationRules)
      .where(eq(categorizationRules.patternType, "code_contains"))
      .orderBy(categorizationRules.confidence);

    for (const keyword of keywords) {
      if (codeUpper.includes(keyword.pattern)) {
        return keyword.targetCategory;
      }
    }
  }

  return null;
}

/**
 * Get all learned rules for display/debugging
 */
export async function getAllLearnedRules(): Promise<LearnedRule[]> {
  const db = await getDb();
  if (!db) return [];

  const rules = await db.select().from(categorizationRules).orderBy(categorizationRules.confidence);

  return rules.map((r) => ({
    patternType: r.patternType as any,
    pattern: r.pattern,
    targetCategory: r.targetCategory,
    confidence: r.confidence,
  }));
}
