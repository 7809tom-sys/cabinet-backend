# CabinetDealz Product Feature Brief for Attorney Discussion

**Prepared for:** Attorney conversation  
**Prepared by:** Manus AI  
**Date:** September 19, 2026  
**Purpose:** Summarize the CabinetDealz product concepts, implemented Designer workflows, and automation-oriented features that may merit review for intellectual-property strategy, product differentiation, and documentation planning.

## Executive summary

CabinetDealz is a cabinet-commerce and kitchen-design platform built around a structured cabinet catalog, supplier-specific pricing, and a guided 3D kitchen Designer. The product emphasis is not only drawing a kitchen. It is reducing the time required to move from a measured room to a cabinet-ready layout while keeping cabinet placement, corner behavior, wall ownership, and product selection tied to real cabinet data.

Two themes are central. First, the platform normalizes multiple industry and distributor naming conventions into a single master cabinet record, while preserving each supplier’s actual sellable SKU and pricing. Second, the Designer applies placement rules that help users build and edit a room, seat cabinets against real walls, snap true corner cabinets to usable corners, and prevent physical cabinet overlap.

> This brief is a product-description document, not a legal opinion, a patentability conclusion, or a verified comparison of CabinetDealz against any third-party product. Features should be classified by counsel as implemented, in active development, or conceptual before use in a filing or external representation.

## Product architecture and commercial workflow

### Uniform SKU aliasing system

CabinetDealz is designed to treat a cabinet as one master product even when the same functional cabinet is known by different industry names, distributor codes, or color-line codes. The platform can associate approximately five to six aliases with a master SKU. Supplier, cabinet line, style, color, source SKU, availability, and price remain distinct layered attributes rather than being collapsed into the master identity.

This structure is intended to support rapid supplier comparison. A dealer can evaluate another vendor’s price for the comparable cabinet without manually remapping every cabinet in an order. When an order is finalized, the system resolves the selected supplier’s real ordering SKU rather than exposing the internal master identifier as the fulfillment code.

| Capability | Practical result | Attorney discussion point |
|---|---|---|
| Master product with industry aliases | One cabinet identity can recognize several naming conventions | Whether the data model and resolution workflow are proprietary business logic or support a protectable system claim |
| Separate supplier and style layers | Pricing and availability can vary without duplicating the base cabinet identity | Whether the relationship among master SKU, aliases, source SKUs, and order translation is distinctive |
| Supplier switch for an order | Comparable vendor pricing can be evaluated quickly | Whether the selection and conversion flow has a defensible technical workflow |
| Order-time source SKU resolution | Purchase documents use the supplier’s actual SKU | Whether this creates a useful audit trail and differentiated procurement capability |

## 3D Designer: continuous room-layout authoring

### Measured continuous wall building

The Designer includes a continuous-wall workflow for advanced users. A user creates a wall path sequentially by entering a wall length and choosing the next direction: straight, 45 degrees left or right, or 90 degrees left or right. The wall path does not need to close into a rectangle. Each created wall retains its own measured identity, length, height, orientation, and editable attributes.

The workflow is intended to create a full kitchen shell rapidly, including irregular layouts. A wall can be selected independently and edited without recreating the whole room. In the current product direction, individual walls can be deleted from a stretch while the remaining measured walls persist.

### Cabinet and corner placement against real walls

Cabinets placed in a continuous-wall room use the measured walls rather than an invisible rectangular graph boundary. A cabinet receives a wall identity and an offset along that wall. This supports wall-aligned placement on straight, diagonal, and peninsula segments.

True corner cabinets, including easy-reach corner cabinets such as ERB36, can resolve to an open measured 90-degree vertex. The Designer differentiates ordinary 90-degree seating from a true 45-degree peninsula inside corner. A cabinet can sit flush at a 90-degree corner. The 11-inch clearance is reserved for the specific 45-degree inside-corner condition where clearance is required.

The plan also supports repositioning. A user may drag a true corner cabinet near another open real corner. The cabinet resolves to that new corner while retaining the destination wall identity, offset, and orientation. A continuous-wall room does not fall back to a fictitious graph-square corner when no real measured corner is available.

### Editing walls, openings, and room data

The continuous-wall experience is designed to let a user modify the room rather than restart it. The product supports wall attributes such as length and height, deletion of a selected wall subject to safety checks, and placement of doors and windows on the measured wall to which they belong. Doors and windows retain their wall association, offset, orientation, drag behavior, and clearance rules.

The room authoring workflow also includes room measurements such as total wall perimeter and enclosed square footage when the wall path forms an enclosed area. Users can rotate the plan view without changing the underlying entered dimensions. The Designer supports undo and redo for wall-drawing history and exports a finished room layout to PNG or PDF.

| Continuous-wall capability | Intended user value |
|---|---|
| Sequential measured walls with 45-degree and 90-degree turns | Supports irregular kitchens without approximating the room as a rectangle |
| Open or closed wall paths | Allows partial rooms, peninsulas, and complete room shells |
| Individually editable walls | Allows a user to correct one wall rather than redraw the whole layout |
| Door and window placement on selected walls | Keeps room openings attached to actual user-drawn walls |
| Cabinet-to-wall and cabinet-to-corner snapping | Places cabinets according to wall geometry and actual product footprints |
| Collision protection | Allows edge-to-edge cabinet contact but blocks physical overlap |
| Save, rotate, undo, redo, PNG, and PDF workflow | Supports iterative layout work and handoff of a measured plan |

## Designer automation and placement rules

CabinetDealz is organized around assisted design actions. The objective is to reduce repetitive manual layout steps while leaving the user in control of the final design.

### Implemented or actively integrated rule areas

The following workflows are implemented or integrated within the current Designer direction and should be confirmed against the relevant software version before any formal legal representation.

| Rule area | Product behavior |
|---|---|
| Drag-and-snap cabinet placement | Cabinets can be moved along available runs and snap to walls, seams, and eligible corners while preserving physical non-overlap rules |
| Automatic wall orientation | Cabinet placement and movement orient a cabinet so its back is seated to the applicable wall |
| Corner behavior | Corner cabinets can snap to available real corners; standard 90-degree corners are flush, while the special 45-degree inside-corner rule retains the specified clearance |
| Collision detection | A cabinet such as B12 cannot occupy the physical body or reserved adjoining leg of an ERB36 corner cabinet; edge touch remains permitted |
| Cabinet-gap recommendations | The system can identify usable cabinet openings and recommend compatible cabinet sizes or filler solutions |
| Blind-corner support | Blind-corner cabinets are modeled as rectangular cabinets with the required filler and counter-related placement behavior rather than as generic square corner units |
| Island zone workflow | Island faces can act as defined cabinet runs; cabinet movement and countertop coverage can remain associated with the island zone |
| Countertop geometry | Countertop surfaces follow cabinet runs and can extend along peninsula or island configurations, including seating-overhang and waterfall options where configured |
| Sink and appliance coordination | Sink fixtures are associated with sink bases, and cabinet or appliance placement uses product-specific placement checks |
| Stacker workflows | Compatible wall-cabinet stackers can be added in bulk or removed; glass stacker placement can prompt a user to apply a related treatment across compatible wall cabinets |

### Proposed or continuing automation concepts

The following items are useful discussion topics because they reflect the product’s intended automation direction. They should be labeled as proposed or in development unless documented as released in the applicable build.

| Concept | Intended workflow |
|---|---|
| Pillar or obstruction splitting | Detect an obstruction and divide the cabinet run evenly on each side where feasible |
| Island auto-population | Select an island zone and generate an appropriate cabinet run based on available dimensions and chosen components |
| Specific gap-fill recommendation | Recommend a particular catalog cabinet, such as a B15, for a detected opening rather than merely reporting unused space |
| Budget corner alternative | Offer two fillers and a framed construction alternative when a customer chooses not to use a dedicated corner cabinet |
| Refrigerator completion prompt | When a refrigerator is placed, recommend matching upper cabinets and side panels that fit the opening |
| Blind-corner countertop extension | Extend a blind-corner countertop surface to the appropriate wall condition |
| Mitred crown calculation | Calculate 45-degree crown-molding pieces and account for expected waste from the plan geometry |
| Selective finish lock | Freeze island cabinet colors or finishes while the rest of the kitchen remains editable |
| Waterfall support recommendation | Add or recommend cantilever support when the selected island countertop treatment requires it |
| Mirrored island run | Mirror a front island cabinet run to the rear face where the selected island geometry permits it |
| Island wall-cabinet adaptation | Adapt a wall-cabinet placement to an island-specific base, toe-kick, and pull orientation rule when the product configuration calls for it |
| Hardware automation | Place pulls or knobs based on cabinet type, door direction, and product configuration |
| Compass-based angled-wall tool | Select a wall, specify a distance from the corner, and create a continuing 45-degree angle wall for a peninsula or similar configuration |

## User-experience objective and comparative positioning

The intended user experience is to produce a fully walled kitchen layout with doors, windows, cabinet placement, and a seating-level countertop in approximately ten minutes. This is an internal product target and positioning statement. It should not be stated as a verified market comparison without a documented test protocol, selected comparison product version, defined user skill level, and repeatable evidence.

The useful attorney question is not simply whether a competitor takes longer. The more precise question is whether CabinetDealz combines measured continuous-wall authoring, catalog-aware cabinet placement, real-corner resolution, placement constraints, and procurement-aware SKU normalization in a way that has a protectable technical or workflow distinction.

## Documented differentiation relative to 2020 Design / Design Flex

### Comparison boundary

“2020 Design” is now the legacy foundation of Cyncly’s **Design Flex** product. Cyncly describes Design Flex as an evolution of 2020 Design that retains the same trusted core, professional kitchen-and-bath design logic, and existing-file compatibility. [1] For clarity, this brief uses **2020 Design / Design Flex** as the comparison label.

The comparison is intentionally narrow. Cyncly’s public material confirms that Design Flex supports professional space planning, manufacturer and generic catalogs, real-time design and quoting workflows, photorealistic rendering, cloud collaboration, and XML-based application integration. [2] Cyncly also documents smart design wizards, rapid alternative-design exploration, perspective generation, and manufacturer catalog content for its earlier 2020 Design Live offering. [3] These capabilities are significant and should not be characterized as absent from the legacy platform.

The potential CabinetDealz differentiation is therefore not “3D design,” “catalogs,” “rendering,” “quoting,” or “design speed” in isolation. The candidate distinction is the **specific integrated workflow** that begins with a normalized master cabinet identity, builds a measured continuous wall path, binds cabinets and openings to real wall identities, resolves corner placement using geometric and product-footprint rules, blocks real overlap, and converts the selected configuration to a supplier-specific ordering SKU.

### Candidate IP differentiation points

| Candidate point | CabinetDealz implementation or product direction | What the reviewed Cyncly public materials establish | Counsel question and evidence to preserve |
|---|---|---|---|
| **Master-SKU alias resolution across suppliers** | A functional cabinet maps to one master identity with multiple industry aliases; supplier, style, color, price, and source ordering SKU are separate attributes. The selected supplier’s true SKU is resolved at order time. | Cyncly publicly describes manufacturer catalogs, supplier integrations, real-time quoting, and XML integrations. [2] The reviewed materials do not describe the particular multi-alias master-SKU-to-source-SKU resolution sequence. | Is the alias graph, price-switch workflow, and order-time source-SKU conversion sufficiently specific to support a system claim or to protect as a trade secret? Preserve schema versions, mapping rules, supplier-switch recordings, and generated order artifacts. |
| **Measured wall identity rather than a generic room boundary** | Each continuous wall has its own identity, endpoints, measured length, angle, height, and editable state. Cabinets, doors, and windows retain a wall identifier and offset. | Cyncly publicly states that its products provide space planning and detailed, configurable 3D spaces. [2] The reviewed materials do not describe CabinetDealz’s wall-ID/offset data relationship. | Is the persistent wall-identity model, particularly for open paths and diagonal segments, a distinct technical mechanism? Preserve serialized room data, wall-edit demonstrations, and tests showing ownership survives edits and refresh. |
| **Corner placement rule engine** | True corner cabinets snap to open measured right-angle vertices. Standard 90-degree corners are flush; a defined inside-corner clearance applies only to the relevant 45-degree peninsula condition. | Cyncly’s materials state that 2020 Design/Design Flex offers design logic, wizards, and accurate layouts. [1] [3] They do not establish the specific 45-degree-versus-90-degree rule, real-vertex selection, or ERB36/B12 collision behavior. | Can the combination of corner classification, clearance predicates, vertex selection, and adjoining-leg reservation be claimed as a rule-driven placement mechanism? Preserve geometry diagrams, test cases, and before/after recordings. |
| **Continuous wall editing with product-aware containment** | A user creates an open or closed chain of straight, 45-degree, and 90-degree turns; then edits, deletes, or resizes an individual wall while retaining compatible room content. Cabinets must remain on real measured walls rather than an invisible graph rectangle. | Cyncly describes detailed space planning and faster iteration. [1] [2] Public materials reviewed do not establish the specific interaction model or its product-aware containment behavior. | Is the sequence of drawing, modifying, retaining, and constraining products a protectable workflow? Preserve UI recordings, wall-history states, and cabinet recovery/containment tests. |
| **Commerce-linked layout automation** | The Designer’s placement, gap, filler, countertop, appliance, and stacker decisions are intended to use orderable cabinet data and to carry forward into materials and checkout workflows. | Cyncly publicly describes design-and-quoting workflows and manufacturer catalogs. [2] Its reviewed materials do not establish the CabinetDealz-specific combination of cabinet geometry, filler logic, supplier choice, and checkout translation. | Should the system be divided into separate claims for geometry, catalog resolution, and downstream procurement—or described as one end-to-end architecture? Preserve design-to-cart traces and decision logs. |

### Practical conclusion for counsel

The reviewed public record supports the conclusion that 2020 Design / Design Flex is a mature professional design-and-quoting platform. It does **not** support a blanket statement that CabinetDealz is the first system to provide 3D kitchen design, catalogs, walls, rooms, rendering, quotations, or design automation. [1] [2] [3]

It does support a more precise legal discussion: whether the CabinetDealz combination of supplier-normalized cabinet identity, persistent real-wall geometry, corner-specific product rules, collision-aware placement, and order-time supplier-SKU conversion forms a novel and non-obvious technical workflow. That conclusion requires a prior-art search and counsel’s analysis; it cannot be established solely from the public product pages reviewed for this brief.

## Materials to preserve for counsel

The strongest record will combine dated product evidence with a clear feature chronology. Product screenshots should show the continuous-wall builder, a non-rectangular wall path, wall attribute editing, door and window placement, a corner cabinet snapping to a real vertex, a blocked B12-to-ERB36 collision, and the resulting countertop layout. Exported PNG or PDF plans and screen recordings of the wall-building sequence will help establish how the workflow behaves.

The engineering record should preserve source-control checkpoints, test cases, release notes, product requirements, and design decisions. In particular, the records should distinguish the original continuous-wall idea, the real-wall ownership model, the 45-degree versus 90-degree clearance rule, the corner-cabinet snap behavior, and the SKU alias-to-order-SKU conversion flow.

## Questions for the attorney conversation

Counsel may wish to evaluate whether the system is best described as a group of related inventions or as a single integrated platform. Relevant questions include whether a provisional patent application is appropriate, whether particular data-model or automated-layout workflows are suitable for trade-secret treatment, and which user-interface materials should be protected through copyright, trademark, or contractual controls.

Counsel may also help define the evidence standard for external comparisons. Any claim about a competing product, a time reduction, or a feature that another product does not replicate should be supported by a dated, repeatable comparison record before it is used in sales, investor, patent, or legal materials.

## Print review record

This signature area records receipt or discussion of this product brief only. It does not create an attorney-client relationship, confirm legal advice, assign intellectual-property rights, or establish a legal conclusion.

| Role | Name | Signature | Date |
|---|---|---|---|
| CabinetDealz representative |  |  |  |
| Reviewing attorney or advisor |  |  |  |

## References

The CabinetDealz feature descriptions are based on internal product notes and requirements supplied for the CabinetDealz project on September 18–19, 2026. The following sources support only the narrow comparison statements about Cyncly’s public product descriptions. They do not establish patentability, exclusivity, or the absence of features from any competitor product.

[1]: https://www.cyncly.com/resources/blog/from-2020-design-to-design-flex "From 2020 Design to Design Flex: What you need to know"
[2]: https://www.cyncly.com/products/design-flex/pricing "Design Flex pricing and feature comparison"
[3]: https://www.cyncly.com/resources/news/2020-design-kbb-2023-award "Cyncly’s 2020 Design Live named a 2023 KBB Readers’ Choice Award winner"
