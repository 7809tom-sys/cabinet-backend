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

## Verified Pilot Candidate — PL-FC2418SB

Pelican’s product page and linked specification sheet verify that **PL-FC2418SB** is a reversible, apron-front undermount fireclay sink. Its exterior dimensions are **24 × 18 × 10 inches**, and its single-bowl interior dimensions are **22½ × 16⅝ × 9 inches**. The product page also provides a manufacturer DXF resource, but neither catalog photography nor the DXF should be treated as a texture or a substitute for a full 3D product model.

The first implementation may therefore use a measured, parametric fireclay-sink profile with these verified dimensions. It must remain identified as a dimensional profile, preserve the Pelican product code, fit only on a compatible sink base, and retain the exact saved kitchen plan.

### Sources

1. [Pelican Int’l — PL-FC2418SB product page](https://buildpelican.com/products/pl-fc2418sb)
2. [Pelican Int’l — PL-FC2418SB specification sheet](https://cdn.accentuate.io/7876648042636/1729870572366/PL-FC2418SB.pdf?v=1729870572366)

## Additional Verified Farmhouse Profiles

The following single-bowl Farmhouse Series models also have Pelican specification sheets with exterior and interior measurements. Their imported Black, Grey, White, and legacy “(old)” catalog forms resolve to the same verified base model; their truncated importer `size` text is not used for 3D geometry.

| Pelican base model | Exterior dimensions | Interior/bowl dimensions | Designer host requirement |
|---|---:|---:|---:|
| PL-FC3018SB | 30 × 18 × 10 in | 28⅝ × 16⅝ × 9¼ in | Farmhouse sink base at least 30 in wide |
| PL-FC3318SB | 32⅝ × 18 × 10 in | 31⅜ × 16⅝ × 9¼ in | Farmhouse sink base at least 33 in wide |
| PL-FC3321SB | 33 × 20⅞ × 10 in | 31⅝ × 19¾ × 10 in | Farmhouse sink base at least 33 in wide |

### Additional Sources

3. [Pelican Int’l — PL-FC3018SB product page](https://buildpelican.com/products/pl-fc3018sb)
4. [Pelican Int’l — PL-FC3018SB specification sheet](https://cdn.accentuate.io/9682969362572/1786578710369/PL-FC3018SB-Spec.pdf?v=1786578710369)
5. [Pelican Int’l — PL-FC3318SB product page](https://buildpelican.com/products/pl-fc3318sb)
6. [Pelican Int’l — PL-FC3318SB specification sheet](https://cdn.accentuate.io/8980578500748/1775068978130/PL-FC3318SB.pdf?v=1776100416378)
7. [Pelican Int’l — PL-FC3321SB product page](https://buildpelican.com/products/pl-fc3321sb)
8. [Pelican Int’l — PL-FC3321SB specification sheet](https://cdn.accentuate.io/8980578599052/1775068792025/PL-FC3321SB.pdf?v=1776100377350)

## First Verified Standard-Sink Profiles

PL-HA109 establishes the first **standard sink-base** measured profile set. Pelican’s standard R0/R15 sheets specify a 30 × 18 × 10 inch exterior and 28 × 16 × 10 inch single bowl; its separately documented ADA R0/R15 forms have the same 30 × 18 footprint with a 5½ inch depth. They remain standard undermount profiles without an apron-front mesh and require a standard base at least 30 inches wide.

### Additional Sources

9. [Pelican Int’l — PL-HA109 product page](https://buildpelican.com/products/pl-ha109)
10. [Pelican Int’l — PL-HA109 R0 specification sheet](https://cdn.accentuate.io/7876665442444/1729872829476/PL-HA109-R0.pdf?v=1729872829477)
11. [Pelican Int’l — PL-HA109 ADA R0 specification sheet](https://cdn.accentuate.io/7876665442444/1742318026789/PL-HA109-ADA-R0-18g-Spec.pdf?v=1742318026789)

## Designer Visual-Load Check — 2026-09-03

The live Designer may show its normal loading indicator during initial data hydration. An interactive browser check completed successfully afterward and displayed the kitchen workspace, cabinet palette, sink-base group, and **Surfaces & Fixtures** entry without a browser-console exception. This verifies the current profile additions did not prevent the Designer from loading; it does not replace owner testing of a saved design.

## First Verified Faucet Profile

PL-8203 Brushed Nickel is the first verified faucet profile. Pelican’s product page and specification sheet identify it as a single-hole pull-down kitchen faucet with a 27 3/16 inch overall height, 9 7/8 inch spout length, and 4 15/16 inch spout height. The Designer stores these measurements only when that actual faucet is selected in the sink-base flow, then uses a measured parametric pull-down silhouette. It does not use the product photo as a 3D asset.

### Sources

12. [Pelican Int’l — PL-8203 product page](https://buildpelican.com/products/pl-8203)
13. [Pelican Int’l — PL-8203 specification sheet](https://cdn.accentuate.io/7876662329484/1729881091715/PL-8203-Spec-Sheet.pdf?v=1734119171551)

## Next Verified Faucet Candidate — PL-8207

Pelican’s official PL-8207 product page and specification sheet identify this Fountain Series single-hole pull-down faucet as a 26⅛-inch overall-height model with a 7 11/16-inch spout length and a 6½-inch spout height. The sheet lists Brushed Nickel and Matte Black finishes. It is a source-verified candidate for the next parametric faucet profile; catalog imagery remains display-only.

### Sources

14. [Pelican Int’l — PL-8207 product page](https://buildpelican.com/products/pl-8207)
15. [Pelican Int’l — PL-8207 specification sheet](https://cdn.accentuate.io/7876662395020/1729881131839/PL-8207-Spec-Sheet.pdf?v=1734119192469)

## Verified PL-8237 Standard-Arc Faucet Family

Pelican’s PL-8237 specification sheet verifies one common single-hole faucet geometry for all active imported finishes: a 12 13/16-inch overall height, 7 1/16-inch spout length, and 8⅜-inch spout height. The registered Designer variants are PL-8237 BG, BN, CHR, and MB. Each retains the selected finish while sharing only the authoritative geometry.

### Sources

16. [Pelican Int’l — PL-8237 product page](https://buildpelican.com/products/pl-8237)
17. [Pelican Int’l — PL-8237 specification sheet](https://cdn.accentuate.io/7876664393868/1729881524238/PL-8237.pdf?v=1729881524238)

## Next Verified Faucet Candidate — PL-8248

Pelican’s PL-8248 documentation describes a single-hole pull-out kitchen faucet, in Brushed Nickel, Chrome, and Matte Black. Its listed measurements are a 12⅜-inch overall height, 10 1/16-inch spout length, and 10⅞-inch spout height. The records are source-verified candidates for the next distinct **pull-out** form; catalog images remain display-only.

### Sources

18. [Pelican Int’l — PL-8248 product page](https://buildpelican.com/products/pl-8144)
19. [Pelican Int’l — PL-8248 specification sheet](https://cdn.accentuate.io/8105530687628/1744289003241/PL-8248.pdf?v=1744289003241)

## Enforced Exact-Fixture Eligibility Rule

Only a sink or faucet with a registered, source-verified Pelican fixture profile may now be offered for physical placement in the Designer. The compact picker and full Surfaces & Fixtures dialog hide unverified fixture records; sink-base placement rejects them defensively; and the 3D renderer refuses to create a fallback faucet when a saved fixture lacks verified profile identity, dimensions, and form. This prevents catalog imagery or inferred generic geometry from being presented as an exact selected product.

## Next Verified Faucet Candidate — PL-8222

Pelican’s PL-8222 specification identifies a single-hole, Brushed Nickel pull-out faucet. Its measured overall height is 9 9/16 inches, its spout length is 8⅜ inches, and its spout height is 5 13/16 inches. It is eligible for an exact parametric pull-out profile; catalog photography remains display-only.

### Sources

20. [Pelican Int’l — PL-8222 product page](https://buildpelican.com/products/pl-8222)
21. [Pelican Int’l — PL-8222 specification sheet](https://cdn.accentuate.io/7876663148684/1729881399900/PL-8222-Spec-Sheet.pdf?v=1734119372824)

## Next Verified Faucet Candidate — PL-8206

Pelican’s PL-8206 specification identifies a single-hole faucet with a pull-out sprayer and **dual swing joints that rotate 360 degrees**. Its measured overall height is 10½ inches, spout length is 9¾ inches, and spout height is 9¼ inches. Active Brushed Nickel, Chrome, and Matte Black variants are candidates for a distinct articulated-swing parametric form; product images remain display-only.

### Sources

22. [Pelican Int’l — PL-8206 product page](https://buildpelican.com/products/pl-8143)
23. [Pelican Int’l — PL-8206 specification sheet](https://cdn.accentuate.io/8105530654860/1744229984387/PL-8206.pdf?v=1744229984387)

## Next Verified Faucet Candidate — PL-8224

Pelican’s PL-8224 specification identifies a single-hole pull-out kitchen faucet. Its measured overall height is 19 5/16 inches, spout length is 7 15/16 inches, and spout height is 10¼ inches. The active color records can use the established exact pull-out form after their catalog codes are verified; product images remain display-only.

### Sources

24. [Pelican Int’l — PL-8224 product page](https://buildpelican.com/products/pl-8224)
25. [Pelican Int’l — PL-8224 specification sheet](https://cdn.accentuate.io/7876664131724/1729881432596/PL-8224-Spec-Sheet.pdf?v=1734119408878)

## Next Verified Faucet Candidate — PL-8210

Pelican’s PL-8210 specification identifies a single-hole commercial-style pull-down faucet with a pull-out sprayer. Its measured overall height is 22½ inches, spout length is 9¾ inches, and spout height is 7¾ inches. Active Brushed Nickel and Matte Black variants are candidates for the established exact pull-down form after catalog-code verification; product images remain display-only.

### Sources

26. [Pelican Int’l — PL-8210 product page](https://buildpelican.com/products/pl-8210)
27. [Pelican Int’l — PL-8210 specification sheet](https://cdn.accentuate.io/7876662493324/1729881249111/PL-8210-Spec-Sheet.pdf?v=1734119224340)

## Next Verified Faucet Candidate — PL-8211

Pelican’s PL-8211 specification identifies a single-hole pull-down faucet with a pull-out sprayer. Its measured overall height is 15 11/16 inches, spout length is 9 7/16 inches, and spout height is 6⅝ inches. Active Brushed Gold, Brushed Nickel, and Chrome variants are candidates for the established exact pull-down form after catalog-code verification; product images remain display-only.

### Sources

28. [Pelican Int’l — PL-8211 product page](https://buildpelican.com/products/pl-8211)
29. [Pelican Int’l — PL-8211 specification sheet](https://cdn.accentuate.io/7876662689932/1729881278122/PL-8211-spec.pdf?v=1750169308913)

## Next Verified Faucet Candidate — PL-8213

Pelican’s PL-8213 specification identifies a single-hole pull-down faucet with a pull-out sprayer. Its measured overall height is 15¾ inches, spout length is 9⅜ inches, and spout height is 6½ inches. Active Brushed Nickel and Chrome variants are candidates for the established exact pull-down form after catalog-code verification; product images remain display-only.

### Sources

30. [Pelican Int’l — PL-8213 product page](https://buildpelican.com/products/pl-8213)
31. [Pelican Int’l — PL-8213 specification sheet](https://cdn.accentuate.io/7876662886540/1729881310144/PL-8213-Spec-Sheet.pdf?v=1734119293439)

## Next Verified Faucet Candidate — PL-8217

Pelican’s PL-8217 specification identifies a single-hole pull-down faucet with a pull-out sprayer. Its measured overall height is 16 13/16 inches, spout length is 9⅜ inches, and spout height is 7 9/16 inches. Active Brushed Nickel, Chrome, and Oil Rubbed Bronze variants are candidates for the established exact pull-down form after catalog-code verification; product images remain display-only.

### Sources

32. [Pelican Int’l — PL-8217 product page](https://buildpelican.com/products/pl-8217)
33. [Pelican Int’l — PL-8217 specification sheet](https://cdn.accentuate.io/7876662952076/1729881335594/PL-8217-Spec-Sheet.pdf?v=1734119313031)

## Next Verified Faucet Candidate — PL-8218

Pelican’s PL-8218 specification identifies a single-hole pull-down faucet with a pull-out sprayer. Its measured overall height is 17 11/16 inches, spout length is 9⅜ inches, and spout height is 8⅜ inches. Active Brushed Nickel, Chrome, and Matte Black variants are candidates for the established exact pull-down form after catalog-code verification; product images remain display-only.

### Sources

34. [Pelican Int’l — PL-8218 product page](https://buildpelican.com/products/pl-8218)
35. [Pelican Int’l — PL-8218 specification sheet](https://cdn.accentuate.io/7876663017612/1729881362501/PL-8218-Spec-Sheet.pdf?v=1734119334413)

## Next Verified Faucet Candidate — PL-8231

Pelican’s official documentation identifies PL-8231 Fountain Series as a single-hole **pull-out** kitchen faucet. Its nominal measurements are a 15¾-inch overall height, 9⅜-inch spout length, and 6½-inch spout height. The active imported variants are Brushed Gold, Brushed Nickel, Chrome, and Matte Black. These variants can share this measured geometry while retaining the selected finish; catalog photography remains display-only.

### Sources

36. [Pelican Int’l — PL-8231 product page](https://buildpelican.com/products/pl-8231)
37. [Pelican Int’l — PL-8231 specification sheet](https://cdn.accentuate.io/7876664230028/1729881462010/PL-8231-Spec-Sheet.pdf?v=1734119435030)

## Excluded From Kitchen Sink-Base Placement — PL-CI8004

PL-CI8004 is a **Forge Series wall-hung bathroom sink**, not a kitchen sink-base product. Pelican’s source documentation gives its exterior dimensions as 36 × 20 5/32 × 18½ inches and specifies wall-hung installation with 8-inch-center wall-mount faucets. It must therefore remain outside the kitchen sink-base palette, despite a legacy import category that can make it appear in a broad sink query. It can be evaluated later for a dedicated bathroom Designer once bathroom walls, mounting height, and the compatible wall-mount faucet workflow are supported.

### Sources

38. [Pelican Int’l — PL-CI8004 product page](https://buildpelican.com/products/pl-ci8004)
39. [Pelican Int’l — PL-CI8004 specification sheet](https://cdn.accentuate.io/8980582989964/1776100660059/PL-CI8004-Spec.pdf?v=1776100660059)

## Not Admitted to Exact Kitchen Placement Yet — PL-FC103

The imported PL-FC103 record describes a fireclay reversible farmhouse kitchen sink, but Pelican’s direct `products/pl-fc103` URL currently resolves to a not-found page and no Pelican technical sheet was recovered. A third-party listing also reports internally inconsistent exterior and bowl widths, so it cannot be used as an authoritative dimensional source. PL-FC103 remains outside the verified kitchen sink palette until a complete official Pelican specification sheet is available.

## Next Verified Farmhouse Sink Candidate — PL-HA128 R15

Pelican’s official PL-HA128 documentation verifies a Handmade Series **double-bowl stainless-steel apron-front undermount** sink. Its exterior dimensions are 33 × 21 × 10 inches and it has two 14½ × 16 × 10-inch bowls. It belongs only on a compatible farmhouse sink base at least 33 inches wide. It is eligible for a measured double-bowl parametric profile that renders the countertop-seated basin and visible front apron; catalog photography and the optional DXF remain display-only and are not 3D material assets.

### Sources

40. [Pelican Int’l — PL-HA128 product page](https://buildpelican.com/products/pl-ha128)
41. [Pelican Int’l — PL-HA128 R15 specification sheet](https://cdn.accentuate.io/7876666720396/1729873935066/PL-HA128-R15-%282%29.pdf?v=1729873935067)

## Corrected Kitchen Eligibility — PL-3099

Pelican identifies PL-3099 as an 18 × 13-inch porcelain **vanity sink**, not a kitchen farmhouse sink. A legacy imported display name used the words “Farmhouse Reserve,” which could misleadingly suggest kitchen placement. The public Pelican catalog record remains available for bathroom shoppers, but the product is explicitly excluded from the kitchen Designer palette and from the public **View in Designer Palette** action. No catalog pricing, source record, or ordering identity is changed.

### Source

42. [Pelican Int’l — PL-3099 product page](https://buildpelican.com/products/pl-3099)

## Verified Farmhouse Sink — PL-FC3219SB

Pelican’s official Farmhouse Series documentation verifies PL-FC3219SB as a white fireclay, single-bowl sink that can be installed as either drop-in or undermount. Its exterior dimensions are 31⅞ × 19⅛ × 10¼ inches and its interior bowl dimensions are 29⅛ × 16⅛ × 9¼ inches. The design tool may use only a measured parametric profile from those dimensions; product images remain display-only. The registered profile uses a conservative 33-inch farmhouse-base minimum, so the current FSB-36 is a valid host.

### Sources

43. [Pelican Int’l — PL-FC3219SB product page](https://buildpelican.com/products/pl-fc3219sb)
44. [Pelican Int’l — PL-FC3219SB specification sheet](https://cdn.accentuate.io/9687395860620/1786579710979/PL-FC3219SB.pdf?v=1786579710979)

## Source-Verified Retrofit Sink — PL-FC3220SB

Pelican’s official PL-FC3220SB product page identifies a white fireclay, single-bowl **retrofit apron-front farmhouse** kitchen sink. Its exterior dimensions are **32⅝ × 20⅛ × 10⅛ inches**. Pelican’s official technical drawing gives a **29⅝ × 17⅛ × 9⅛-inch** interior bowl and confirms the same exterior dimensions. The product description states that its retrofit apron front is designed to fit into existing standard kitchen cabinets.

The measurements are sufficient for a future parametric profile, and its apron-front must remain visibly seated at the countertop/front-face interface. However, it is not yet added to the current kitchen palette because the owner-approved compatibility rule presently limits apron-front farmhouse products to farmhouse sink-base selection and limits standard SB-style bases to standard sinks. This policy conflict must be resolved explicitly before the product can be offered on a standard base; catalog or product imagery remains display-only in all cases.

### Sources

45. [Pelican Int’l — PL-FC3220SB product page](https://buildpelican.com/products/pl-fc3220sb)
46. [Pelican Int’l — PL-FC3220SB official technical drawing](https://buildpelican.com/cdn/shop/files/PL-FC3220SBLD.png?v=1786580547)

## Next Verified Farmhouse Sink Candidate — PL-FC3318DB

Pelican’s current product page and official specification sheet identify PL-FC3318DB as a white fireclay, reversible, double-bowl **apron-front undermount** farmhouse kitchen sink. The published exterior measures **32⅝ × 18 × 10 inches**. Each of its two bowls measures **15⅜ × 16½ × 9¼ inches**; the technical drawing also shows two drains. These measurements support a source-measured double-bowl parametric profile with a visible apron, countertop seating, and two measured drains. It must be offered only on a compatible farmhouse sink base with a conservative 33-inch minimum, so the current FSB-36 is a valid host; catalog photographs and product diagrams remain display-only and cannot become 3D texture or geometry.

### Sources

47. [Pelican Int’l — PL-FC3318DB product page](https://buildpelican.com/products/pl-fc3318db-1)
48. [Pelican Int’l — PL-FC3318DB specification sheet](https://cdn.accentuate.io/8980578435212/1775069060533/PL-FC3318DB-(2).pdf?v=1776100453253)

## Next Verified Farmhouse Sink Candidate — PL-HA136 R15

Pelican’s current product page and official PL-HA136 R15 specification sheet identify this as a 16-gauge stainless-steel, double-bowl **apron-front undermount** farmhouse kitchen sink. Its published exterior measures **33 × 21 × 10 inches**. Unlike the equal-bowl PL-HA128, its two published bowls are asymmetric: the left bowl is **17 × 16 × 10 inches** and the right bowl is **12 × 16 × 10 inches**. The specification sheet also identifies a double-bowl configuration and two drains.

An exact profile must preserve those distinct left and right bowl widths rather than substituting two equal bowls. Once the measured asymmetric bowl data is persisted through the Designer, the sink can use a stainless-steel, countertop-seated parametric profile with two drains and a visible apron. It must be offered only for compatible 33-inch-or-wider farmhouse bases, including FSB-36; Pelican catalog images and DXF files remain display-only and cannot become 3D texture or geometry.

### Sources

49. [Pelican Int’l — PL-HA136 product page](https://buildpelican.com/products/pl-ha136)
50. [Pelican Int’l — PL-HA136 R15 specification sheet](https://cdn.accentuate.io/7876666949772/1729874053747/PL-HA136-R15.pdf?v=1729874053747)

## Not Admitted to Exact Kitchen Placement Yet — PL-HA135 R0 Retrofit

Pelican’s official PL-HA135 R0 sheet identifies a 16-gauge stainless-steel, single-bowl **retrofit apron-front undermount** kitchen sink. Its published exterior is **35½ × 21¼ × 9⅜ inches** and its interior bowl is **32½ × 17¼ × 9⅛ inches**. The same source explicitly states that its retrofit apron-front construction is designed for installation into existing standard kitchen cabinets without remodel or custom cabinets.

The measurements are sufficient for a future measured parametric profile. However, the item remains outside the exact kitchen palette because the current owner-approved policy allows apron-front farmhouse sinks only through farmhouse bases and standard SB-style bases only through standard sinks. Enabling this retrofit product requires a separately verified standard-base opening and apron-clearance rule; no generic placement or visual substitute is allowed. Product photos remain display-only.

### Sources

51. [Pelican Int’l — PL-HA135 product page](https://buildpelican.com/products/pl-ha135)
52. [Pelican Int’l — PL-HA135 R0 specification sheet](https://cdn.accentuate.io/8978112643212/1775067586424/PL-HA135-R0.pdf?v=1775067586424)

## Next Verified Farmhouse Sink Candidate — PL-HA130 R0

Pelican’s current product page and official PL-HA130 R0 specification sheet identify this as a 16-gauge stainless-steel, double-bowl **apron-front undermount** farmhouse kitchen sink. Its exterior measures **36 × 21 × 10 inches** and each of its two bowls measures **16 × 16 × 10 inches**. The specification sheet identifies a double-bowl configuration and the drawing shows two drains.

These measurements are sufficient for a source-measured, equal double-bowl parametric profile with countertop seating, two drains, and a visible apron. The sink is eligible only on a compatible farmhouse base at least 36 inches wide; it does not change any cabinet, pricing, or standard sink-base behavior, and product images or DXF files remain display-only.

### Sources

53. [Pelican Int’l — PL-HA130 product page](https://buildpelican.com/products/pl-ha130)
54. [Pelican Int’l — PL-HA130 R0 specification sheet](https://cdn.accentuate.io/7876666818700/1729873984961/PL-HA130-R0.pdf?v=1729873984961)

## Next Verified Farmhouse Sink Candidate — PL-HA122 R15

Pelican’s current product page and official PL-HA122 R15 specification sheet identify this as a 16-gauge stainless-steel, single-bowl **apron-front undermount** farmhouse kitchen sink. Its exterior measures **32⅞ × 20¾ × 10 inches** and its interior bowl measures **30 × 16 × 10 inches**.

These measurements support a source-measured parametric sink profile with countertop seating, one drain, and a visible apron. The sink is eligible only on compatible 33-inch-or-wider farmhouse bases, including FSB-36. It does not change cabinet placement, pricing, or standard sink-base behavior, and its product images and DXF resource remain display-only.

### Sources

55. [Pelican Int’l — PL-HA122 product page](https://buildpelican.com/products/pl-ha122)
56. [Pelican Int’l — PL-HA122 R15 specification sheet](https://cdn.accentuate.io/7876666261644/1729873641877/PL-HA122-R15-(1).pdf?v=1729873641877)

## Next Verified Standard-Sink Candidate — PL-HA115 R0

Pelican’s current product page and official PL-HA115 R0 specification sheet identify this as a stainless-steel, single-bowl **undermount** kitchen sink, offered in 16- or 18-gauge construction. Its normal-depth exterior measures **32 × 18 × 10 inches** and its interior bowl measures **30 × 16 × 10 inches**. Pelican separately offers ADA variants, which must retain their independently documented shallow-bowl dimensions rather than inherit the normal-depth profile.

The normal-depth source data supports a stainless measured parametric profile for a compatible 32-inch-or-wider standard SB-style sink base. It has no apron-front geometry, does not affect the farmhouse-only base workflow, and does not change cabinetry or pricing. Product imagery and DXF files remain display-only.

### Sources

57. [Pelican Int’l — PL-HA115 product page](https://buildpelican.com/products/pl-ha115)
58. [Pelican Int’l — PL-HA115 R0 specification sheet](https://cdn.accentuate.io/7876665966732/1729873248748/PL-HA115-R0.pdf?v=1729873248749)

## Not Admitted to Exact Kitchen Placement Yet — PL-HA120

Pelican’s direct current `products/pl-ha120` URL returns a **404 Not Found** page. Although third-party listings describe a stainless-steel double-bowl kitchen sink, no current Pelican product page or official Pelican specification sheet was recovered. It must remain outside the verified Designer fixture palette until its exact source, measurements, installation class, and sink-base compatibility are established from Pelican documentation. No third-party dimensions, catalog images, or generic substitute geometry are used.

## Next Verified Standard-Sink Candidate — PL-HA104 R0

Pelican’s current product page and official PL-HA104 R0 specification sheet identify this as a 16-gauge stainless-steel, single-bowl **undermount** kitchen sink. Its exterior measures **17 × 18 × 10 inches** and its interior bowl measures **15 × 16 × 10 inches**.

These measurements support a source-measured parametric sink profile for a compatible 18-inch-or-wider standard SB-style sink base. It has no apron-front geometry and therefore does not alter the farmhouse-only base workflow. The profile does not change cabinetry or pricing, and Pelican product images and DXF files remain display-only.

### Sources

59. [Pelican Int’l — PL-HA104 product page](https://buildpelican.com/products/pl-ha104)
60. [Pelican Int’l — PL-HA104 R0 specification sheet](https://cdn.accentuate.io/7876665278604/1729872420755/PL-HA104-R0.pdf?v=1729872420755)

## Next Verified Farmhouse Sink Candidate — PL-HA118 R15

Pelican’s current product page and official PL-HA118 R15 specification sheet identify this as a 16-gauge stainless-steel, single-bowl **apron-front undermount** farmhouse kitchen sink. Its exterior measures **30 × 21 × 10 inches** and its interior bowl measures **27 × 16 × 10 inches**.

These measurements support a source-measured parametric farmhouse profile with countertop seating, one drain, and a visible apron. It is eligible only on compatible 30-inch-or-wider farmhouse sink bases. The profile does not change cabinetry or pricing, and Pelican product images and DXF files remain display-only.

### Sources

61. [Pelican Int’l — PL-HA118 product page](https://buildpelican.com/products/pl-ha118)
62. [Pelican Int’l — PL-HA118 R15 specification sheet](https://cdn.accentuate.io/7876666196108/1729873514105/PL-HA118-R15.pdf?v=1729873514105)

## Next Verified Farmhouse Sink Candidate — PL-HA125 R0

Pelican’s current product page and official PL-HA125 R0 specification sheet identify this as a 16-gauge stainless-steel, double-bowl **apron-front undermount** farmhouse kitchen sink. Its exterior measures **35⅞ × 20¾ × 10 inches**. The documented bowls are asymmetric: the left bowl is **19 × 16 × 10 inches** and the right bowl is **13 × 16 × 10 inches**. The technical sheet identifies a double-bowl configuration and shows two drains.

An exact profile must preserve the distinct 19-inch left bowl and 13-inch right bowl rather than use equal-bowl geometry. The sink is eligible only on compatible 36-inch-or-wider farmhouse bases; it does not change cabinetry or pricing. Pelican product images and DXF files remain display-only.

### Sources

63. [Pelican Int’l — PL-HA125 product page](https://buildpelican.com/products/pl-ha125)
64. [Pelican Int’l — PL-HA125 R0 specification sheet](https://cdn.accentuate.io/7876666392716/1729873787540/PL-HA125-R0.pdf?v=1729873787540)

## Next Verified Farmhouse Sink Candidate — PL-HA124 R0

Pelican’s current product page and official PL-HA124 R0 specification sheet identify this as a 16-gauge stainless-steel, single-bowl **apron-front undermount** farmhouse kitchen sink. Its exterior measures **35⅞ × 20¾ × 10 inches** and its interior bowl measures **33 × 16 × 10 inches**.

These measurements support a source-measured parametric farmhouse profile with countertop seating, one drain, and a visible apron. The sink is eligible only on compatible 36-inch-or-wider farmhouse bases. It does not change cabinetry or pricing, and Pelican product images and DXF files remain display-only.

### Sources

65. [Pelican Int’l — PL-HA124 product page](https://buildpelican.com/products/pl-ha124)
66. [Pelican Int’l — PL-HA124 R0 specification sheet](https://cdn.accentuate.io/7876666294412/1729873733866/PL-HA124-R0.pdf?v=1729873733866)

## Next Verified Standard-Sink Candidate — PL-HA111 R0

Pelican’s current product page and official PL-HA111 R0 specification sheet identify this as a 16-gauge stainless-steel, single-bowl **undermount** kitchen sink. Its exterior measures **27 × 18 × 10 inches** and its interior bowl measures **25 × 16 × 10 inches**. Pelican also offers separate R15 and ADA variants, which remain outside this normal-depth R0 profile until each is independently measured.

The normal-depth source data supports a stainless measured parametric profile for compatible 27-inch-or-wider standard SB-style sink bases. It has no apron-front geometry, does not change farmhouse-base behavior, cabinetry, or pricing, and Pelican product images and DXF files remain display-only.

### Sources

67. [Pelican Int’l — PL-HA111 product page](https://buildpelican.com/products/pl-ha111)
68. [Pelican Int’l — PL-HA111 R0 specification sheet](https://cdn.accentuate.io/7876665802892/1729873006384/PL-HA111-R0.pdf?v=1729873006384)

## Next Verified Standard-Sink Candidate — PL-HA126 R0

Pelican’s current product page and official PL-HA126 R0 specification sheet identify this as a 16-gauge stainless-steel, double-bowl **undermount** kitchen sink. Its exterior measures **31¼ × 20½ × 10 inches**. Its bowls are asymmetric in both width and depth: the left bowl is **14 × 18 × 10 inches** and the right bowl is **13½ × 16 × 10 inches**. The technical sheet identifies a double-bowl configuration and shows two drains.

An exact profile cannot reuse the current common-depth double-bowl fields: its persisted fixture metadata and renderer must preserve both the distinct bowl widths and distinct bowl depths. Once that measured asymmetric-bowl support is in place, the sink can be offered for compatible 32-inch-or-wider standard SB-style bases. It has no apron-front geometry, changes no cabinetry or pricing, and Pelican product images and DXF files remain display-only.

### Sources

69. [Pelican Int’l — PL-HA126 product page](https://buildpelican.com/products/pl-ha126)
70. [Pelican Int’l — PL-HA126 R0 specification sheet](https://cdn.accentuate.io/7876666523788/1729873836731/PL-HA126-R0.pdf?v=1729873836732)

## Next Verified Standard-Sink Candidate — PL-HA117 R0

Pelican’s current product page and official PL-HA117 R0 specification sheet identify this as a 16- or 18-gauge stainless-steel, double-bowl **undermount** kitchen sink. Its exterior measures **32 × 18 × 10 inches** and each of the two bowls measures **14½ × 16 × 10 inches**. The technical sheet identifies a double-bowl configuration and shows two drains. Separate R15 and ADA variants remain outside this normal-depth R0 profile until independently sourced.

These source measurements support an equal double-bowl standard parametric profile for compatible 32-inch-or-wider SB-style sink bases. It has no apron-front geometry, does not change farmhouse behavior, cabinetry, or pricing, and product images or DXF files remain display-only.

### Sources

71. [Pelican Int’l — PL-HA117 product page](https://buildpelican.com/products/pl-ha117)
72. [Pelican Int’l — PL-HA117 R0 specification sheet](https://cdn.accentuate.io/7876666130572/1729873362647/PL-HA117-R0.pdf?v=1729873362647)

## Not Admitted to Exact Kitchen Placement Yet — PL-HA116

Pelican’s direct current `products/pl-ha116` URL returns a **404 Not Found** page. No current Pelican product page or official Pelican specification sheet was recovered, so the item remains outside the verified Designer fixture palette until its exact source, dimensions, installation class, and compatible sink-base requirement can be established. No third-party dimensions, catalog imagery, or generic substitute geometry are used.

## Not Admitted to Exact Kitchen Placement Yet — PL-HA112

Pelican’s direct current `products/pl-ha112` URL returns a **404 Not Found** page. No current Pelican product page or official Pelican specification sheet was recovered, so the item remains outside the verified Designer fixture palette until its exact source, dimensions, installation class, and compatible sink-base requirement can be established. No third-party dimensions, catalog imagery, or generic substitute geometry are used.

## Not Admitted to Exact Kitchen Placement Yet — PL-HA137

Pelican’s direct current `products/pl-ha137` URL returns a **404 Not Found** page. No current Pelican product page or official Pelican specification sheet was recovered, so the item remains outside the verified Designer fixture palette until its exact source, dimensions, installation class, and compatible sink-base requirement can be established. No third-party dimensions, catalog imagery, or generic substitute geometry are used.

## Not Admitted to Exact Kitchen Placement Yet — PL-FC3320WS

Pelican’s current `products/pl-fc3320ws` page confirms the product is active, but provides neither technical details nor a linked PDF, DXF, installation document, or specification sheet. Its related product imagery and third-party listings cannot establish source-verified dimensions or be used as model geometry. It remains outside the verified Designer fixture palette until Pelican publishes an authoritative technical source establishing its installation class, exterior and bowl measurements, and compatible sink-base requirement.

## Not Admitted to Exact Kitchen Placement Yet — PL-HA140

Pelican’s direct current `products/pl-ha140` URL returns a **404 Not Found** page. No current Pelican product page or official Pelican specification sheet was recovered, so the item remains outside the verified Designer fixture palette until its exact source, dimensions, installation class, and compatible sink-base requirement can be established. No third-party dimensions, catalog imagery, or generic substitute geometry are used.

## Not Admitted to Exact Kitchen Placement Yet — PL-WS4519 R0 16g

Pelican’s current product page and official specification sheet establish a 16-gauge stainless-steel, single-bowl **undermount workstation** sink with a 45 × 19 × 10-inch exterior and a 43 × 17 × 9½-inch bowl. However, its official feature list identifies dual graduated accessory ledges and integral workstation accessories, while the published dimensional drawing does not measure the ledge steps or their positions. A conventional single-bowl model would be a misleading generic substitute. This product remains outside the verified palette until Pelican provides sufficiently detailed workstation-ledge geometry. Its technical drawing, product images, and accessory images remain documentation/display-only rather than 3D model inputs.

### Sources

75. [Pelican Int’l — PL-WS4519 R0 product page](https://buildpelican.com/products/pl-ws4519-r0-16g)
76. [Pelican Int’l — PL-WS4519 R0 specification sheet](https://cdn.accentuate.io/9816841814156/1788220020311/PL-WS4519-R0.pdf?v=1788220020312)

## Next Verified Farmhouse Sink Candidate — PL-FC3620SB

Pelican’s current product page and official specification sheet identify PL-FC3620SB as a white fireclay, single-bowl, reversible **apron-front undermount** farmhouse kitchen sink. Its exterior measures **36 × 20 × 10 inches** and its interior bowl measures **34 9⁄16 × 18 9⁄16 × 9 inches**. The technical sheet identifies the single-bowl configuration and provides a 90-millimeter drain dimension.

These measurements support a source-measured parametric farmhouse profile with countertop seating, one drain, and a visible apron. The sink is eligible only on compatible 36-inch-or-wider farmhouse bases. It does not change cabinetry or pricing, and Pelican product images and DXF files remain display-only.

### Sources

77. [Pelican Int’l — PL-FC3620SB product page](https://buildpelican.com/products/pl-fc3620sb)
78. [Pelican Int’l — PL-FC3620SB specification sheet](https://cdn.accentuate.io/7876649746572/1729870771898/PL-FC3620SB.pdf?v=1729870771898)

## Next Verified Farmhouse Sink Candidate — PL-HA139 R15

Pelican’s current product page and official PL-HA139 R15 specification sheet identify this as a 16-gauge stainless-steel, double-bowl **apron-front undermount** farmhouse kitchen sink. Its exterior measures **33 × 21 × 10 inches**. Its bowls are asymmetric: the left bowl is **12 × 16 × 10 inches** and the right bowl is **17 × 16 × 10 inches**. The technical sheet identifies a double-bowl configuration and shows two drains.

An exact profile must preserve the documented left-to-right 12-inch and 17-inch bowl widths. The sink is eligible only on compatible 33-inch-or-wider farmhouse bases, including FSB-36. It does not change cabinetry or pricing, and Pelican product images and DXF files remain display-only.

### Sources

73. [Pelican Int’l — PL-HA139 product page](https://buildpelican.com/products/pl-ha139)
74. [Pelican Int’l — PL-HA139 R15 specification sheet](https://cdn.accentuate.io/7876666982540/1729874196839/PL-HA139-R15.pdf?v=1729874196839)
