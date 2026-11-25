// Admin CRM: upload a cabinet shop list (affiliate library "Cabinet Shops in
// <State>" spreadsheet shape). The browser maps the columns and sends plain
// rows; the server re-plans them against the cabinet shops already in the
// house CRM (match on name + state or website host) so a re-upload adds
// nothing. dryRun returns the preview without writing.

import {
  CABINET_SHOP_COMPANY,
  CABINET_SHOP_MARKER_PREFIX,
  cabinetShopMarker,
  planCabinetShopImport,
  type CabinetShopDealValues,
  type CabinetShopImportPlan,
  type CabinetShopRow,
  type ExistingCabinetShop,
} from "@shared/crmCabinetShopImport";

export type CabinetShopImportStore = {
  /** House CRM rows tagged as cabinet shops (company prefix or list marker). */
  loadExisting(): Promise<ExistingCabinetShop[]>;
  insert(rows: CabinetShopDealValues[]): Promise<void>;
};

export type CabinetShopImportResult = {
  dryRun: boolean;
  marker: string;
  inserted: number;
  toImport: number;
  byState: CabinetShopImportPlan["byState"];
  duplicates: CabinetShopImportPlan["duplicates"];
  skipped: CabinetShopImportPlan["skipped"];
};

export const CABINET_SHOP_INSERT_CHUNK = 200;

export async function importCabinetShops(
  store: CabinetShopImportStore,
  input: { rows: CabinetShopRow[]; sourceDoc: string; defaultState?: string | null; dryRun: boolean; now?: Date },
): Promise<CabinetShopImportResult> {
  const marker = cabinetShopMarker((input.now ?? new Date()).toISOString());
  const existing = await store.loadExisting();
  const plan = planCabinetShopImport(input.rows, existing, { marker, sourceDoc: input.sourceDoc, defaultState: input.defaultState });
  let inserted = 0;
  if (!input.dryRun) {
    for (let i = 0; i < plan.toInsert.length; i += CABINET_SHOP_INSERT_CHUNK) {
      const chunk = plan.toInsert.slice(i, i + CABINET_SHOP_INSERT_CHUNK);
      await store.insert(chunk);
      inserted += chunk.length;
    }
  }
  return {
    dryRun: input.dryRun,
    marker,
    inserted,
    toImport: plan.toInsert.length,
    byState: plan.byState,
    duplicates: plan.duplicates,
    skipped: plan.skipped,
  };
}

export const CABINET_SHOP_EXISTING_LIKE = {
  company: `${CABINET_SHOP_COMPANY}%`,
  notes: `%${CABINET_SHOP_MARKER_PREFIX}%`,
};
