/**
 * Admin Kitchen Rules.
 *
 * Two things live here, on purpose in one router:
 *
 *   1. The documented catalog in `kitchen_rules` (0233): one row per WRITTEN
 *      rule, with its sources and notes. list, create, and update are
 *      admin-only. This is the record a person reads.
 *
 *   2. The settings in `kitchen_rule_settings` (0254): one row per VALUE the
 *      auto-designer reads. `settingKey` is UNIQUE, so one setting belongs to
 *      exactly one rule and two rules can never write to the same value. That
 *      was the bug: the catalog groups rules that share a `parameterJson`
 *      block, so editing one rule rewrote every rule pointing at the same key,
 *      and several rules ended up showing the same number.
 *
 * Rules Tom made mandatory are `lockedFlag = 1`. Their row is kept so the lock
 * and the audit trail survive, but `saveSetting` refuses to disable one or move
 * its value, `deleteRule` refuses to delete one, and `parameters` never returns
 * its stored value: the frontend reads the code default, so the hard rule cannot
 * be softened from a screen.
 *
 * Reading a value, in order:
 *   1. row missing      -> code default
 *   2. deletedAt set    -> code default (the rule stops applying)
 *   3. enabledFlag = 0  -> code default (the rule stops applying)
 *   4. valueText NULL   -> code default
 *   5. valueText set    -> the admin override
 *
 * Every built-in row is seeded with valueText NULL, so running the SQL changes
 * no design. Nothing changes until an admin saves a value.
 *
 * The tables are created by hand from docs/sql/0233_kitchen_rules.tidb.sql and
 * docs/sql/0254_kitchen_rule_settings.tidb.sql. This router does not migrate. A
 * missing table returns an empty parameter map and a settings list the admin
 * screen already explains.
 */
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { kitchenRuleSettings, kitchenRules } from "../../drizzle/schema";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  KITCHEN_RULE_DEFINITIONS,
  kitchenRuleDefinition,
  type KitchenRuleSettingDefinition,
} from "../../client/src/lib/kitchenRuleRegistry";

const enforcementKind = z.enum(["auto", "suggest", "review", "reference"]);
const parametersInput = z.record(z.string().regex(/^[a-z0-9_]+$/), z.union([z.number().finite(), z.string().trim().min(1).max(500)]));
const settingValueType = z.enum(["number", "toggle", "text", "choice"]);

/** Every built-in rule the Designer knows, with its code default and lock. */
const BUILT_IN: readonly KitchenRuleSettingDefinition[] = KITCHEN_RULE_DEFINITIONS;

function editorName(user: { name?: string | null; email?: string | null }): string {
  return user.name?.trim() || user.email?.trim() || "admin";
}

function parseParameters(raw: string | null | undefined): Record<string, number | string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const parameters: Record<string, number | string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) parameters[key] = value;
      else if (typeof value === "string" && value.trim()) parameters[key] = value.trim();
    }
    return parameters;
  } catch {
    return {};
  }
}

function toRow(row: typeof kitchenRules.$inferSelect) {
  return {
    id: row.id,
    ruleCode: row.ruleCode,
    category: row.category,
    title: row.title,
    ruleDescription: row.ruleDescription,
    parameters: parseParameters(row.parameterJson),
    enforcementKind: row.enforcementKind as "auto" | "suggest" | "review" | "reference",
    sourceText: row.sourceText,
    implementationStatus: row.implementationStatus as "implemented" | "pending" | "reference",
    enabledFlag: Boolean(row.enabledFlag),
    notesText: row.notesText,
    readsParameters: Boolean(row.readsParameters),
    updatedByName: row.updatedByName,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

type SettingRow = typeof kitchenRuleSettings.$inferSelect;

function settingLocks(definition: KitchenRuleSettingDefinition | undefined, row: SettingRow | null): boolean {
  // A built-in hard rule is locked whatever the row says, so a hand-edited row
  // can never unlock the bridge, the faucet, or the window.
  return definition?.locked === true || Boolean(row?.lockedFlag);
}

function toSetting(row: SettingRow) {
  const definition = kitchenRuleDefinition(row.settingKey);
  return {
    settingKey: row.settingKey,
    title: row.title,
    description: row.description,
    category: row.category,
    valueType: row.valueType as "number" | "toggle" | "text" | "choice",
    value: row.valueText ?? null,
    defaultValue: definition ? String(definition.defaultValue) : row.defaultValueText,
    enabled: Boolean(row.enabledFlag),
    locked: settingLocks(definition, row),
    isBuiltIn: Boolean(row.isBuiltIn),
    deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null,
    updatedBy: row.updatedBy ?? null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    executed: definition != null && definition.appliedBy !== "kitchenRulesGuidance",
  };
}

/** A rule that never had a row, so the admin table shows it before the SQL runs. */
function definitionOnlySetting(definition: KitchenRuleSettingDefinition) {
  return {
    settingKey: definition.key,
    title: definition.title,
    description: definition.description,
    category: definition.category,
    valueType: definition.valueType,
    value: null as string | null,
    defaultValue: String(definition.defaultValue),
    enabled: true,
    locked: definition.locked === true,
    isBuiltIn: true,
    deletedAt: null as string | null,
    updatedBy: null as string | null,
    updatedAt: null as string | null,
    executed: definition.appliedBy !== "kitchenRulesGuidance",
  };
}

/** True when this row currently contributes a value to the Designer. */
function rowIsLive(row: SettingRow, definition: KitchenRuleSettingDefinition | undefined): boolean {
  if (row.deletedAt != null) return false;
  if (!row.enabledFlag) return false;
  if (definition?.locked === true) return false;
  return row.valueText != null && row.valueText.trim() !== "";
}

/**
 * A stored value must stay inside what the rule allows, so a typo in the admin
 * screen cannot make the auto-designer produce a plan nobody can build.
 */
function validateValue(definition: KitchenRuleSettingDefinition | undefined, value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!definition) return trimmed.slice(0, 2000);
  if (definition.valueType === "number") {
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `${definition.title} must be a number.` });
    }
    if (definition.min != null && numeric < definition.min) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `${definition.title} must be at least ${definition.min}.` });
    }
    if (definition.max != null && numeric > definition.max) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `${definition.title} must be at most ${definition.max}.` });
    }
    return String(numeric);
  }
  if (definition.valueType === "toggle") {
    if (trimmed !== "0" && trimmed !== "1") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `${definition.title} must be on or off.` });
    }
    return trimmed;
  }
  if (definition.valueType === "choice") {
    if (definition.options && !definition.options.includes(trimmed)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `${definition.title} must be one of: ${definition.options.join(", ")}.`,
      });
    }
    return trimmed;
  }
  return trimmed.slice(0, 2000);
}

/** Refuses any write that would weaken a rule Tom made mandatory. */
function refuseLockedWrite(definition: KitchenRuleSettingDefinition | undefined, row: SettingRow | null) {
  if (!settingLocks(definition, row)) return;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `${definition?.title ?? row?.title ?? "This rule"} is a mandatory hard rule. It cannot be disabled, retargeted, or deleted.`,
  });
}

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

async function settingRow(db: Awaited<ReturnType<typeof database>>, settingKey: string) {
  const found = await db.select().from(kitchenRuleSettings).where(eq(kitchenRuleSettings.settingKey, settingKey)).limit(1);
  return found[0] ?? null;
}

export const kitchenRulesRouter = router({
  list: adminProcedure.query(async () => {
    const db = await database();
    const rows = await db.select().from(kitchenRules).orderBy(asc(kitchenRules.category), asc(kitchenRules.ruleCode));
    return rows.map(toRow);
  }),

  parameters: publicProcedure.query(async () => {
    try {
      const db = await database();
      const rows = await db.select().from(kitchenRules);
      const values: Record<string, number> = {};
      const text: Record<string, string> = {};
      for (const row of rows) {
        if (!row.readsParameters) continue;
        const parameters = parseParameters(row.parameterJson);
        if (!row.enabledFlag) {
          if ("sink_base_substitute" in parameters) values.sink_base_substitute = 0;
          if ("stock_prompt_enabled" in parameters) values.stock_prompt_enabled = 0;
          continue;
        }
        for (const [key, value] of Object.entries(parameters)) {
          if (typeof value === "number") values[key] = value;
          else text[key] = value;
        }
      }
      return { values, text };
    } catch {
      return { values: {}, text: {} };
    }
  }),

  create: adminProcedure.input(z.object({
    ruleCode: z.string().trim().regex(/^[a-z0-9-]{3,80}$/),
    title: z.string().trim().min(1).max(255),
    category: z.string().trim().min(1).max(80),
    ruleDescription: z.string().trim().min(1).max(8000),
    parameters: parametersInput.default({}),
    enforcementKind: enforcementKind.default("reference"),
    sourceText: z.string().trim().min(1).max(512).default("Admin"),
    notesText: z.string().trim().max(4000).nullable().optional(),
    enabledFlag: z.boolean().default(true),
  })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await db.insert(kitchenRules).values({
      ruleCode: input.ruleCode,
      title: input.title,
      category: input.category,
      ruleDescription: input.ruleDescription,
      parameterJson: JSON.stringify(input.parameters),
      enforcementKind: "reference",
      sourceText: input.sourceText,
      implementationStatus: "reference",
      enabledFlag: input.enabledFlag,
      notesText: input.notesText ?? null,
      readsParameters: false,
      updatedByName: editorName(ctx.user),
    });
    return { ok: true as const, implementationStatus: "reference" as const };
  }),

  update: adminProcedure.input(z.object({
    id: z.number().int().positive(),
    title: z.string().trim().min(1).max(255).optional(),
    category: z.string().trim().min(1).max(80),
    ruleDescription: z.string().trim().min(1).max(8000),
    parameters: parametersInput,
    enforcementKind: enforcementKind.optional(),
    sourceText: z.string().trim().min(1).max(512).optional(),
    enabledFlag: z.boolean(),
    notesText: z.string().trim().max(4000).nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await database();
    const existing = await db.select().from(kitchenRules).where(eq(kitchenRules.id, input.id)).limit(1);
    const row = existing[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Kitchen rule not found" });
    await db.update(kitchenRules).set({
      title: input.title ?? row.title,
      category: input.category,
      ruleDescription: input.ruleDescription,
      parameterJson: JSON.stringify(input.parameters),
      enforcementKind: input.enforcementKind ?? row.enforcementKind,
      sourceText: input.sourceText ?? row.sourceText,
      enabledFlag: input.enabledFlag,
      notesText: input.notesText ?? null,
      updatedByName: editorName(ctx.user),
      updatedAt: new Date(),
    }).where(eq(kitchenRules.id, input.id));
    return { ok: true as const };
  }),

  // ── Settings: the values the auto-designer reads ──────────────────────────

  /**
   * The admin table. Every saved row, plus every code rule that has no row yet,
   * so a rule is visible and editable before the SQL is run and is never
   * silently missing from the page.
   */
  settings: adminProcedure.query(async () => {
    const db = await database();
    const rows = await db
      .select()
      .from(kitchenRuleSettings)
      .orderBy(asc(kitchenRuleSettings.category), asc(kitchenRuleSettings.settingKey));
    const all = rows.map(toSetting);
    const known = new Set(all.map((row) => row.settingKey));
    for (const definition of BUILT_IN) {
      if (known.has(definition.key)) continue;
      all.push(definitionOnlySetting(definition));
    }
    return all;
  }),

  /** Create or update one rule. One row, one setting key, one value. */
  saveSetting: adminProcedure.input(z.object({
    settingKey: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().min(1).max(8000),
    category: z.string().trim().min(1).max(80),
    valueType: settingValueType,
    value: z.string().trim().max(2000).nullable(),
    enabled: z.boolean(),
  })).mutation(async ({ ctx, input }) => {
    const db = await database();
    const definition = kitchenRuleDefinition(input.settingKey);
    const row = await settingRow(db, input.settingKey);
    if (row?.deletedAt != null) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This rule was deleted. Undo the delete before editing it." });
    }
    if (!input.enabled) refuseLockedWrite(definition, row);
    if (definition?.locked === true) {
      // The value of a hard rule is not editable either: the frontend reads the
      // code default whatever is stored, so accepting a new number would only
      // show an admin a value that is not in force.
      const attempted = input.value?.trim() ?? "";
      const current = row?.valueText?.trim() ?? "";
      if (attempted !== current) refuseLockedWrite(definition, row);
    }
    const value = validateValue(definition, input.value);
    const locked = settingLocks(definition, row);
    if (row) {
      await db.update(kitchenRuleSettings).set({
        title: input.title,
        description: input.description,
        category: input.category,
        valueType: input.valueType,
        valueText: value,
        enabledFlag: locked ? true : input.enabled,
        lockedFlag: locked,
        updatedBy: editorName(ctx.user),
      }).where(eq(kitchenRuleSettings.settingKey, input.settingKey));
    } else {
      await db.insert(kitchenRuleSettings).values({
        settingKey: input.settingKey,
        title: input.title,
        description: input.description,
        category: input.category,
        valueType: input.valueType,
        valueText: value,
        defaultValueText: definition ? String(definition.defaultValue) : "",
        enabledFlag: locked ? true : input.enabled,
        lockedFlag: locked,
        isBuiltIn: definition != null,
        updatedBy: editorName(ctx.user),
      });
    }
    return { ok: true as const, settingKey: input.settingKey };
  }),

  /** Back to the code default: the override is removed, the rule stays. */
  resetSetting: adminProcedure.input(z.object({
    settingKey: z.string().trim().min(1).max(80),
  })).mutation(async ({ ctx, input }) => {
    const db = await database();
    const definition = kitchenRuleDefinition(input.settingKey);
    const row = await settingRow(db, input.settingKey);
    if (!row) {
      if (!definition) throw new TRPCError({ code: "NOT_FOUND", message: "Kitchen rule not found" });
      return { ok: true as const, settingKey: input.settingKey };
    }
    await db.update(kitchenRuleSettings).set({
      valueText: null,
      enabledFlag: true,
      deletedAt: null,
      // A built-in keeps its title and text; a custom rule keeps what the admin wrote.
      lockedFlag: settingLocks(definition, row),
      updatedBy: editorName(ctx.user),
    }).where(eq(kitchenRuleSettings.settingKey, input.settingKey));
    return { ok: true as const, settingKey: input.settingKey };
  }),

  /**
   * Add a rule. A key that is already a code rule is refused: that rule exists
   * and must be edited, not duplicated. A new key is guidance, because no code
   * knows how to execute it, and it is stored that way rather than pretending.
   */
  createRule: adminProcedure.input(z.object({
    settingKey: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().min(1).max(8000),
    category: z.string().trim().min(1).max(80).default("Guidance"),
    valueType: settingValueType.default("text"),
    value: z.string().trim().max(2000).nullable(),
    enabled: z.boolean().default(true),
  })).mutation(async ({ ctx, input }) => {
    const db = await database();
    if (kitchenRuleDefinition(input.settingKey)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "That rule already exists in the auto-designer. Edit it instead of adding a duplicate.",
      });
    }
    const existing = await settingRow(db, input.settingKey);
    if (existing) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: existing.deletedAt != null
          ? "A rule with that key was deleted. Undo the delete, or use another name."
          : "A rule with that key already exists.",
      });
    }
    await db.insert(kitchenRuleSettings).values({
      settingKey: input.settingKey,
      title: input.title,
      description: input.description,
      category: input.category,
      valueType: input.valueType,
      valueText: validateValue(undefined, input.value),
      defaultValueText: "",
      enabledFlag: input.enabled,
      lockedFlag: false,
      isBuiltIn: false,
      updatedBy: editorName(ctx.user),
    });
    return { ok: true as const, settingKey: input.settingKey, executed: false as const };
  }),

  /**
   * Delete a rule. Soft delete keeps the row (and who deleted it) so the delete
   * can be undone, and stops the rule applying immediately. When the SQL was
   * never run there is no row to flag, so the deletion is recorded explicitly:
   * without a row the rule would look untouched and keep applying.
   */
  deleteRule: adminProcedure.input(z.object({
    settingKey: z.string().trim().min(1).max(80),
  })).mutation(async ({ ctx, input }) => {
    const db = await database();
    const definition = kitchenRuleDefinition(input.settingKey);
    const row = await settingRow(db, input.settingKey);
    refuseLockedWrite(definition, row);
    if (row) {
      await db.update(kitchenRuleSettings).set({
        enabledFlag: false,
        deletedAt: new Date(),
        updatedBy: editorName(ctx.user),
      }).where(eq(kitchenRuleSettings.settingKey, input.settingKey));
      return { ok: true as const, settingKey: input.settingKey };
    }
    if (!definition) throw new TRPCError({ code: "NOT_FOUND", message: "Kitchen rule not found" });
    await db.insert(kitchenRuleSettings).values({
      settingKey: definition.key,
      title: definition.title,
      description: definition.description,
      category: definition.category,
      valueType: definition.valueType,
      valueText: null,
      defaultValueText: String(definition.defaultValue),
      enabledFlag: false,
      lockedFlag: false,
      isBuiltIn: true,
      deletedAt: new Date(),
      updatedBy: editorName(ctx.user),
    });
    return { ok: true as const, settingKey: input.settingKey };
  }),

  /** Undo a delete. The rule applies again with whatever value it had. */
  restoreRule: adminProcedure.input(z.object({
    settingKey: z.string().trim().min(1).max(80),
  })).mutation(async ({ ctx, input }) => {
    const db = await database();
    const row = await settingRow(db, input.settingKey);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Kitchen rule not found" });
    if (!row.deletedAt) return { ok: true as const, settingKey: input.settingKey };
    await db.update(kitchenRuleSettings).set({
      deletedAt: null,
      enabledFlag: true,
      updatedBy: editorName(ctx.user),
    }).where(eq(kitchenRuleSettings.settingKey, input.settingKey));
    return { ok: true as const, settingKey: input.settingKey };
  }),
});
