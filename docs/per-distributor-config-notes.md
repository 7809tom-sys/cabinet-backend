# Per-distributor Cabinet Config save (user 10:40, 2026-09-30)

User: "on cabinet config, when you save, you get an option to save for each distributor, not as a total master. So you have to select each distributor you want to apply that rule for whatever cabinet that is. And only that."

## Facts
- Dialog: client/src/components/admin/CabinetConfigAdmin.tsx (2589 lines). Edit dialog component ~line 818 (`row`, `open`, `onClose`, `onSaved`), `draft` state, `handleSave` ~995 → `trpc.cabinets.adminUpdateCabinet` (server/routers/catalog.ts:2034, writes master `cabinets` row). Footer Save button ~2015. Existing per-distributor pattern: `trpc.cabinetOverrides.setImage` with scope "line"|"global" (~910).
- `distributorsForCabinet` = `trpc.cabinets.getDistributorsForCabinet.useQuery({cabinetId: row.id})` (id, name) already in dialog.
- Table `distributor_cabinet_overrides` (drizzle/schema.ts ~2421): unique(distributorId,cabinetId); dims width/height/depth/physicalWidth/weight/pkg*, imageUrl, note. **Added `configJson` text** (schema + drizzle/0165_curly_lethal_legion.sql, applied via webdev_execute_sql 10:45 ✔).
- Router server/routers/cabinetOverrides.ts: `set` upserts dims (overrideInput zod ~line 12), `forCabinet`, `forDistributor`, `setImage`, `delete`, `bulkApply`.
- Read side: server/routers/design.ts `placeableCabinets` (line 210) accepts `distributorId?`/`styleId?`; builds `masterRows` from `cabinets` (~257-297) then `byCanonicalId` (~299-305) → `availableRows`. Need: when distributorId (or styleId→doorStyles.distributorId) is known, left-join/merge `configJson` + dims override onto the master row before availableRows. doorStyles has `distributorId` column.
- Only 3 active distributors: 180001 Skyline Cabinetry, 210001 Ashford, 210002 Madison. 683 cabinets, one row per masterCode (shared across distributors) → master edits hit all distributors today.

## Plan
1. cabinetOverrides router: `setConfig` mutation {cabinetId, distributorIds[], config: {...same config fields as adminUpdateCabinet minus id/masterCode/visibility flags}} → upsert configJson (+ dims columns width/height/depth/physicalWidth/weight/pkg* when present) for each selected distributor only. Also `configForCabinet` query returning per-distributor configJson.
2. Shared helper server/lib/distributorCabinetConfig.ts: `applyDistributorCabinetConfig(masterRow, override)` merging parsed configJson keys over master (only defined non-null keys). Use in design.placeableCabinets (and catalog cabinet detail if distributor known).
3. Dialog: Save button → popover/step "Save for which distributors?" listing distributorsForCabinet with checkboxes (none preselected) + "Apply to master (all distributors)" as explicit separate option. Selected-distributors path calls setConfig; master path calls existing adminUpdateCabinet.
4. Tests: server test for setConfig upsert + placeableCabinets merge (per distributor only; other distributor untouched). UI test file exists: CabinetConfigAdmin.viewport.test.tsx.
5. Validate: vitest focused, pnpm run check, build, diff --check; ledger append; checkpoint.

## Item 6 (user 10:49): Master Changes approval page
- Table `cabinet_master_change_requests` added (schema + drizzle/0166_left_skin.sql, applied 10:51 ✔). Fields: cabinetId, masterCode, sourceDistributorId, submittedBy/Name, status(pending|approved|applied_to_distributor|rejected|undone), changesJson [{field,currentValue,proposedValue}], previousValuesJson, appliedValuesJson, appliedDistributorId, reviewNote, reviewedBy/Name/At, undoneBy/At.
- New router server/routers/masterChanges.ts: submit, list(status), approve(id, editedValues?), applyToDistributor(id, distributorId), reject(id,note), undo(id). approve/undo re-use cabinets.adminUpdateCabinet via createCaller (same validation), never price fields.
- Fit warnings per affected distributor: glass (glassDoorAddonCode set / "glass" in description) on distributor.glassIncluded=false; distributor already has own configJson for the field (rule would be masked).
- "5-day revert list from step 2": no such list exists in the codebase (grep found nothing) → history tab shows "Undo window: last 5 days" filter; flag assumption to user.
- UI: client/src/components/admin/MasterChangesAdmin.tsx, tab "master-changes" in AdminGroupedTabs (Catalog group). CabinetConfig dialog Save → scope picker: distributors checkboxes (setConfig) OR "Request master change" (masterChanges.submit).
- 10:59 state: router server/routers/masterChanges.ts registered as `masterChanges`; dialog patched via /tmp/patch_cc_dialog.py (Save → scope picker: "Save for N selected distributors" = cabinetOverrides.setConfig; "Request master change" = masterChanges.submit; housekeeping-only edits [visibility/altSku/image/code/verify] still save directly); page client/src/components/admin/MasterChangesAdmin.tsx, tab "master-changes" (label "✔ Master Changes") in AdminGroupedTabs Catalog group. User 10:53: master change is the priority. Remaining: tsc, tests (server/lib unit + router smoke), build, browser check on /admin tab, ledger, checkpoint.
- 11:05: tsc clean, build OK, server/masterChanges.test.ts 7/7 pass (self-cleaning). Master Changes tab renders at /admin → Products & Catalog → "✔ Master Changes" (screenshot /tmp/mc-tab-empty.png). Browser check script /tmp/master_changes_check.py (local admin cookie app_session_id from /tmp/local-admin-session.txt, owner openId, 1h expiry, local only). Remaining: fix B12 row selector in script, run, ledger, checkpoint.

## 11:20 user: "it shows no history in the last 5 days. i know thats not correct"
Cause: the 5-day panel only read cabinet_master_change_requests (empty). Real activity in DB last 5d: 72 cabinets.configuredAt, 63 distributor_cabinet_overrides.updatedAt, 80 cost_change_log rows — none were surfaced.
Fix in progress (uncommitted on top of 15c2f5f5):
- New table cabinet_config_change_log (migration drizzle/0167_smiling_puck.sql, applied via webdev_execute_sql). Schema in drizzle/schema.ts (cabinetConfigChangeLog).
- server/lib/cabinetConfigHistory.ts: logCabinetConfigChanges (per-field diff, only real changes), recentCabinetConfigChanges(db,{cabinetId?,days=5}), CONFIG_REVERT_WINDOW_DAYS=5.
- Hooked: catalog.adminUpdateCabinet (master scope, snapshot before update; ctx added), cabinetOverrides.setConfig (distributor scope, previous vs input.config).
- TODO: history query + revert procedure (router), history panel in Cabinet Config tab (client/src/components/admin/CabinetConfigAdmin.tsx near line ~2503 "shown have at least one field configured"), also show pre-log activity (cabinets.configuredAt last 5d + overrides.updatedAt last 5d as "saved, details not recorded before 2026-09-30") so the panel is not empty for older saves. Test + browser check + checkpoint.
- Note: B12 override row (cabinetId 9390002, distributor 180001 Ashford) updatedAt 16:02 by user 999702 = my browser test save (configJson null → harmless).

## 11:33 user "not fixed" (screenshots): the PUBLIC catalog page Edit Cabinet dialog (client/src/pages/CabinetDetail.tsx, e.g. /catalog/W1512GD?style=330014) still has "Save Master Changes (All Distributors)" button + "Save master changes for all distributors?" AlertDialog (confirmMasterSaveOpen ~line 592, footer ~2436, AlertDialog ~2441, submitMasterCabinetChanges, handleSaveEdit). Must become the same per-distributor picker as CabinetConfigAdmin (tick distributors from distCoverage; cabinetOverrides.setConfig; no all-at-once). distCoverage = trpc.genericCabinets.distributorCoverage (items {distributorId,name}).
History fix state: server/lib/cabinetConfigHistory.ts + cabinetOverrides.configHistory/revertConfigChange + client CabinetConfigHistoryPanel mounted in CabinetConfigAdmin; tsc clean; server/cabinetConfigHistory.test.ts passes (3). Still to do: browser check, build, ledger, checkpoint.

## 12:53 CT — "80–100 cabinets missing from history" audit (DB facts)
- cabinets.configuredAt >= 6d: 74 (same set as configVerifiedAt); `cabinets` has no updatedAt column.
- distributor_cabinet_overrides.updatedAt >= 6d: 67 rows / 65 cabinets. Panel showed 75 distinct cabinets total.
- Other 6-day activity: cost_change_log 80 rows (2 SKUs, price not config), code_aliases 23 (test ZQX codes on cabinet 9360006), media_images 144 uploads (all 67 cabinets with recent images already in history).
- Root cause: admin edit paths that update `cabinets` WITHOUT stamping configuredAt or logging: genericCabinets.update (Catalog tab row editor), skuImages.setMasterImage, catalog.adminGenerateCatalogImage / adminFixCabinetImage / adminBulkFixCabinetImages, masterSku.propagateCabinetConfig. Those past edits left no timestamp, so they can't be reconstructed. From now on they go through `updateCabinetLogged()` (server/lib/cabinetConfigHistory.ts: stamps configuredAt + logs field diff). Limits 300→2000; panel header shows distinct cabinet count.
- Not hooked (bulk/system): adminApplySpecsToAll, adminImport/importWithMapping, setConflict/clearConflict, mergeCabinets, bulkMoveCategory, bulkUpdateAliases.
