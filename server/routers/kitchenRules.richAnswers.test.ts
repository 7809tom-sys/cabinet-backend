/**
 * Kitchen Rules server: Rich's answers save, stay notes only, and saved settings
 * reach the Designer through `parameters`.
 *
 * No database is touched: getDb is mocked with an in-memory fake.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KITCHEN_RULE_DEFINITIONS } from "../../client/src/lib/kitchenRuleRegistry";

const fake = vi.hoisted(() => ({
  catalog: [] as any[],
  settings: [] as any[],
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  failSettings: false,
  noDb: false,
}));

vi.mock("../db", async () => {
  const schema = await import("../../drizzle/schema");
  const tableName = (table: unknown) => (table === schema.kitchenRules ? "kitchen_rules" : "kitchen_rule_settings");
  const rowsFor = (table: unknown) => {
    const name = tableName(table);
    if (name === "kitchen_rule_settings" && fake.failSettings) {
      return Promise.reject(new Error("Table 'cabinet_dealz.kitchen_rule_settings' doesn't exist"));
    }
    return Promise.resolve(name === "kitchen_rules" ? fake.catalog : fake.settings);
  };
  const query = (table: unknown) => {
    const result: any = {
      where: () => result,
      orderBy: () => result,
      limit: () => rowsFor(table),
      then: (resolve: any, reject: any) => rowsFor(table).then(resolve, reject),
    };
    return result;
  };
  const db = {
    select: () => ({ from: (table: unknown) => query(table) }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          fake.updates.push({ table: tableName(table), values });
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        fake.inserts.push({ table: tableName(table), values });
      },
    }),
  };
  return { getDb: async () => (fake.noDb ? null : db) };
});

import { buildKitchenRuleParameters, isRichQuestionRule, KITCHEN_RULE_NOTES_MAX, kitchenRulesRouter } from "./kitchenRules";

const admin = { user: { id: 1, role: "admin", name: "Tom" } } as any;
const affiliate = { user: { id: 7, role: "affiliate", name: "Affiliate user" } } as any;
const guest = { user: null } as any;

const RICH_PROMPT = "Rich's answer: (not answered yet). Write what you do on a real job, and any number you use.";

function richRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 41,
    ruleCode: "rich-q-gap-in-run",
    category: "Questions for Rich",
    title: "A gap bigger than 3 inches in a run",
    ruleDescription: "Question for Rich: what do you do with a gap over 3 inches?",
    parameterJson: "{}",
    enforcementKind: "reference",
    sourceText: "question for Rich",
    implementationStatus: "reference",
    enabledFlag: true,
    notesText: RICH_PROMPT,
    readsParameters: false,
    updatedByName: null,
    createdAt: new Date("2026-11-25T12:00:00Z"),
    updatedAt: new Date("2026-11-25T12:00:00Z"),
    ...overrides,
  };
}

function catalogRow(overrides: Record<string, unknown> = {}) {
  return {
    ...richRow(),
    id: 3,
    ruleCode: "fridge-landing",
    category: "Refrigerator",
    title: "15 inch refrigerator landing",
    parameterJson: '{"fridge_landing_in":15}',
    enforcementKind: "review",
    implementationStatus: "implemented",
    notesText: null,
    readsParameters: true,
    ...overrides,
  };
}

function settingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    settingKey: "filler_gap_max_in",
    title: "Largest gap a filler closes",
    description: "x",
    category: "Fillers",
    valueType: "number",
    valueText: null,
    defaultValueText: "3",
    enabledFlag: true,
    lockedFlag: false,
    isBuiltIn: true,
    deletedAt: null,
    updatedBy: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as any;
}

beforeEach(() => {
  fake.catalog = [];
  fake.settings = [];
  fake.updates = [];
  fake.inserts = [];
  fake.failSettings = false;
  fake.noDb = false;
});

describe("kitchenRules admin guard", () => {
  const calls: Array<[string, (caller: any) => Promise<unknown>]> = [
    ["list", (c) => c.list()],
    ["settings", (c) => c.settings()],
    ["update", (c) => c.update({ id: 41, category: "x", ruleDescription: "x", parameters: {}, enabledFlag: true, notesText: "a" })],
    ["create", (c) => c.create({ ruleCode: "abc", title: "t", category: "c", ruleDescription: "d" })],
    ["saveSetting", (c) => c.saveSetting({ settingKey: "filler_gap_max_in", title: "t", description: "d", category: "c", valueType: "number", value: "2", enabled: true })],
    ["resetSetting", (c) => c.resetSetting({ settingKey: "filler_gap_max_in" })],
    ["createRule", (c) => c.createRule({ settingKey: "my_rule", title: "t", description: "d", value: null })],
    ["deleteRule", (c) => c.deleteRule({ settingKey: "filler_gap_max_in" })],
    ["restoreRule", (c) => c.restoreRule({ settingKey: "filler_gap_max_in" })],
  ];
  for (const [name, call] of calls) {
    it(`${name} refuses a non-admin and a guest`, async () => {
      await expect(call(kitchenRulesRouter.createCaller(affiliate))).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(call(kitchenRulesRouter.createCaller(guest))).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(fake.updates).toHaveLength(0);
      expect(fake.inserts).toHaveLength(0);
    });
  }

  it("parameters stays public, so every Designer session reads saved values", async () => {
    fake.catalog = [catalogRow()];
    const result = await kitchenRulesRouter.createCaller(guest).parameters();
    expect(result.values.fridge_landing_in).toBe(15);
  });
});

describe("saving Rich's answer", () => {
  it("lists the Rich row with its notes, in the shape the admin page reads", async () => {
    fake.catalog = [richRow()];
    const [row] = await kitchenRulesRouter.createCaller(admin).list();
    expect(row).toMatchObject({
      id: 41,
      ruleCode: "rich-q-gap-in-run",
      category: "Questions for Rich",
      parameters: {},
      enforcementKind: "reference",
      implementationStatus: "reference",
      enabledFlag: true,
      notesText: RICH_PROMPT,
      readsParameters: false,
      createdAt: "2026-11-25T12:00:00.000Z",
    });
  });

  it("saves the answer into notesText and nothing else that could drive a design", async () => {
    fake.catalog = [richRow()];
    const answer = "Over 3 inches I put a 6 or 9 inch base or a pullout, never a wide filler.";
    await kitchenRulesRouter.createCaller(admin).update({
      id: 41,
      title: "A gap bigger than 3 inches in a run",
      category: "Questions for Rich",
      ruleDescription: richRow().ruleDescription,
      parameters: {},
      enforcementKind: "reference",
      sourceText: "question for Rich",
      enabledFlag: true,
      notesText: answer,
    });
    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0]!.table).toBe("kitchen_rules");
    expect(fake.updates[0]!.values).toMatchObject({
      notesText: answer,
      parameterJson: "{}",
      enforcementKind: "reference",
      implementationStatus: "reference",
      readsParameters: false,
      category: "Questions for Rich",
      updatedByName: "Tom",
    });
  });

  it("pins a Rich row to notes only even if a request tries to give it numbers or move it", async () => {
    fake.catalog = [richRow()];
    await kitchenRulesRouter.createCaller(admin).update({
      id: 41,
      category: "Fillers",
      ruleDescription: "x",
      parameters: { filler_gap_max_in: 9 },
      enforcementKind: "auto",
      enabledFlag: true,
      notesText: "answer",
    });
    expect(fake.updates[0]!.values).toMatchObject({
      parameterJson: "{}",
      enforcementKind: "reference",
      category: "Questions for Rich",
      readsParameters: false,
    });
  });

  it("leaves ordinary catalog rules editable as before", async () => {
    fake.catalog = [catalogRow()];
    await kitchenRulesRouter.createCaller(admin).update({
      id: 3,
      category: "Refrigerator",
      ruleDescription: "x",
      parameters: { fridge_landing_in: 18 },
      enabledFlag: true,
      notesText: null,
    });
    expect(fake.updates[0]!.values.parameterJson).toBe('{"fridge_landing_in":18}');
    expect(fake.updates[0]!.values).not.toHaveProperty("readsParameters");
  });

  it("accepts a long answer from the job site and refuses an oversized one", async () => {
    fake.catalog = [richRow()];
    const caller = kitchenRulesRouter.createCaller(admin);
    const base = { id: 41, category: "Questions for Rich", ruleDescription: "x", parameters: {}, enabledFlag: true };
    await expect(caller.update({ ...base, notesText: "a".repeat(KITCHEN_RULE_NOTES_MAX) })).resolves.toEqual({ ok: true });
    await expect(caller.update({ ...base, notesText: "a".repeat(KITCHEN_RULE_NOTES_MAX + 1) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns NOT_FOUND when the question row has not been seeded (0238 not run)", async () => {
    fake.catalog = [];
    await expect(kitchenRulesRouter.createCaller(admin).update({
      id: 41, category: "Questions for Rich", ruleDescription: "x", parameters: {}, enabledFlag: true, notesText: "a",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("Rich's answers never feed the Designer, plan review, or the AI prompt", () => {
  it("recognizes Rich rows by code and by category", () => {
    expect(isRichQuestionRule({ ruleCode: "rich-q-hood-bottom", category: "x" })).toBe(true);
    expect(isRichQuestionRule({ ruleCode: "anything", category: "Questions for Rich" })).toBe(true);
    expect(isRichQuestionRule({ ruleCode: "fridge-landing", category: "Refrigerator" })).toBe(false);
  });

  it("skips a Rich row in parameters even if it was hand-edited to read numbers", async () => {
    fake.catalog = [
      catalogRow(),
      richRow({ parameterJson: '{"filler_gap_max_in":9,"hood_note":"30 in"}', readsParameters: true, notesText: "Hood at 30 inches" }),
    ];
    const result = await kitchenRulesRouter.createCaller(guest).parameters();
    expect(result.values).toEqual({ fridge_landing_in: 15 });
    expect(result.text).toEqual({});
    expect(result.guidance).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("Hood at 30 inches");
  });

  it("never sends a Rich-category custom setting as guidance", () => {
    const payload = buildKitchenRuleParameters([], [
      settingRow({ settingKey: "rich_gap_answer", category: "Questions for Rich", title: "Rich", description: "answer", isBuiltIn: false }),
      settingRow({ settingKey: "rich-q-hood", category: "Hood", title: "Rich", description: "answer", isBuiltIn: false }),
    ]);
    expect(payload.guidance).toEqual([]);
  });
});

describe("saved settings reach the Designer through parameters", () => {
  it("changes nothing while every seeded row is NULL", () => {
    const seeded = KITCHEN_RULE_DEFINITIONS.map((definition) => settingRow({
      settingKey: definition.key,
      category: definition.category,
      valueType: definition.valueType,
      defaultValueText: String(definition.defaultValue),
      lockedFlag: definition.locked === true,
    }));
    const catalog = [catalogRow()];
    expect(buildKitchenRuleParameters(catalog, seeded)).toEqual(buildKitchenRuleParameters(catalog, []));
    expect(buildKitchenRuleParameters(catalog, seeded).guidance).toEqual([]);
  });

  it("applies a saved number and lets it win over the old catalog value", () => {
    const payload = buildKitchenRuleParameters(
      [catalogRow()],
      [
        settingRow({ settingKey: "filler_gap_max_in", valueText: "2.5" }),
        settingRow({ settingKey: "fridge_landing_in", valueText: "18", category: "Refrigerator" }),
      ],
    );
    expect(payload.values).toMatchObject({ filler_gap_max_in: 2.5, fridge_landing_in: 18 });
  });

  it("ignores a deleted, disabled, or locked override", () => {
    const lockedKey = KITCHEN_RULE_DEFINITIONS.find((definition) => definition.locked)!.key;
    const payload = buildKitchenRuleParameters([], [
      settingRow({ settingKey: "filler_gap_max_in", valueText: "1", deletedAt: new Date() }),
      settingRow({ settingKey: "jog_max_in", valueText: "1", enabledFlag: false }),
      settingRow({ settingKey: lockedKey, valueText: "0", lockedFlag: true }),
    ]);
    expect(payload.values).toEqual({});
  });

  it("sends a choice or text setting as text", () => {
    const choice = KITCHEN_RULE_DEFINITIONS.find((definition) => definition.valueType === "choice" && definition.options?.length);
    if (!choice) return;
    const payload = buildKitchenRuleParameters([], [
      settingRow({ settingKey: choice.key, valueType: "choice", valueText: choice.options![0] }),
    ]);
    expect(payload.text[choice.key]).toBe(choice.options![0]);
    expect(payload.values[choice.key]).toBeUndefined();
  });

  it("carries an admin-added custom rule as guidance, and not once it is deleted", () => {
    const live = settingRow({ settingKey: "no_open_shelves", title: "No open shelves", description: "Rich: never open shelves by the range.", category: "Guidance", valueType: "text", isBuiltIn: false });
    expect(buildKitchenRuleParameters([], [live]).guidance).toEqual([
      { settingKey: "no_open_shelves", title: "No open shelves", text: "Rich: never open shelves by the range.", value: null, category: "Guidance" },
    ]);
    expect(buildKitchenRuleParameters([], [{ ...live, deletedAt: new Date() }]).guidance).toEqual([]);
  });

  it("still returns the catalog values when kitchen_rule_settings is missing (0254 not run)", async () => {
    fake.catalog = [catalogRow()];
    fake.failSettings = true;
    const result = await kitchenRulesRouter.createCaller(guest).parameters();
    expect(result).toEqual({ values: { fridge_landing_in: 15 }, text: {}, guidance: [] });
  });

  it("returns empty maps with no database", async () => {
    fake.noDb = true;
    await expect(kitchenRulesRouter.createCaller(guest).parameters()).resolves.toEqual({ values: {}, text: {}, guidance: [] });
  });
});

describe("SQL files Tom pastes in the TiDB editor", () => {
  const sql0254 = readFileSync(new URL("../../docs/sql/0254_kitchen_rule_settings.tidb.sql", import.meta.url), "utf8");
  const sql0238 = readFileSync(new URL("../../docs/sql/0238_kitchen_rules_questions_for_rich.tidb.sql", import.meta.url), "utf8");

  function seedKeys(): Array<{ key: string; value: string; locked: boolean }> {
    const insert = sql0254.split("\n").find((line) => line.startsWith("INSERT IGNORE INTO cabinet_dealz.kitchen_rule_settings"))!;
    const body = insert.slice(insert.indexOf("VALUES") + 6);
    const tuple = /\((?:[^()']|'(?:[^']|'')*')*\)/g;
    const out: Array<{ key: string; value: string; locked: boolean }> = [];
    for (const match of body.matchAll(tuple)) {
      const parts = match[0].match(/'(?:[^']|'')*'|NULL|\d+/g)!;
      out.push({ key: parts[0]!.slice(1, -1), value: parts[6]!.slice(1, -1), locked: parts[8] === "1" });
      expect(parts[5], parts[0]).toBe("NULL");
    }
    return out;
  }

  it("0254 seeds exactly the rules the code defines, once each, every value NULL", () => {
    const rows = seedKeys();
    expect(rows.map((row) => row.key).sort()).toEqual(KITCHEN_RULE_DEFINITIONS.map((definition) => definition.key).sort());
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
    for (const row of rows) {
      const definition = KITCHEN_RULE_DEFINITIONS.find((item) => item.key === row.key)!;
      expect(row.value, row.key).toBe(String(definition.defaultValue));
      expect(row.locked, row.key).toBe(definition.locked === true);
    }
  });

  it("0254 has one INSERT IGNORE and no UPDATE or DELETE statement", () => {
    const statements = sql0254.split("\n").filter((line) => line.trim() && !line.trim().startsWith("--"));
    expect(statements.filter((line) => /^INSERT\b/i.test(line))).toHaveLength(1);
    expect(statements.some((line) => /^(UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i.test(line))).toBe(false);
  });

  it("0238 adds only the 18 Rich questions as parameter-free reference rows", () => {
    const statements = sql0238.split("\n").filter((line) => line.trim() && !line.trim().startsWith("--")).join("\n");
    expect(statements).toContain("INSERT IGNORE INTO cabinet_dealz.kitchen_rules");
    expect(statements).not.toMatch(/\b(CREATE|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i);
    const rows = statements.match(/\('rich-q-[^']+'(?:[^()']|'(?:[^']|'')*')*\)/g) ?? [];
    expect(rows).toHaveLength(18);
    for (const row of rows) {
      expect(row).toContain("'Questions for Rich'");
      expect(row).toMatch(/'\{\}', 'reference', '(?:[^']|'')*', 'reference', 1, '(?:[^']|'')*', 0\)$/);
    }
  });
});
