# Live BMC-27 Verification

On 2026-08-14, the published route `https://www.cabinetdealz.com/catalog/BMC-27?verify=21cf679a` completed loading and displayed the authoritative microwave-base configuration.

The page identifies BMC-27 as **Microwave Base Cabinet**, shows **Drawers: 1**, and the visible catalog illustration has a top appliance opening with a single full-width lower drawer. The rendered page content does not display a two-door layout, Left Door, or Right Door panels.

The published BMC30 route `https://www.cabinetdealz.com/catalog/BMC30?verify=21cf679a` likewise identifies **Microwave Base Cabinet**, lists **Drawers: 1**, and visibly renders a top appliance opening above one full-width lower drawer. It does not display any door count or left/right door panels.

The same published catalog family contains one canonical **BA-24 — 24" Base End Cabinet — 45° Angled Front** card, with no BEC-24 duplicate card visible in the displayed base-cabinet list.

The published legacy route `/catalog/BEC-24?verify=21cf679a` returned **Cabinet Not Found** during the first production check. A second check after checkpoint `53e1719d` returned the same result, although the active local server resolves the alias correctly. The production route is still serving a stale or different detail resolver and needs a route-level client fallback before the merge can be considered complete.

After checkpoint `203133f6`, the live canonical route `/catalog/BEC-24?verify=203133f6` loaded successfully as **BEC-24 — 24" Base End Cabinet — 45° Angled Front**. The visible catalog list contains one BEC-24 card and no BA-24 card, confirming the published canonical identity and catalog deduplication.

The retained `/catalog/BA-24?verify=203133f6` alias route also loaded the same merged product and the catalog still displayed only one BEC-24 card. The page chrome retained BA-24 in the alias URL breadcrumb and legacy spec image label, so the detail display should next prefer the resolved canonical master code after an alias lookup.

After checkpoint `4cd71723`, `/catalog/BA-24?verify=4cd71723` still loaded the one canonical product and the catalog list still contained only BEC-24. The page retained BA-24 in the alias breadcrumb and legacy spec-image artwork during this immediate edge check, indicating the custom-domain client bundle has not yet reflected the latest display revision; the canonical direct BEC-24 page remains correct.

Live verification at https://www.cabinetdealz.com/catalog/BMC-27?verify=587f27e4 confirms the corrected BMC-27 detail route now reports **Type: Microwave Base Cabinet**, **Drawers: 1**, and the product illustration shows a top appliance opening above one bottom drawer. The page contains no Doors specification or Left/Right Door layout labels.

Live verification at https://www.cabinetdealz.com/catalog/BEC-24?verify=587f27e4 confirms the canonical merged detail page now visibly uses **BEC-24**. It lists a 24.00-inch by 24.00-inch Base End Cabinet with a 45-degree angled front, 34.50-inch height, and two doors. The catalog list contains one BEC-24 card and no BA-24 duplicate.
