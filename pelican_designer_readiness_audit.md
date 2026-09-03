# Pelican Designer-Readiness Audit

## Scope

This audit covers Pelican products only. It does not alter cabinetry, cabinet placement, cabinet prices, cabinet catalog records, or the existing kitchen plan.

## Initial Finding — 2026-09-03

The current `showInDesigner` setting is a **palette-visibility flag**, not an exact-3D-readiness certification. Active designer-enabled products can appear in the Designer picker even when the imported record does not contain enough reliable data to produce an exact physical product in the kitchen scene.

The initial database inventory shows significant readiness gaps. Among active, priced, designer-enabled products, the catalog currently records an explicit `size` for only a minority of core fixtures: 82 of 295 sinks and 5 of 96 faucets. Quartz has 35 of 35 explicit sizes, while only 3 of 86 flooring items and 7 of 43 mosaics currently have an approved material-only swatch. Catalog images are not approved 3D assets and must remain display-only.

| Requirement for exact in-kitchen representation | Current state | Consequence |
|---|---|---|
| Verified width, depth, height, and relevant installation dimensions | Incomplete across sinks, faucets, and many fixture categories | The product must not be claimed as an exact fitted 3D object. |
| Placement rule and compatible host | Not recorded as structured Pelican product data | The application cannot safely determine which sink base, countertop cutout, wall, or bath location is compatible. |
| Approved material-only surface swatch | Available for a limited subset of floors, tile/mosaics, and quartz | A raw catalog image cannot be mapped into the 3D kitchen. |
| Approved 3D geometry or a verified parametric product profile | Not represented in the current Pelican schema | A selected sink, faucet, or fixture cannot yet be shown as its exact chosen model. |

## Proposed Readiness Gate

A Pelican product may be labeled **Exact 3D Ready** only when all of the following are verified and stored against that product:

1. The original product code and source record are retained.
2. Required dimensions are verified from a manufacturer or Pelican technical source, including the fields needed for its product type.
3. A supported placement role and compatibility rule are defined.
4. A faithful approved 3D product model or a measured parametric profile is available; catalog photography alone is never sufficient.
5. Surface products additionally require a separately approved `materialImageUrl` before their exact finish appears in 3D.

## Next Audit Slice

The first implementation slice should be **kitchen sinks and faucets**. It should begin with one product at a time, starting with products that have a verifiable technical sheet and clear dimensional compatibility with a known sink base. Only after verification should that exact product become selectable for exact 3D placement.
