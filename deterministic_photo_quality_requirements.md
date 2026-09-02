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

The live Three.js scene already contains a physical material system, ACES tone mapping, PMREM room environment, shadows, and an exact saved-camera restore. The current 2560×1440 JPEG capture applies maximum texture anisotropy and two render passes, but it is still a deterministic capture of the existing interactive scene rather than a second production renderer.

### Owner visual evaluation — 2026-09-02

The owner confirmed that the captured result is visually the same kitchen image at higher resolution. Displaying the selected door sample and style room-scene image in the dialog did not make either image an active relighting or photorealistic-rendering input. The door sample can only affect the capture if it has already loaded as a texture on the live cabinet faces. The room-scene image is catalog context and is not applied to the capture. Therefore the current feature is correctly described only as a **high-resolution exact 3D preview**. It must not be called Photo Quality, photo-realistic, reference-driven, or a final production render.

The production workflow requires an actual higher-fidelity deterministic renderer with authored PBR material maps, stronger physically consistent lighting, and a fixed output camera. It must not submit the locked scene to an image reinterpretation model.

### Gemini-level acceptance bar — 2026-09-02

The owner supplied a Gemini-rendered kitchen image as the **minimum visual-quality benchmark**. The CabinetDealz production render must approach its natural daylight balance, cabinet depth, countertop reflection, mosaic definition, floor detail, appliance realism, contact shadows, and clean enlarged image quality. The Gemini image is a visual-quality benchmark only; it must never replace the saved CabinetDealz layout, insert or remove cabinets or openings, substitute products or material identities, or alter the saved camera. Any render below this bar remains an internal administrator test and cannot be called Photo Quality or exposed as a customer final render.

## Production-candidate acceptance contract

| Area | Required testable condition | Failure outcome |
| --- | --- | --- |
| Scene and camera | The candidate is built from a cloned live Three.js scene and cloned saved camera; no generated or reference-image geometry may be inserted. | Reject the candidate. |
| Product identity | Each cabinet, countertop, flooring, backsplash, appliance, fixture, and opening remains tied to the locked scene/provenance identity. | Reject the candidate. |
| Material source | Only the selected product’s approved material swatch or a declared deterministic safe fallback may be used. Catalog room photos and product-card imagery remain display-only. | Reject the candidate. |
| Lighting | A deterministic physical studio/daylight rig may be added only to the clone; it may not change the original saved scene or claim to be the catalog room-scene image. | Internal candidate only until visually approved. |
| Output quality | The candidate must render at least 1920×1080, use a converged sampling profile, preserve material detail after denoising, and provide the full-resolution file for enlarged review. | Keep as an internal test. |
| Visual approval | The owner must approve natural lighting, material depth, cabinetry, surfaces, appliances, shadows, reflections, and enlargement quality against the Gemini benchmark. | Do not use the Photo Quality label or customer workflow. |

## Feasibility options

1. **In-app deterministic renderer**: use the current Three.js scene with a dedicated high-resolution offline capture profile and upgraded material/lighting assets. This is the shortest implementation path and preserves current geometry exactly.
2. **External deterministic visual CPQ**: evaluate 3D Cloud after confirming import/export, catalog asset ingestion, and commercial integration. This is a larger platform project.
3. **Desktop architectural renderer**: export the scene to a production renderer such as D5/Unreal for managed final renders. This offers highest physical realism but requires an export pipeline and render infrastructure.

## Guardrails

- Do not present an AI near-copy, style transfer, or screenshot as photo quality.
- Do not use AI to alter cabinet geometry or selected products.
- Do not trigger customer charges during deterministic prototype validation.
- Keep the customer lead and CRM workflow separate from renderer selection until image quality is approved.
