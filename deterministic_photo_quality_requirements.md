# Deterministic Photo Quality Requirements

## Decision

The previous image-to-image Photo Quality workflow is not acceptable as the authoritative final kitchen image. It returned a near-copy of the reference and external AI trials did not preserve the Hickory kitchen faithfully. CabinetDealz must use a deterministic scene renderer for the authoritative image.

## Immutable scene contract

The deterministic renderer must consume the existing saved Designer scene and preserve the following without inference or substitution:

| Locked input | Required behavior |
| --- | --- |
| Room polygon, wall heights, openings, islands, pony walls, furniture | Render the saved geometry exactly; do not add, remove, move, resize, or reinterpret an item |
| Cabinet SKU, dimensions, position, rotation, filler, crown, toe kick, door profile, appliance position | Reuse the current Three.js construction transforms and catalog identity |
| Hickory and other selected cabinet finishes | Use the approved material field and PBR maps; never use a product card or staged-room photo as a texture |
| Flooring, countertop, and backsplash | Use the selected product’s approved repeatable material, physical module transforms, and exact support coverage |
| Camera | Preserve the saved position, target, zoom, projection, and aspect ratio |
| Plan metadata | Keep selected product IDs, prices, product names, and source provenance unchanged |

## Required output characteristics

The renderer must create a high-resolution image from the current scene rather than use an AI reinterpretation. It must use deterministic lighting, shadows, tone mapping, material profiles, and an explicitly locked camera. A result may be described as Photo Quality only if it is generated through this deterministic path and shows materially better output than the standard live 3D view.

## Current implementation findings

The live Three.js scene already contains a physical material system, ACES tone mapping, PMREM room environment, shadows, and an exact saved-camera restore. The present Photo Quality reference capture is a 1280×720 JPEG at quality 0.9 and re-renders at device pixel ratio 1, which is insufficient as a production-quality source. The production workflow must render at a larger locked output resolution and use a high-quality material/lighting profile, not submit the capture to an image reinterpretation model.

## Feasibility options

1. **In-app deterministic renderer**: use the current Three.js scene with a dedicated high-resolution offline capture profile and upgraded material/lighting assets. This is the shortest implementation path and preserves current geometry exactly.
2. **External deterministic visual CPQ**: evaluate 3D Cloud after confirming import/export, catalog asset ingestion, and commercial integration. This is a larger platform project.
3. **Desktop architectural renderer**: export the scene to a production renderer such as D5/Unreal for managed final renders. This offers highest physical realism but requires an export pipeline and render infrastructure.

## Guardrails

- Do not present an AI near-copy, style transfer, or screenshot as photo quality.
- Do not use AI to alter cabinet geometry or selected products.
- Do not trigger customer charges during deterministic prototype validation.
- Keep the customer lead and CRM workflow separate from renderer selection until image quality is approved.
