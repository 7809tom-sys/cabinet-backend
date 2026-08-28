import { describe, expect, it } from "vitest";
import {
  buildDistributorRoundTripCsv,
  DISTRIBUTOR_ROUND_TRIP_HEADERS,
  parseDistributorRoundTripCsv,
  splitRoundTripCodes,
} from "./distributorRoundTrip";

describe("distributor round-trip CSV", () => {
  it("exports every alias and eligible distributor in a re-uploadable versioned file", () => {
    const csv = buildDistributorRoundTripCsv([{
      templateVersion: "1",
      itemCode: "B-24",
      replacementMasterCode: null,
      aliases: ["b24", "B-24", "BASE 24"],
      eligibleDistributorCodes: ["preston", "MADISON", "PRESTON"],
      description: '24" Base, standard',
      category: "Base",
      subCategory: "Base Cabinets",
    }]);
    expect(csv.split("\n")[0]).toBe(DISTRIBUTOR_ROUND_TRIP_HEADERS.join(","));
    expect(csv).toContain('"24"" Base, standard"');
    const parsed = parseDistributorRoundTripCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([expect.objectContaining({
      itemCode: "B-24",
      aliases: ["B-24", "B24", "BASE 24"],
      eligibleDistributorCodes: ["MADISON", "PRESTON"],
    })]);
  });

  it("normalizes semicolon-delimited codes without retaining blank or duplicate entries", () => {
    expect(splitRoundTripCodes(" Preston ; ; MADISON;preston ")).toEqual(["MADISON", "PRESTON"]);
  });

  it("rejects files without the complete contract or a supported template version", () => {
    expect(parseDistributorRoundTripCsv("ItemCode,Aliases\nB-24,B24").errors.join(" ")).toMatch(/Missing required/);
    const wrongVersion = [DISTRIBUTOR_ROUND_TRIP_HEADERS.join(","), "2,B-24,,,Base,"].join("\n");
    expect(parseDistributorRoundTripCsv(wrongVersion).errors.join(" ")).toMatch(/unsupported TemplateVersion/);
  });

  it("carries an explicit optional master-code replacement through the same round-trip file", () => {
    const csv = [DISTRIBUTOR_ROUND_TRIP_HEADERS.join(","), "1,B-24,B-24-NEW,B24,PRESTON,Base cabinet,Base,"] .join("\n");
    const parsed = parseDistributorRoundTripCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toEqual(expect.objectContaining({ itemCode: "B-24", replacementMasterCode: "B-24-NEW" }));
  });

  it("keeps earlier version-one downloads uploadable when they do not have the optional replacement column", () => {
    const oldHeaders = DISTRIBUTOR_ROUND_TRIP_HEADERS.filter((header) => header !== "ReplacementMasterCode");
    const csv = [oldHeaders.join(","), "1,B-24,B24,PRESTON,Base cabinet,Base,"].join("\n");
    const parsed = parseDistributorRoundTripCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toEqual(expect.objectContaining({ replacementMasterCode: null, aliases: ["B24"] }));
  });
});
