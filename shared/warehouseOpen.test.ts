import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pickNearestWarehouseZip, type WarehouseRef } from "./availability";
import {
  WOODLAND_SACRAMENTO_WAREHOUSE,
  allWarehousesClosedMessage,
  chooseOpenOriginZips,
  closedWarehouseFallbackZip,
  excludeClosedWarehouseRefs,
  filterOpenOriginZips,
} from "./warehouseOpen";

const dallas = { lat: 32.82, lng: -96.87 };
const seattle = { lat: 47.38, lng: -122.23 };
const nearestClosed = "75247";
const fartherOpen = "98032";

function refs(): WarehouseRef[] {
  return [
    { zip: nearestClosed, coord: dallas },
    { zip: fartherOpen, coord: seattle },
  ];
}

describe("closed warehouses are never the freight origin", () => {
  it("skips a closed warehouse even when it is the nearest", () => {
    const closed = new Set([nearestClosed]);
    const open = excludeClosedWarehouseRefs(refs(), closed);
    expect(pickNearestWarehouseZip(dallas, open)).toBe(fartherOpen);
    expect(open.map((warehouse) => warehouse.zip)).not.toContain(nearestClosed);
  });

  it("restores the nearest warehouse when it is reopened", () => {
    expect(pickNearestWarehouseZip(dallas, excludeClosedWarehouseRefs(refs(), new Set()))).toBe(nearestClosed);
  });

  it("does not fall back to a closed ZIP when every listed warehouse is closed", () => {
    const closed = new Set([nearestClosed, fartherOpen]);
    const choice = chooseOpenOriginZips({
      styleOriginZips: [nearestClosed, fartherOpen],
      distributorOriginZips: [nearestClosed],
      closedZips: closed,
    });
    expect(choice.allListedWarehousesClosed).toBe(true);
    expect(choice.originZips).toEqual([]);
    expect(choice.closedListedZips).toEqual([nearestClosed, fartherOpen]);
    expect(closedWarehouseFallbackZip("75001", closed)).toBe("75001");
    expect(closedWarehouseFallbackZip(nearestClosed, closed)).toBeNull();
    expect(allWarehousesClosedMessage("Shaker White", choice.closedListedZips)).toContain("every warehouse for this style is closed");
    expect(allWarehousesClosedMessage("Shaker White", choice.closedListedZips)).toContain(nearestClosed);
  });

  it("keeps an open style origin and ignores a nearer closed one", () => {
    const choice = chooseOpenOriginZips({
      styleOriginZips: [nearestClosed, fartherOpen],
      distributorOriginZips: ["30303"],
      closedZips: new Set([nearestClosed]),
    });
    expect(choice.originZips).toEqual([fartherOpen]);
    expect(choice.allListedWarehousesClosed).toBe(false);
  });

  it("uses the distributor list only when the style lists no origins of its own", () => {
    const choice = chooseOpenOriginZips({
      styleOriginZips: [],
      distributorOriginZips: [nearestClosed, fartherOpen],
      closedZips: new Set([nearestClosed]),
    });
    expect(choice.originZips).toEqual([fartherOpen]);
  });

  it("treats a ZIP with no warehouse row as open", () => {
    expect(filterOpenOriginZips(["75247", "95691"], new Set())).toEqual(["75247", "95691"]);
  });
});

describe("0287 Woodland Sacramento seed", () => {
  const sql = readFileSync(resolve(process.cwd(), "docs/sql/0287_warehouses_open_closed.tidb.sql"), "utf8");

  it("inserts the Sacramento warehouse closed and does not add its ZIP to an origin list", () => {
    expect(WOODLAND_SACRAMENTO_WAREHOUSE).toMatchObject({
      distributorId: 180001,
      zip: "95691",
      name: "Woodland Sacramento",
      address: "2925 Ramco St, West Sacramento CA 95691",
      isOpen: false,
    });
    expect(sql).toContain("180001, '95691', 'Woodland Sacramento', '2925 Ramco St, West Sacramento CA 95691', 0");
    expect(sql).toContain("INSERT IGNORE INTO cabinet_dealz.warehouses");
    expect(sql).not.toMatch(/UPDATE\s+cabinet_dealz\.distributors/i);
    expect(sql).not.toMatch(/UPDATE\s+cabinet_dealz\.door_styles/i);
    expect(sql).toContain("information_schema.tables");
    expect(sql).toContain("zipOnDistributor");
    expect(sql).toContain("zipOnStyles");
    expect(sql).toContain("woodlandOpen");
  });
});
