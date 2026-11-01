import { describe, expect, it } from "vitest";
import {
  doorStyleOwnWarehouseZipWrite,
  doorStyleWarehouseCoverage,
} from "./doorStyleWarehouseCoverage";

const vendorCoverage = ["75001", "30301", "60601"];

describe("door style warehouse coverage", () => {
  it("inherits vendor coverage when the style has no zips of its own", () => {
    expect(doorStyleWarehouseCoverage({
      warehouseZip: null,
      warehouseZips: null,
      distributorWarehouseZips: ["75001", " 30301 ", "75001", "bad", "1234", "30301-1234"],
    })).toEqual({
      distributorWarehouseZips: ["75001", "30301"],
      effectiveWarehouseZips: ["75001", "30301"],
      warehouseZipsInherited: true,
    });
  });

  it("inherits when the style list is empty, including a JSON string from the driver", () => {
    expect(doorStyleWarehouseCoverage({
      warehouseZip: "",
      warehouseZips: "[]",
      distributorWarehouseZips: JSON.stringify(vendorCoverage),
    })).toEqual({
      distributorWarehouseZips: vendorCoverage,
      effectiveWarehouseZips: vendorCoverage,
      warehouseZipsInherited: true,
    });
  });

  it("keeps the style's own zips and still reports vendor coverage beside them", () => {
    const coverage = doorStyleWarehouseCoverage({
      warehouseZip: "10001",
      warehouseZips: ["10002", "10001", "10002"],
      distributorWarehouseZips: vendorCoverage,
    });
    expect(coverage.warehouseZipsInherited).toBe(false);
    expect(coverage.effectiveWarehouseZips).toEqual(["10002", "10001"]);
    expect(coverage.distributorWarehouseZips).toEqual(vendorCoverage);
  });

  it("treats a legacy warehouseZip as the style's own origin", () => {
    const coverage = doorStyleWarehouseCoverage({
      warehouseZip: "30303",
      warehouseZips: [],
      distributorWarehouseZips: vendorCoverage,
    });
    expect(coverage.warehouseZipsInherited).toBe(false);
    expect(coverage.effectiveWarehouseZips).toEqual(["30303"]);
    expect(coverage.distributorWarehouseZips).toEqual(vendorCoverage);
  });

  it("keeps the vendor primary zip first and does not merge it into an explicit style list", () => {
    const coverage = doorStyleWarehouseCoverage({
      warehouseZips: ["10001"],
      distributorWarehouseZips: ["60601", "75201", "60601"],
    });
    expect(coverage.distributorWarehouseZips).toEqual(["60601", "75201"]);
    expect(coverage.effectiveWarehouseZips).toEqual(["10001"]);
    expect(coverage.warehouseZipsInherited).toBe(false);
  });

  it("reports inheritance with an empty effective list when neither side has coverage", () => {
    expect(doorStyleWarehouseCoverage({
      warehouseZips: null,
      distributorWarehouseZips: null,
    })).toEqual({
      distributorWarehouseZips: [],
      effectiveWarehouseZips: [],
      warehouseZipsInherited: true,
    });
  });

  it("stores an empty style list as empty instead of copying vendor zips", () => {
    expect(doorStyleOwnWarehouseZipWrite([])).toEqual({ warehouseZips: null, warehouseZip: null });
    expect(doorStyleOwnWarehouseZipWrite(null)).toEqual({ warehouseZips: null, warehouseZip: null });
    expect(doorStyleOwnWarehouseZipWrite(["", "   "])).toEqual({ warehouseZips: null, warehouseZip: null });
    const written = doorStyleOwnWarehouseZipWrite([]);
    expect(written.warehouseZips).toBeNull();
    expect(written.warehouseZip).toBeNull();
    expect(written.warehouseZips).not.toEqual(vendorCoverage);
  });

  it("stores only the submitted style list, with the first zip as the legacy primary", () => {
    expect(doorStyleOwnWarehouseZipWrite(["10002", "10001", "10002", " "])).toEqual({
      warehouseZips: ["10002", "10001"],
      warehouseZip: "10002",
    });
  });
});
