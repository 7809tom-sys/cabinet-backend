import { describe, expect, it } from "vitest";
import {
  aliasesByVisibleCabinet,
  filterByAliasSearchRank,
  rankCabinetAliasMatches,
} from "./cabinetAliasSearch";

const BT9_ALIASES = "B9; BFH9; BT-09; BT09; BSR9; FHB09; FHBO9; TBO9; FH9";

const spreadsheetRows = [
  {
    id: 10,
    itemCode: "BT-09",
    replacementMasterCode: "BT9",
    aliases: [BT9_ALIASES],
    description: "Tray Base 9",
  },
  {
    id: 11,
    itemCode: "DECOY",
    replacementMasterCode: null,
    aliases: ["BT9"],
    description: "Lists the replacement master as its own alias",
  },
  {
    id: 12,
    itemCode: "FH90",
    replacementMasterCode: null,
    aliases: [],
    description: "A longer code that only partially overlaps FH9",
  },
];

function masterCodesFor(query: string): string[] {
  const ranks = rankCabinetAliasMatches(spreadsheetRows, query);
  return filterByAliasSearchRank(spreadsheetRows, ranks).map((row) => (
    row.replacementMasterCode?.trim() || row.itemCode
  ));
}

describe("cabinet alias search", () => {
  it("returns BT9 when the query is FH9 or BT-09", () => {
    expect(masterCodesFor("FH9")[0]).toBe("BT9");
    expect(masterCodesFor("BT-09")).toEqual(["BT9"]);
  });

  it("matches alias codes without regard to case, dashes, or spaces", () => {
    expect(masterCodesFor("bt09")).toEqual(["BT9"]);
    expect(masterCodesFor("BT09")).toEqual(["BT9"]);
    expect(masterCodesFor(" bt-09 ")).toEqual(["BT9"]);
    expect(masterCodesFor("BT 09")).toEqual(["BT9"]);
    expect(masterCodesFor("fh9")[0]).toBe("BT9");
  });

  it("ranks an exact item code ahead of an exact alias, then partial matches", () => {
    const ranks = rankCabinetAliasMatches(spreadsheetRows, "BT9");
    const ordered = filterByAliasSearchRank(spreadsheetRows, ranks);
    expect(ordered.map((row) => row.id)).toEqual([10]);
    expect(ranks?.get(10)).toBe(0);

    const aliasRanks = rankCabinetAliasMatches(spreadsheetRows, "FH9");
    const aliasOrdered = filterByAliasSearchRank(spreadsheetRows, aliasRanks);
    expect(aliasOrdered.map((row) => row.id)).toEqual([10, 12]);
    expect(aliasRanks?.get(10)).toBe(1);
    expect(aliasRanks?.get(12)).toBe(2);
  });

  it("resolves an alias equal to a row's ReplacementMasterCode to that master", () => {
    const ranks = rankCabinetAliasMatches(spreadsheetRows, "BT9");
    expect(ranks?.has(11)).toBe(false);
    expect(masterCodesFor("BT9")).toEqual(["BT9"]);
  });

  it("reads semicolon-separated alias fields already stored on the cabinet", () => {
    const visible = [
      { id: 10, masterCode: "BT9", description: "Tray Base 9" },
      { id: 12, masterCode: "B24", description: "Base 24" },
    ];
    const aliases = aliasesByVisibleCabinet({
      visible,
      fieldRows: [{ id: 10, masterCode: "BT9", altSku1: BT9_ALIASES }],
      cabinetAliasRows: [{ cabinetId: 95, alias: "BSR9", ownerMasterCode: "BT-09" }],
      skuMasterAliases: [{ aliasCode: "FHB09", masterCode: "BT9" }],
    });
    const rows = visible.map((row) => ({
      id: row.id,
      itemCode: row.masterCode,
      description: row.description,
      aliases: aliases.get(row.id) ?? [],
    }));

    expect(filterByAliasSearchRank(rows, rankCabinetAliasMatches(rows, "FH9")).map((row) => row.itemCode)).toEqual(["BT9"]);
    expect(filterByAliasSearchRank(rows, rankCabinetAliasMatches(rows, "BT-09")).map((row) => row.itemCode)).toEqual(["BT9"]);
    expect(filterByAliasSearchRank(rows, rankCabinetAliasMatches(rows, "FHB09")).map((row) => row.itemCode)).toEqual(["BT9"]);
  });

  it("follows alias fields stored on a variant whose code already points at the master", () => {
    const visible = [{ id: 10, masterCode: "BT9", description: "Tray Base 9" }];
    const aliases = aliasesByVisibleCabinet({
      visible,
      fieldRows: [{ id: 95, masterCode: "BT-09", altSku1: BT9_ALIASES }],
      cabinetAliasRows: [],
      skuMasterAliases: [{ aliasCode: "BT-09", masterCode: "BT9" }],
    });
    const rows = visible.map((row) => ({
      id: row.id,
      itemCode: row.masterCode,
      description: row.description,
      aliases: aliases.get(row.id) ?? [],
    }));
    expect(filterByAliasSearchRank(rows, rankCabinetAliasMatches(rows, "FH9")).map((row) => row.itemCode)).toEqual(["BT9"]);
    expect(filterByAliasSearchRank(rows, rankCabinetAliasMatches(rows, "BT-09")).map((row) => row.itemCode)).toEqual(["BT9"]);
  });
});
