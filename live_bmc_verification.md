# Live BMC-27 Verification

On 2026-08-14, the published route `https://www.cabinetdealz.com/catalog/BMC-27?verify=21cf679a` completed loading and displayed the authoritative microwave-base configuration.

The page identifies BMC-27 as **Microwave Base Cabinet**, shows **Drawers: 1**, and the visible catalog illustration has a top appliance opening with a single full-width lower drawer. The rendered page content does not display a two-door layout, Left Door, or Right Door panels.

The published BMC30 route `https://www.cabinetdealz.com/catalog/BMC30?verify=21cf679a` likewise identifies **Microwave Base Cabinet**, lists **Drawers: 1**, and visibly renders a top appliance opening above one full-width lower drawer. It does not display any door count or left/right door panels.

The same published catalog family contains one canonical **BA-24 — 24" Base End Cabinet — 45° Angled Front** card, with no BEC-24 duplicate card visible in the displayed base-cabinet list.

The published legacy route `/catalog/BEC-24?verify=21cf679a` returned **Cabinet Not Found** during the first production check. A second check after checkpoint `53e1719d` returned the same result, although the active local server resolves the alias correctly. The production route is still serving a stale or different detail resolver and needs a route-level client fallback before the merge can be considered complete.
