import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const MIGRATION = "drizzle/0236_affiliate_marketing_hub_content.sql";
const TIDB = "docs/marketing-hub-publish.sql";

/** Remove quoted literals so keyword checks only see SQL, not prose. */
function stripLiterals(statement: string): string {
  return statement.replace(/'(?:[^'\\]|\\.|'')*'/g, "''");
}

/**
 * Cut `--` comments without touching the inside of a quoted literal, then split
 * the text into statements on semicolons that are outside a literal. Written by
 * hand because the bodies contain emoji, apostrophes, and the word "Drop".
 */
function statements(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let inString = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    if (inString) {
      current += char;
      if (char === "\\") {
        current += sql[index + 1] ?? "";
        index += 1;
        continue;
      }
      if (char === "'") {
        if (sql[index + 1] === "'") {
          current += "'";
          index += 1;
          continue;
        }
        inString = false;
      }
      continue;
    }
    if (char === "'") {
      inString = true;
      current += char;
      continue;
    }
    if (char === "-" && sql[index + 1] === "-") {
      while (index < sql.length && sql[index] !== "\n") index += 1;
      current += "\n";
      continue;
    }
    if (char === ";") {
      if (current.trim()) out.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** Split a SQL single-quoted literal list into values. NULL becomes null. */
function parseSelectList(list: string): (string | null)[] {
  const values: (string | null)[] = [];
  let index = 0;
  while (index < list.length) {
    const char = list[index];
    if (char === "," || char === " ") {
      index += 1;
      continue;
    }
    if (list.startsWith("NULL", index)) {
      values.push(null);
      index += 4;
      continue;
    }
    if (list.startsWith("TRUE", index)) {
      values.push("TRUE");
      index += 4;
      continue;
    }
    if (list.startsWith("FALSE", index)) {
      values.push("FALSE");
      index += 5;
      continue;
    }
    if (char === "'") {
      let text = "";
      index += 1;
      while (index < list.length) {
        if (list[index] === "'" && list[index + 1] === "'") {
          text += "'";
          index += 2;
          continue;
        }
        if (list[index] === "'") {
          index += 1;
          break;
        }
        if (list[index] === "\\" && list[index + 1] === "n") {
          text += "\n";
          index += 2;
          continue;
        }
        if (list[index] === "\\" && list[index + 1] === "\\") {
          text += "\\";
          index += 2;
          continue;
        }
        text += list[index];
        index += 1;
      }
      values.push(text);
      continue;
    }
    const start = index;
    while (index < list.length && list[index] !== ",") index += 1;
    values.push(list.slice(start, index).trim());
  }
  return values;
}

type Row = {
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  category: string;
  metaJson: string | null;
  sortOrder: number;
  isPublished: string;
  featured: string;
};

function rowsFrom(sql: string): Row[] {
  const rows: Row[] = [];
  for (const match of sql.matchAll(
    /INSERT INTO [^\n]*? SELECT ([\s\S]*?) FROM DUAL/g
  )) {
    const [
      type,
      title,
      body,
      url,
      category,
      metaJson,
      sortOrder,
      isPublished,
      featured,
    ] = parseSelectList(match[1]);
    rows.push({
      type: type as string,
      title: title as string,
      body: body as string | null,
      url: url as string | null,
      category: category as string,
      metaJson: metaJson as string | null,
      sortOrder: Number(sortOrder),
      isPublished: isPublished as string,
      featured: featured as string,
    });
  }
  return rows;
}

const migrationSql = read(MIGRATION);
const tidbSql = read(TIDB);
const migrationRows = rowsFrom(migrationSql);
const tidbRows = rowsFrom(tidbSql);
const migrationStatements = statements(migrationSql);
const tidbStatements = statements(tidbSql);

describe("0236 Marketing Hub content migration", () => {
  it("publishes rows for all six resource types", () => {
    const counts = migrationRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.type] = (acc[row.type] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({
      link: 10,
      script: 14,
      guide: 4,
      video: 4,
      pdf: 16,
      social: 8,
    });
  });

  it("publishes every row and leaves nothing featured as a placeholder", () => {
    expect(migrationRows.length).toBeGreaterThan(0);
    for (const row of migrationRows) {
      expect(row.isPublished).toBe("TRUE");
      expect(row.featured).toBe("FALSE");
      expect(row.title.startsWith("EXAMPLE DRAFT:")).toBe(false);
      expect(row.body ?? "").not.toContain("EXAMPLE DRAFT");
      expect(row.body ?? "").not.toContain("DRAFT example only");
    }
  });

  it("uses only the affiliate_resources enum values and fits every column", () => {
    const allowed = new Set([
      "script",
      "guide",
      "video",
      "pdf",
      "social",
      "link",
    ]);
    for (const row of migrationRows) {
      expect(allowed.has(row.type)).toBe(true);
      expect(row.category.length).toBeLessThanOrEqual(64);
      expect(row.title.length).toBeLessThanOrEqual(255);
      expect((row.url ?? "").length).toBeLessThanOrEqual(1024);
    }
  });

  it("guards every insert on type + title so it can be re-run", () => {
    for (const row of migrationRows) {
      const escapedTitle = row.title.replace(/'/g, "''");
      expect(migrationSql).toContain(
        `WHERE NOT EXISTS (SELECT 1 FROM \`affiliate_resources\` WHERE type = '${row.type}' AND title = '${escapedTitle}')`
      );
    }
    expect(migrationStatements).toHaveLength(migrationRows.length);
    for (const statement of migrationStatements) {
      expect(statement.startsWith("INSERT INTO")).toBe(true);
      expect(statement.match(/NOT EXISTS/g)).toHaveLength(1);
    }
  });

  it("only inserts, so the 0218 example drafts are never deleted or unpublished", () => {
    for (const statement of migrationStatements) {
      const sqlOnly = stripLiterals(statement);
      expect(sqlOnly).toMatch(/^INSERT INTO /);
      expect(sqlOnly).not.toMatch(/\bDELETE\b/i);
      expect(sqlOnly).not.toMatch(/\bUPDATE\b/i);
      expect(sqlOnly).not.toMatch(/\bDROP\b/i);
      expect(sqlOnly).not.toMatch(/\bTRUNCATE\b/i);
      expect(sqlOnly).not.toMatch(/\bALTER\b/i);
    }
  });

  it("is registered in the drizzle journal as the entry right after 0235", () => {
    const journal = JSON.parse(read("drizzle/meta/_journal.json")) as {
      entries: { idx: number; tag: string }[];
    };
    // Later migrations are appended after this one, so find it by tag instead of
    // assuming it is last: the entry it has to follow is 0235.
    const index = journal.entries.findIndex(
      entry => entry.tag === "0236_affiliate_marketing_hub_content"
    );
    expect(index).toBeGreaterThan(0);
    const entry = journal.entries[index]!;
    const previous = journal.entries[index - 1]!;
    expect(previous.tag).toBe("0235_room_scene_prompt_audit");
    // The journal already has a historical gap (idx 161), so compare to the
    // previous entry rather than to entries.length.
    expect(entry.idx).toBe(previous.idx + 1);
  });
});

describe("the published guides are the repo's own markdown, verbatim", () => {
  const guides = [
    ["10 Steps to a Sale", "assets/guides/10-steps-to-a-sale.md"],
    [
      "Kitchen Design Fundamentals",
      "assets/guides/kitchen-design-fundamentals.md",
    ],
    ["How to Use Your CRM Effectively", "assets/guides/how-to-use-your-crm.md"],
    [
      "Marketing Scripts & Templates",
      "assets/guides/marketing-scripts-and-templates.md",
    ],
  ] as const;

  it.each(guides)("%s body is byte-identical to %s", (title, file) => {
    const row = migrationRows.find(
      item => item.type === "guide" && item.title === title
    );
    expect(row).toBeDefined();
    expect(row?.body).toBe(read(file));
  });
});

describe("scripts carry the pre-PR20 copy with placeholder tokens", () => {
  it("keeps the phone, follow-up, closing/referral, email, and social scripts", () => {
    const scripts = migrationRows.filter(row => row.type === "script");
    const categories = new Set(scripts.map(row => row.category));
    expect(categories).toEqual(
      new Set([
        "phone",
        "in-store",
        "follow-up",
        "objection",
        "closing",
        "email",
        "social",
      ])
    );

    const titles = scripts.map(row => row.title);
    expect(titles).toContain("First Contact Text (Warm Lead)");
    expect(titles).toContain("Follow-Up Text (Day 3)");
    expect(titles).toContain("Referral Request (After Delivery)");
    expect(titles).toContain("Introduction Email");
    expect(titles).toContain("Facebook Post");
    expect(titles).toContain("Instagram Caption");
  });

  it("uses [Name] and a store-name placeholder instead of one affiliate's store", () => {
    const copy = migrationRows.filter(
      row => row.type === "script" || row.type === "social"
    );
    expect(
      copy.filter(row => (row.body ?? "").includes("[Name]")).length
    ).toBeGreaterThan(5);
    expect(
      copy.filter(row => (row.body ?? "").includes("[Your Store Name]")).length
    ).toBeGreaterThan(5);
  });

  it("never bakes a real storefront URL or a real store name into the copy", () => {
    for (const row of migrationRows.filter(
      item => item.type === "script" || item.type === "social"
    )) {
      expect(row.body ?? "").not.toMatch(/https?:\/\//);
      expect(row.body ?? "").not.toMatch(/cabinetdealz\.com/i);
    }
  });

  it("fills every situation filter the Scripts tab offers", () => {
    const shared = read("shared/affiliateResources.ts");
    const block = shared.slice(
      shared.indexOf("export const SCRIPT_SITUATIONS = ["),
      shared.indexOf(
        "] as const;",
        shared.indexOf("export const SCRIPT_SITUATIONS = [")
      )
    );
    const filterIds = [...block.matchAll(/id: "([a-z-]+)"/g)].map(m => m[1]);
    const scriptCategories = new Set(
      migrationRows
        .filter(row => row.type === "script")
        .map(row => row.category)
    );
    expect(filterIds.length).toBeGreaterThan(0);
    for (const id of filterIds) expect(scriptCategories.has(id)).toBe(true);
  });
});

describe("video training lists only channels that still resolve", () => {
  const KEPT = [
    "https://www.youtube.com/@CabinetDIY",
    "https://www.youtube.com/@thisoldhouse",
    "https://www.youtube.com/@grantcardone",
    "https://www.youtube.com/@HomeRenoVisionDIY",
  ];
  const DEAD = ["@KitchenBathDesignTV", "@salesinsightslab", "@Houzz"];

  it("publishes exactly the four live channels", () => {
    const videos = migrationRows.filter(row => row.type === "video");
    expect(videos.map(row => row.url).sort()).toEqual([...KEPT].sort());
  });

  it("has no row or insert referencing the three handles that 404", () => {
    const inserts = [...migrationStatements, ...tidbStatements].join("\n");
    for (const dead of DEAD) {
      expect(inserts).not.toContain(dead);
      expect(inserts.toLowerCase()).not.toContain(
        dead.replace("@", "").toLowerCase()
      );
    }
    for (const row of migrationRows.filter(item => item.type === "video")) {
      expect(row.url ?? "").not.toMatch(
        /KitchenBathDesignTV|salesinsightslab|Houzz/i
      );
    }
  });

  it("labels third-party channels as recommended, not affiliated", () => {
    for (const row of migrationRows.filter(item => item.type === "video")) {
      expect(row.body).toMatch(/recommends it and is not affiliated/);
      expect(row.metaJson).toBeNull();
    }
  });
});

describe("printed materials point at the real training PDFs", () => {
  const BASE = "https://www.cabinetdealz.com/manus-storage/";
  const HASHED_GUIDE = "Cabinet-Dealz-Affiliate-Welcome-Guide_f17152cc.pdf";
  const NUMBERED = [
    "01-getting-started_7112e75c.pdf",
    "02-design-tool_86325f23.pdf",
    "03-customize-storefront_5771b58a.pdf",
    "04-payout-setup_f2b719b0.pdf",
    "05-crm-guide_3c194803.pdf",
    "06-sales-playbook_a817aa30.pdf",
    "07-objection-handling_b6e2a924.pdf",
    "08-closing-techniques_fe0ee6cc.pdf",
    "09-referral-network_c2f4bf94.pdf",
    "10-social-media_505fee8f.pdf",
    "11-design-fundamentals_cf44ef06.pdf",
    "12-cabinet-sizing_05b7722e.pdf",
    "13-door-styles-guide_02a8df95.pdf",
    "14-reading-a-kitchen_547b0735.pdf",
    "15-trends-and-vision_af6791c7.pdf",
  ];

  it("publishes the fifteen numbered PDFs plus the hashed welcome guide", () => {
    const urls = migrationRows
      .filter(row => row.type === "pdf")
      .map(row => row.url);
    expect(urls).toHaveLength(16);
    for (const filename of [...NUMBERED, HASHED_GUIDE]) {
      expect(urls).toContain(`${BASE}${filename}`);
    }
    expect(new Set(urls).size).toBe(16);
  });

  it("never links the unhashed welcome-guide path, which 404s", () => {
    for (const url of migrationRows
      .filter(row => row.type === "pdf")
      .map(row => row.url)) {
      expect(url?.endsWith("/Cabinet-Dealz-Affiliate-Welcome-Guide.pdf")).toBe(
        false
      );
    }
  });

  it("leaves fileKey alone, because these are public /manus-storage links", () => {
    for (const statement of [...migrationStatements, ...tidbStatements]) {
      expect(stripLiterals(statement)).not.toMatch(/fileKey/i);
    }
  });
});

describe("docs/marketing-hub-publish.sql is a hand-run TiDB script", () => {
  it("opens with read-only checks before the first insert", () => {
    const firstInsert = tidbStatements.findIndex(statement =>
      statement.startsWith("INSERT")
    );
    expect(firstInsert).toBeGreaterThan(0);
    const checks = tidbStatements.slice(0, firstInsert);
    expect(checks.length).toBeGreaterThanOrEqual(3);
    for (const check of checks) expect(check.startsWith("SELECT")).toBe(true);
  });

  it("writes one statement per line", () => {
    const executableLines = tidbSql
      .split("\n")
      .filter(line => !line.trim().startsWith("--") && line.trim().length > 0);
    expect(executableLines).toHaveLength(tidbStatements.length);
    for (const line of executableLines) {
      expect(statements(line)).toHaveLength(1);
    }
  });

  it("prefixes every table with cabinet_dealz. and has no drizzle breakpoints", () => {
    expect(tidbSql).not.toContain("--> statement-breakpoint");
    for (const statement of tidbStatements) {
      const refs =
        stripLiterals(statement).match(/\b(?:FROM|INTO)\s+[a-zA-Z_][\w.]*/g) ??
        [];
      for (const ref of refs) {
        if (/^FROM\s+DUAL$/i.test(ref)) continue;
        expect(ref).toMatch(/^(?:FROM|INTO) cabinet_dealz\.[a-z_]+$/);
      }
      // A read-only session probe (SELECT @@sql_mode) names no table at all.
      if (!refs.length) expect(statement).toMatch(/^SELECT @@/);
    }
  });

  it("is idempotent and only ever inserts or selects", () => {
    for (const statement of tidbStatements) {
      const sqlOnly = stripLiterals(statement);
      expect(sqlOnly).toMatch(/^(INSERT INTO|SELECT) /);
      expect(sqlOnly).not.toMatch(/\bUPDATE\b/i);
      expect(sqlOnly).not.toMatch(/\bDELETE\b/i);
      expect(sqlOnly).not.toMatch(/\bDROP\b/i);
      expect(sqlOnly).not.toMatch(/\bTRUNCATE\b/i);
    }
    const inserts = tidbStatements.filter(statement =>
      statement.startsWith("INSERT INTO")
    );
    expect(inserts).toHaveLength(tidbRows.length);
    for (const insert of inserts) expect(insert).toContain("WHERE NOT EXISTS");
  });

  it("carries exactly the same rows as the drizzle migration", () => {
    const key = (row: Row) => `${row.type}\u0000${row.title}`;
    expect(tidbRows.map(key).sort()).toEqual(migrationRows.map(key).sort());
    for (const tidbRow of tidbRows) {
      const twin = migrationRows.find(row => key(row) === key(tidbRow));
      expect(twin).toBeDefined();
      expect({ ...tidbRow, sortOrder: 0 }).toEqual({ ...twin, sortOrder: 0 });
    }
  });

  it("gives every row a unique sort order", () => {
    const orders = migrationRows.map(row => row.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });
});
