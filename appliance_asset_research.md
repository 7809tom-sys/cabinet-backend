# Realistic Appliance Asset Research

## Early source findings

| Source | What it provides | Suitability for Cabinet Dealz | Initial licensing conclusion |
|---|---|---|---|
| [Khronos glTF Sample Assets — Commercial Refrigerator](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/CommercialRefrigerator/README.md) | A high-detail e-commerce commercial refrigerator in glTF with animation and advanced material features | **Reference implementation only.** Its glTF and PBR workflow are directly compatible with browser 3D, but its form factor is not a standard residential refrigerator | The model page states **CC BY 4.0**, so reuse requires attribution and review of the full terms |
| [BIMobject — Kitchen Appliances](https://www.bimobject.com/en-us/categories/kitchen/appliances?software=sketchup) | Manufacturer-specific appliance listings, including AEG, Fisher & Paykel, Häfele, ovens, refrigerators, hoods, and cooktops | **Strong sourcing channel for dimension and product-reference validation.** Browser delivery needs format conversion, decimation, and per-object permission verification | Do not import or redistribute downloaded assets until the specific manufacturer/BIMobject terms and intended web-display rights are approved |
| [Sketchfab Licenses](https://sketchfab.com/licenses) and [license guidance](https://support.fab.com/s/article/Choosing-your-model-s-license) | Downloadable models under Creative Commons and paid commercial/standard terms | **Potential source for generic appliance families**, not for unverified branded catalog matches | Use only an asset whose specific license allows the intended commercial website display; comply with attribution requirements for Creative Commons assets |
| [glTF Transform](https://gltf-transform.dev/) | Tooling to read, optimize, and write glTF 2.0 assets | **Recommended technical delivery path** for approved GLB/glTF files before browser loading | Asset licensing is separate from format optimization; apply mesh, texture, and unused-data optimization after rights are cleared |

## Interim direction

Cabinet Dealz should not bulk-import unreviewed marketplace or BIM files into the public 3D viewer. The recommended direction is a licensed **appliance family library** with a small set of optimized glTF/GLB assemblies—front-control range, rear-control range, refrigerator, dishwasher, microwave, oven, and hood—parameterized by the existing catalog variant resolver. Manufacturer BIM/3D files can be used as dimension and modeling references only until their redistribution terms are cleared.

Before any external asset is shipped, document its source URL, author/manufacturer, exact license, attribution text where required, allowed web-display scope, model dimensions, texture resolution, triangle count, optimized GLB size, and mapped Cabinet Dealz appliance variant.

## Confirmed operating constraints

[Sketchfab’s license page](https://sketchfab.com/licenses) distinguishes commercial standard licenses from editorial-only assets. Editorial assets cannot be used for commercial or promotional use. Sketchfab also states that a licensed model cannot be made available as a stand-alone file to others, and the asset must not be used in a way that violates intellectual-property rights. Accordingly, Cabinet Dealz must use only a specific approved standard/commercial or appropriately attributed Creative Commons asset, and it must not expose the original downloadable model file to end users.

[glTF Transform](https://gltf-transform.dev/) documents browser-compatible glTF 2.0 processing, including reproducible optimization, mesh compression, texture resizing, WebP/KTX2 texture compression, and removal of unused data. The approved intake pipeline should preserve a source master outside the web project, create an optimized GLB delivery file, host that delivery artifact using project static-asset storage, and load it only for the matching appliance family/variant.
