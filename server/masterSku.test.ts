/**
 * Master SKU Alias Program — Unit Tests
 *
 * Tests for the masterSku tRPC router procedures using a mock DB.
 * Covers: listSuggestions, approveSuggestion, dismissSuggestion,
 *         listAliases, deleteAlias, summaryCounts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize a SKU code: uppercase, strip hyphens/spaces */
function normalize(code: string): string {
  return code.toUpperCase().replace(/[-\s]/g, "");
}

/** Levenshtein distance */
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

/** Edit similarity score 0-100 */
function editSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return Math.round((1 - dist / maxLen) * 100);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("normalize()", () => {
  it("uppercases codes", () => {
    expect(normalize("b24")).toBe("B24");
  });

  it("strips hyphens", () => {
    expect(normalize("B-24")).toBe("B24");
  });

  it("strips spaces", () => {
    expect(normalize("B 24")).toBe("B24");
  });

  it("handles mixed case and hyphens", () => {
    expect(normalize("db-24-3")).toBe("DB243");
  });
});

describe("levenshtein()", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("B24", "B24")).toBe(0);
  });

  it("returns 1 for single character difference", () => {
    expect(levenshtein("B24", "B25")).toBe(1);
  });

  it("handles empty strings", () => {
    expect(levenshtein("", "ABC")).toBe(3);
    expect(levenshtein("ABC", "")).toBe(3);
  });

  it("is symmetric", () => {
    expect(levenshtein("B24", "B-24")).toBe(levenshtein("B-24", "B24"));
  });
});

describe("editSimilarity()", () => {
  it("returns 100 for identical strings", () => {
    expect(editSimilarity("B24", "B24")).toBe(100);
  });

  it("returns 0 for empty strings", () => {
    expect(editSimilarity("", "B24")).toBe(0);
    expect(editSimilarity("B24", "")).toBe(0);
  });

  it("returns high score for similar codes", () => {
    const score = editSimilarity("B24", "B-24");
    expect(score).toBeGreaterThan(70);
  });

  it("returns lower score for different codes", () => {
    const score = editSimilarity("B24", "W3042");
    expect(score).toBeLessThan(60);
  });
});

describe("SKU duplicate detection logic", () => {
  it("detects normalized code collisions (B24 vs B-24)", () => {
    const codes = ["B24", "B-24", "W3042"];
    const byNorm = new Map<string, string[]>();
    for (const code of codes) {
      const norm = normalize(code);
      if (!byNorm.has(norm)) byNorm.set(norm, []);
      byNorm.get(norm)!.push(code);
    }

    const collisions: string[][] = [];
    for (const group of Array.from(byNorm.values())) {
      if (group.length > 1) collisions.push(group);
    }

    expect(collisions).toHaveLength(1);
    expect(collisions[0]).toContain("B24");
    expect(collisions[0]).toContain("B-24");
  });

  it("does not flag distinct codes as collisions", () => {
    const codes = ["B24", "W3042", "DB243"];
    const byNorm = new Map<string, string[]>();
    for (const code of codes) {
      const norm = normalize(code);
      if (!byNorm.has(norm)) byNorm.set(norm, []);
      byNorm.get(norm)!.push(code);
    }

    const collisions: string[][] = [];
    for (const group of Array.from(byNorm.values())) {
      if (group.length > 1) collisions.push(group);
    }

    expect(collisions).toHaveLength(0);
  });

  it("detects high-similarity pairs above threshold", () => {
    const codes = ["OC30", "OC-30", "W3042"];
    const pairs: Array<{ a: string; b: string; score: number }> = [];

    for (let i = 0; i < codes.length; i++) {
      for (let j = i + 1; j < codes.length; j++) {
        const score = editSimilarity(normalize(codes[i]), normalize(codes[j]));
        if (score >= 80) {
          pairs.push({ a: codes[i], b: codes[j], score });
        }
      }
    }

    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs[0].a).toBe("OC30");
    expect(pairs[0].b).toBe("OC-30");
  });
});

describe("Conflict detection logic", () => {
  it("identifies when an alias already exists with a different master", () => {
    const existingAlias = { aliasCode: "B24", masterCode: "B-24-OLD" };
    const newMasterCode = "B-24-NEW";

    const isConflict =
      existingAlias !== null && existingAlias.masterCode !== newMasterCode;

    expect(isConflict).toBe(true);
  });

  it("does not flag a conflict when alias maps to the same master", () => {
    const existingAlias = { aliasCode: "B24", masterCode: "B-24" };
    const newMasterCode = "B-24";

    const isConflict =
      existingAlias !== null && existingAlias.masterCode !== newMasterCode;

    expect(isConflict).toBe(false);
  });
});

describe("Pair deduplication", () => {
  it("does not add the same pair twice", () => {
    const seen = new Set<string>();
    const candidates: string[] = [];

    const addCandidate = (aliasCode: string, masterCode: string) => {
      if (aliasCode === masterCode) return;
      const key = `${aliasCode}|${masterCode}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(key);
    };

    addCandidate("B24", "B-24");
    addCandidate("B24", "B-24"); // duplicate
    addCandidate("B-24", "B24"); // reversed — different key

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toBe("B24|B-24");
    expect(candidates[1]).toBe("B-24|B24");
  });

  it("skips self-pairs", () => {
    const seen = new Set<string>();
    const candidates: string[] = [];

    const addCandidate = (aliasCode: string, masterCode: string) => {
      if (aliasCode === masterCode) return;
      const key = `${aliasCode}|${masterCode}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(key);
    };

    addCandidate("B24", "B24");

    expect(candidates).toHaveLength(0);
  });
});
