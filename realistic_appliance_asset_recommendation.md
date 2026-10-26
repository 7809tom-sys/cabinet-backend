# Realistic Appliance Assets for Cabinet Dealz

## Recommendation

Yes—Cabinet Dealz can use substantially more realistic appliance models. The correct approach is a **small, licensed appliance-family library** rather than importing random appliance pictures or treating every product as the same generic box. Each approved 3D asset should represent a reusable family, such as a front-control range, rear-control range, French-door refrigerator, dishwasher, over-range microwave, built-in oven, or hood. Cabinet Dealz’s existing catalog resolver should then select the right family, finish, control position, dimensions, and visible features.

> The 3D model should improve visual realism, but the **Cabinet Dealz catalog remains authoritative** for SKU, price, dimensions, availability, and customer selection.

| Priority | Practical source | Appropriate use | Important restriction |
|---|---|---|---|
| **1** | Commissioned or in-house generic residential appliance family models | Best long-term option for the public Cabinet Dealz viewer: exact dimensions, standardized finishes, and no branded-product ambiguity | Cabinet Dealz owns or receives the required commercial web-display rights |
| **2** | Manufacturer-specific BIM/3D listings from BIMobject, subject to the particular item’s terms | Accurate reference for a manufacturer/model that Cabinet Dealz is authorized to display | Do not download, convert, or redistribute a BIM object until its manufacturer/BIMobject web-display rights are confirmed [1] |
| **3** | Paid standard/commercial marketplace models, such as an approved Sketchfab asset | A quick way to license a generic appliance family for browser conversion | Do not use editorial assets; do not expose the model as a stand-alone download; confirm the exact asset’s permitted commercial scope [2] |
| **4** | Creative Commons model used only when its exact terms fit the project | Technical reference, prototype, or a small asset with required attribution | Verify attribution, commercial-use rights, derivatives, trademark rights, and distribution conditions per asset [3] |
| **5** | Khronos sample refrigerator | A technical PBR/glTF benchmark, not the default residential product library | Its model page identifies it as a commercial refrigerator and publishes it under CC BY 4.0; it requires attribution and does not match typical residential catalog form factors [4] |

## What to source first

The first asset pack should cover the appliance groups customers see most often in a kitchen design. It should include one high-quality family model for each of the following categories: a 30-inch front-control gas range, a 30-inch front-control electric range, a 30-inch rear-control gas range, a 30-inch rear-control electric range, a 36-inch French-door refrigerator, a 24-inch dishwasher, a 30-inch over-range microwave, a 30-inch single oven, and a 30-inch wall or chimney hood. Each family should support **stainless steel, black stainless, white, and black** where that finish is real in the catalog.

Cabinet Dealz should not claim that a generic model is an exact branded product. If the catalog has an actual licensed manufacturer model, the viewer can label and render that specific model. Otherwise, it should use a truthful visual family label such as **“30-inch black front-control gas range”** while retaining the customer’s real SKU and purchase data.

## Browser delivery standard

The preferred runtime file is **GLB/glTF 2.0**, because it preserves PBR materials and works naturally with browser 3D pipelines. Approved source assets should be kept outside the deployed project as originals. A build step should create an optimized delivery GLB with unused data removed, meshes simplified as appropriate, and textures resized/compressed. glTF Transform documents optimization, Draco/Meshopt geometry compression, and WebP/KTX2 texture workflows for glTF assets [5].

| Delivery gate | Required record |
|---|---|
| Legal | Source URL, asset author/manufacturer, exact license, purchased receipt or written permission, required attribution, and commercial web-display confirmation |
| Catalog | Cabinet Dealz appliance family, mapped SKU or valid SKU group, dimensions, fuel, control location, finish options, and product-photo relationship |
| Technical | Original format, optimized GLB size, triangle count, texture resolutions, material map count, dimensions, and browser load test |
| UX | Fallback procedural model, loading state, mobile fallback, and a guarantee that the model never changes price, SKU, or physical placement dimensions |

## Recommended next action

Start with a **licensed generic family pack or commissioned models**, then map the current Cabinet Dealz catalog’s range, refrigerator, dishwasher, microwave, oven, and hood variants to that pack. In parallel, request written authorization from the manufacturers/distributors whose branded model assets Cabinet Dealz wants to display. This gives the site a realistic 3D upgrade immediately without introducing uncertain brand, copyright, or redistribution rights.

## References

[1] [BIMobject Kitchen Appliances](https://www.bimobject.com/en-us/categories/kitchen/appliances?software=sketchup)

[2] [Sketchfab License Agreement](https://sketchfab.com/licenses)

[3] [Sketchfab guide to Creative Commons licenses](https://sketchfab.com/blogs/community/an-introduction-to-creative-commons-licenses/)

[4] [Khronos glTF Sample Assets — Commercial Refrigerator](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/CommercialRefrigerator/README.md)

[5] [glTF Transform documentation](https://gltf-transform.dev/)
