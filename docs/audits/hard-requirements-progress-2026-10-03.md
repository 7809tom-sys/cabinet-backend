# Hard-requirements task progress (2026-10-03 09:29 CT)

## Facts
- ERB36 (cabinet id 9360042) priced on **Skyline Cabinetry** (27 style rows). BER36 (id 9390244) priced on **Madison** (dist 210002, 24 style rows, e.g. style 330014 Shaker White list 1021 / cost 251.27).
- Equivalence tables: cabinet_code_equivalences + design_missing_price_events (migration drizzle/0170_faithful_ken_ellis.sql applied; ERB/BER + BT9 rows seeded).
- Server: shared/codeEquivalence.ts (CodeEquivalenceGroups, allGroups()), server/lib/codeEquivalenceLoader.ts, design.priceForCabinetsByStyles returns resolvedMasterCode + aliasSwapped; server/routers/designMissingPrice.ts (logMissing, adminList, adminResolve, adminEquivalences {groups, explicitRows}, alternatives). shared/nomenclatureFamily.ts (family tagger + Part 4 ranking; code-prefix first).
- Client: client/src/lib/designMissingPrice.ts (+test), DesignTool.tsx (missingPriceSummary, logMissing effect, checkout gates in addAllToCart/syncThreeDOrderWithCart + both cart buttons, banners data-testid missing-price-banner / missing-price-banner-mobile / missing-price-checkout-blocked, popover mount near placementWarning overlay, acceptMissingPriceAlternative uses reseatOnWallRun), PlanCanvas (missingPriceUids prop, data-price-missing, price-missing-indicator badge), InteractiveRoom3D (missingPriceUids prop, red BoxHelper outlines "cabinet-price-missing-outline"), DesignMaterialsListDialog (missingPriceUids/missingPriceCount, materials-price-missing-flag, materials-missing-price-banner, add button disabled), DesignMissingPricePopover.tsx (Part 4), admin tab "designer-price-flags" -> DesignerPriceFlagsAdmin.tsx.
- `pnpm run check` passes. Focused tests pass except pre-existing PlanCanvas.automaticSnapping source-string test (fails at HEAD too).
- Build started: /tmp/build_p1.log (look for BUILD_EXIT=).
- cabinets table has NO cornerType column at DB level?? (query error 'cb.cornertype' unknown) — but drizzle schema uses cabinets.cornerType in designMissingPrice.ts; VERIFY actual column name (maybe corner_type mapped). Query used raw SQL so needs snake_case.
- Pre-existing unrelated TS watcher errors about refrigerator imports are stale (real tsc passes).

## Remaining
1. Build result; git diff --check.
2. Local Playwright proof (/tmp/missing_price_proof.py): seed draft with ERB36 on Madison Shaker White (styleId 330014, lockedDistributorId 210002) -> expect price + resolved BER36; seed a Designer cabinet lacking a 330014 price -> expect data-price-missing, banner, cart disabled, materials flag; click flagged cabinet -> popover alternatives -> Accept -> list updates.
3. Ledger append todo-alvsvcze.md; checkpoint; wait deploy; live proof on www.cabinetdealz.com; record DesignTool-*.js bundle name; docs checkpoint; report (Part 2 report already in docs/erb-ber-alias-diagnosis.md).
