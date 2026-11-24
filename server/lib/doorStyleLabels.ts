// Names for order lines. Selects only the columns a label needs.
// doorColorSource, doorColorSourceValue, and doorColorSourceUpdatedAt
// (docs/sql/0280_door_color_source.tidb.sql) are intentionally not read here.

import { inArray } from "drizzle-orm";
import { doorStyles } from "../../drizzle/schema";
import { positiveStyleId, type DoorStyleNameFields } from "@shared/orderStyleLabel";
import { getDb } from "../db";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type DoorStyleLabelRow = DoorStyleNameFields & {
  id: number;
  distributorId: number;
};

const labelColumns = {
  id: doorStyles.id,
  distributorId: doorStyles.distributorId,
  ourName: doorStyles.ourName,
  aliasName: doorStyles.aliasName,
  distributorName: doorStyles.distributorName,
  doorStyle: doorStyles.doorStyle,
  color: doorStyles.color,
  finish: doorStyles.finish,
};

export async function loadDoorStyleLabels(
  db: Database,
  styleIds: Array<number | null | undefined>,
): Promise<Map<number, DoorStyleLabelRow>> {
  const ids = Array.from(new Set(styleIds.map((id) => positiveStyleId(id)).filter((id): id is number => id != null)));
  const map = new Map<number, DoorStyleLabelRow>();
  if (ids.length === 0) return map;
  const rows = await db.select(labelColumns).from(doorStyles).where(inArray(doorStyles.id, ids));
  for (const row of rows) map.set(row.id, row);
  return map;
}
