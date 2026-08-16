# Catalog-Faithful 3D Realism Upgrade Roadmap

## Objective

The current interactive preview correctly uses the active 2D layout, real cabinet dimensions, door finish, countertop selection, and catalog items. The next step is not to replace that truthful model with an artificial image; it is to make the same deterministic model look like the supplied reference: finished cabinet construction, credible appliances, materials with physical depth, and an architectural room environment.

> **Non-negotiable rule:** A more realistic image must still show the customer’s actual placed SKU, size, wall, door style, finish, countertop, appliance, and room geometry.

| Reference quality that stands out | Current opportunity | Required change |
|---|---|---|
| Door faces read as assembled cabinetry | Some faces still read as flat boxes at a distance | Build all front profiles with rails, stiles, panels, reveals, true drawer gaps, hardware, toe kicks, and end skins. |
| Stainless appliances look manufactured | Appliances are currently simplified procedural shapes | Create separate refrigerator, range, dishwasher, hood, microwave, and sink assemblies with realistic control panels, handles, feet, glass, seams, and scale. |
| Countertops have visible depth and character | Countertops are predominantly flat-color material | Use selected material textures with calibrated scale, normal/roughness maps, beveled edges, seams, splash returns, and sink cutouts. |
| Lighting gives depth and shadows | Lighting is functional but presentation-oriented | Add physically based area lighting, HDR-style environment illumination, ambient occlusion, contact shadows, and calibrated tone mapping. |
| The room feels complete | Floor, walls, openings, and trim remain minimal | Add painted wall material, correct flooring texture and scale, baseboard, wall openings, window glass, backsplash grout, and ceiling/corner transitions. |

## Recommended Implementation Order

### Phase 1 — Construction Detail and Correctness

This is the highest-value first release because it improves realism without compromising layout accuracy or mobile performance. It should standardize every cabinet front, including sink, corner, filler, appliance surround, and panel variants.

| Work item | Customer-visible outcome | Catalog/data dependency |
|---|---|---|
| Door/drawer construction library | Proper shaker, slab, raised-panel, glass, farmhouse-sink, corner, and vanity faces | Existing `doorPanelType`, door/drawer counts, profile data |
| Cabinet construction parts | Face frames, end panels, toe kicks, fillers, crown/light rail, reveals, and hardware read at real depth | Existing placed SKU dimensions and trim choices |
| Specialty SKU assembly rules | ERB, FSB, AW, diagonal, blind-corner, refrigerator surround, and range run look like their 2D plan counterparts | Existing Cabinet Config graphic/profile fields |
| Edge treatment | Beveled door edges, panel shadow lines, counter edges, and cabinet seams prevent the “box” effect | Procedural geometry, no new catalog content required |

### Phase 2 — Materials and Appliances

The second release turns construction into a believable finished kitchen. The system should prefer verified catalog imagery when supplied and use governed material defaults only when a catalog asset is absent.

| Work item | Customer-visible outcome | Implementation note |
|---|---|---|
| PBR cabinet materials | Wood grain follows panel orientation; paint has a subtle, controlled sheen | Generate material variants from selected finish/color and door sample assets. |
| Countertop material system | Quartz/stone texture, veining direction, edge profile, splash, and seams match the selected item | Use the actual selected surface product wherever a usable swatch or texture exists. |
| Appliance asset library | Range, refrigerator, dishwasher, hood, and microwave have correct proportions and front detail | Start with the most-used appliance SKUs; retain procedural fallback when no asset exists. |
| Sink/faucet models | Farmhouse apron, basin, faucet neck, spray, and metallic reflections become recognizable | Tie each model to the real selected surface/fixture product. |

### Phase 3 — Architectural Environment and Presentation

Once the objects are detailed, complete the room so the preview feels like a designed space instead of isolated objects.

| Work item | Customer-visible outcome | Guardrail |
|---|---|---|
| Real floor and backsplash | Correct scale, tile/grout layout, wood direction, and reflection | Drive from selected flooring and backsplash products, not generic swatches. |
| Openings and trim | Windows, doors, baseboard, wall returns, and ceiling shadows give the room depth | Preserve the exact 2D openings and room shape. |
| Lighting presets | “Daylight,” “warm evening,” and “showroom” views show the same design under different illumination | Presets change only light and camera, never products or layout. |
| Camera presets | Eye-level, wide corner, and elevation views make the design easier to understand | Keep user orbit controls and add one-click reset views. |

## Performance and Accuracy Rules

The main preview should stay interactive on phone, tablet, and desktop. Detailed geometry should be shared or instanced where possible, texture sizes should be tiered by device, and the highest-quality render can be reserved for an explicit **High-quality image** export. The regular view must never change the customer’s cabinet selection merely to create a nicer image.

The upgrade should introduce a visual verification matrix for standard cabinets, tall cabinets, appliances, farmhouse sink bases, corner cabinets, fillers, panels, and angled walls. Each case should be compared against the 2D overhead plan to confirm orientation, footprint, finished height, opening, and room-facing front before release.

## First Production Sprint Recommendation

Begin with **Phase 1 plus the top five appliance models**: refrigerator, freestanding range, dishwasher, farmhouse sink, and range hood. This directly addresses the differences visible in your reference image—real cabinet faces, realistic appliance silhouettes, proper countertop relationships, and readable construction—while preserving the actual 2D design as the source of truth. Then apply real PBR countertops, flooring, backsplash, and lighting in the next release.

## Decision Needed

Please confirm whether you want the first production upgrade to begin with **cabinet construction detail and the five common appliance models**, followed by materials and room lighting. That is the fastest route to a visibly more realistic 3D preview without losing accuracy.
