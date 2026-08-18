# 3D Visual Asset Findings

- **LS3612** has a verified Cabinet Config catalog image, but that asset is a 250×250 line drawing of the Lazy Susan cabinet rather than a photorealistic surface texture. It must not replace the selected feature-style door sample as a generic face texture.
- **Natura Maple (Ashford)** supplies a full Shaker door sample at `/manus-storage/media-library/1785437970467_designer_natural_door_e92f1e17`; that supplied sample contains the intended complete door face and should be used unaltered on visible door and drawer fronts.
- The reported live result remains generic despite the source asset being available, so the next correction must target the material attached to the exact visible face meshes, not the catalog metadata or a new fallback asset.

## Root Cause Analysis (Aug 18, 2026)

### Bug 1: "Selecting a different cabinet changes the active feature style"
- `selectCabinet()` at line 3794 only calls `setSelectedUid(uid)` — it does NOT call `setStyleId()`.
- The global `styleId` state is unchanged when a cabinet is selected.
- However, the `cabinetFrontVisuals` prop maps each cabinet UID → its `catalogImageUrl` (a line-art drawing).
- In the scene build (line 3167), `resolvedPlacedCabinetFrontVisual()` replaces `baseSku.catalogImageUrl` with the live catalog image.
- In `addCabinet()` (line 1250), when `!doorTexture` (the door sample texture hasn't loaded yet or failed), the `catalogFrontVisualUrl` (line-art) is applied as a front overlay, making the cabinet look "generic" or different from the selected style.
- The user perceives this as "the style changed" because the cabinet face shows a line-art drawing instead of the door sample texture.

### Bug 2: "3D texture must follow the admin panel door sample, never generic"
- `activeDoorTexture` is resolved via `resolvedThreeDDoorSampleUrl("catalog", catalogDoorSampleUrl, renderExistingDesign)`.
- `catalogDoorSampleUrl` is `paletteFinishSwatch || active3DDoorSampleUrl` from DesignTool.tsx line 5304.
- Both derive from `doorStyles.doorSampleImageUrl` for the active `styleId`.
- The `activeDoorTexture` URL is correct and non-null when a door sample exists.
- BUT: `addCabinet()` loads the texture asynchronously via `THREE.TextureLoader.load()`.
- The `catalogFrontVisualUrl` overlay (line 1250) is gated on `!doorTexture`, which is the THREE.Texture object.
- Since `doorTexture` is created synchronously (the TextureLoader.load returns a Texture immediately), `doorTexture` should be non-null.
- The REAL issue: `catalogFrontVisualUrl` should NEVER be used when `doorSampleUrl` is provided. The condition should be `!doorSampleUrl` (the URL string), not `!doorTexture` (the loaded texture object).
- Additionally, the `catalogFrontVisualUrl` (Cabinet Config line-art) should never override the admin panel door sample as a face texture.

### Fix Plan
1. Change the `catalogFrontVisualUrl` guard from `!doorTexture` to `!doorSampleUrl` — if a door sample URL exists from the admin panel, NEVER apply the catalog line-art overlay.
2. This ensures the admin panel `door_styles.doorSampleImageUrl` is always the sole authoritative face texture.
3. The `selectCabinet` callback already does not change the style — the visual change was caused by the line-art overlay appearing on cabinets that had a `catalogImageUrl` but whose door texture hadn't been applied yet.
