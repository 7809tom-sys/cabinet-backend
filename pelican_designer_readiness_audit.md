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

## Next Verified Farmhouse Sink Candidate — PL-HA144 R10

Pelican’s current product page and official PL-HA144 R10 specification sheet identify this as a 16-gauge stainless-steel, single-bowl **apron-front undermount** farmhouse kitchen sink. Its exterior measures **33 × 21 × 10 inches** and its interior bowl measures **31 × 16 × 9¾ inches**. The source also identifies its integral front towel bar and optional gunmetal-black finish, neither of which may be inferred from catalog photography.

The published vessel, bowl, drain, countertop seating, and visible apron dimensions are sufficient for a source-measured parametric profile. The profile must not claim the unmeasured towel-bar geometry as an exact 3D feature. It is eligible only on compatible 33-inch-or-wider farmhouse bases, including FSB-36, and does not change cabinetry or pricing. Product images remain display-only.

### Sources

79. [Pelican Int’l — PL-HA144 product page](https://buildpelican.com/products/pl-ha144)
80. [Pelican Int’l — PL-HA144 R10 specification sheet](https://cdn.accentuate.io/8978112807052/1775059262434/PL-HA144-R10.pdf?v=1775059262434)

## Next Verified Farmhouse Sink Candidate — PL-HA148 R10

Pelican’s current product page and official PL-HA148 R10 specification sheet identify this as a 16-gauge stainless-steel, single-bowl **apron-front undermount** farmhouse kitchen sink. Its exterior measures **36 × 21 × 10 inches** and its interior bowl measures **34 × 16 × 9¾ inches**. The source identifies an integral front towel bar, but does not provide precise towel-bar geometry.

The measured vessel, bowl, drain, countertop seating, and visible apron are sufficient for a parametric profile; the unmeasured towel bar must not be inferred from product imagery. The sink is eligible only on compatible 36-inch-or-wider farmhouse bases and does not change cabinetry or pricing. Product images remain display-only.

### Sources

81. [Pelican Int’l — PL-HA148 product page](https://buildpelican.com/products/pl-ha148)
82. [Pelican Int’l — PL-HA148 R10 specification sheet](https://cdn.accentuate.io/8978112938124/1775058900343/PL-HA148-R10.pdf?v=1775058900343)

## Not Admitted to Exact Kitchen Placement Yet — PL-HA146

Pelican’s direct current `products/pl-ha146` URL returns a **404 Not Found** page. No current Pelican product page or official Pelican specification sheet was recovered, so the item remains outside the verified Designer fixture palette until its exact source, dimensions, installation class, and compatible sink-base requirement can be established. No third-party dimensions, catalog imagery, or generic substitute geometry are used.

## Not Admitted to Exact Kitchen Placement Yet — PL-FC3221SB

Pelican’s direct current `products/pl-fc3221sb` URL returns a **404 Not Found** page. No current Pelican product page or official Pelican specification sheet was recovered, so the item remains outside the verified Designer fixture palette until its exact source, dimensions, installation class, and compatible sink-base requirement can be established. No third-party dimensions, catalog imagery, or generic substitute geometry are used.

## Not Admitted to Exact Kitchen Placement Yet — PL-HA142

Pelican’s direct current `products/pl-ha142` URL returns a **404 Not Found** page. No current Pelican product page or official Pelican specification sheet was recovered, so the item remains outside the verified Designer fixture palette until its exact source, dimensions, installation class, and compatible sink-base requirement can be established. No third-party dimensions, catalog imagery, or generic substitute geometry are used.

## Next Verified Compact Farmhouse Sink Candidate — PL-FC2522SB

Pelican’s active kitchen-sink product page and official PL-FC2522SB specification sheet identify this white fireclay product as a single-bowl, reversible **apron-front undermount** sink. Pelican describes it as a compact laundry sink for smaller spaces while presenting it within its kitchen-sink catalogue. Its exterior measures **25 × 22 × 11⅝ inches** and its interior bowl measures **19⅞ × 14 × 11 inches**.

These measurements support a source-measured compact parametric farmhouse profile with countertop seating, one drain, and a visible apron. The profile is eligible only on a compatible farmhouse base with a conservative 27-inch-or-wider nominal opening. It does not change cabinetry or pricing, and Pelican product images remain display-only.

### Sources

83. [Pelican Int’l — PL-FC2522SB product page](https://buildpelican.com/products/pl-fc2522sb)
84. [Pelican Int’l — PL-FC2522SB specification sheet](https://cdn.accentuate.io/8980578369676/1775069308518/PL-FC2522SB.pdf?v=1776100502044)

## Not Admitted to Exact Kitchen Placement Yet — PL-FC3118WS Workstation

Pelican’s active product page and official specification sheet identify PL-FC3118WS as a black/grey/white fireclay, single-bowl **apron-front undermount workstation** sink. The source identifies graduated accessory ledges and included accessory components—a custom wood cutting board, roll-out drying rack, bottom grid, and stainless strainer. The technical drawing documents a **31¼ × 18¼ × 10⅛-inch** exterior and a **30¼ × 17¼ × 10⅛-inch** interior bowl.

The workstation ledge steps, accessory engagement positions, and accessory dimensions require explicit technical measurements before a faithful exact 3D profile can be admitted. A conventional farmhouse basin would be a misleading substitute, and product or accessory images cannot supply geometry. PL-FC3118WS remains outside the verified physical fixture palette until Pelican documents all geometry required for its workstation construction.

### Sources

85. [Pelican Int’l — PL-FC3118WS product page](https://buildpelican.com/products/pl-fc3118ws)
86. [Pelican Int’l — PL-FC3118WS specification sheet](https://cdn.accentuate.io/8980578402444/1775069194594/PL-FC3118WS.pdf?v=1776100478317)

## Pending Exact-Profile Evaluation — PL-CI6008 Self-Rimming Cast Iron Sink

Pelican’s active PL-CI6008 kitchen-sink product page and official specification sheet identify a white cast-iron, single-bowl **self-rimming** sink measuring **33 × 22 × 8⅝ inches**. The technical drawing documents a **29 27⁄32 × 16½ × 8 5⁄64-inch** interior bowl, a 90-millimeter drain, and four pre-drilled 35-millimeter faucet holes on 4-inch centers; the top-view drawing also documents the countertop-overlapping rim.

This differs materially from the current farmhouse and undermount fixture classes. Exact admission requires an authoritative bowl drawing and an explicit self-rimming profile—including the countertop-overlapping rim and faucet-hole geometry—rather than reusing an undermount or apron-front substitute. The product remains outside the verified physical fixture palette while that geometry is assessed; images remain display-only.

### Sources

87. [Pelican Int’l — PL-CI6008 product page](https://buildpelican.com/products/pl-ci6008)
88. [Pelican Int’l — PL-CI6008 specification sheet](https://cdn.accentuate.io/8980582793356/1776101842556/PL-CI6008-Spec.pdf?v=1776101842556)

## Next Verified Standard-Sink Candidate — PL-VS3218

Pelican’s active PL-VS3218 product page and its official normal-depth specification sheet identify this as a 16- or 18-gauge stainless-steel, single-bowl **undermount** kitchen sink. Its documented exterior measures **32⅛ × 18 × 9 inches** and its normal-depth interior bowl measures **30⅛ × 16 × 9 inches**. Pelican documents an ADA version separately, which cannot inherit this normal-depth bowl metadata.

These measurements support a source-measured stainless parametric profile for compatible 32-inch-or-wider standard SB-style sink bases. It has no apron-front geometry, does not change farmhouse-base behavior, cabinetry, or pricing, and product images and DXF files remain display-only.

### Sources

89. [Pelican Int’l — PL-VS3218 product page](https://buildpelican.com/products/pl-vs3218)
90. [Pelican Int’l — PL-VS3218 normal-depth specification sheet](https://cdn.accentuate.io/7876668227724/1729876598079/PL-VS3218.pdf?v=1758834311979)

## Next Verified Standard-Sink Candidate — PL-VS3018

Pelican’s active PL-VS3018 product page and official normal-depth specification sheet identify this as a 16- or 18-gauge stainless-steel, single-bowl **undermount** kitchen sink. Its normal-depth exterior measures **30 × 18 × 9 inches** and its interior bowl measures **28 × 16 × 9 inches**. Pelican presents an ADA variant separately, which cannot inherit the normal-depth bowl metadata.

These measurements support a source-measured stainless parametric profile for compatible 30-inch-or-wider standard SB-style sink bases. It has no apron-front geometry, does not change farmhouse-base behavior, cabinetry, or pricing, and product images and DXF files remain display-only.

### Sources

91. [Pelican Int’l — PL-VS3018 product page](https://buildpelican.com/products/pl-vs3018)
92. [Pelican Int’l — PL-VS3018 normal-depth specification sheet](https://cdn.accentuate.io/7876667965580/1729876393881/PL-VS3018.pdf?v=1758828574961)

## Not Admitted to Exact Kitchen Placement Yet — PL-VS2818 and PL-VS2518

Pelican’s direct current `products/pl-vs2818` and `products/pl-vs2518` URLs both return **404 Not Found** pages. Neither product has a current Pelican product page or official technical specification available from these URLs, so neither is eligible for physical placement in the Designer. No third-party dimensions, catalogue imagery, or generic substitute geometry are used.

## Not Admitted to Exact Kitchen Placement Yet — PL-VS3219

Pelican’s direct current `products/pl-vs3219` URL returns a **404 Not Found** page. No current Pelican product page or official technical specification was recovered, so this item is not eligible for physical placement in the Designer. No third-party dimensions, catalogue imagery, or generic substitute geometry are used.

## Pending Exact Drain-Offset Profile Support — PL-HA119 R19

Pelican’s active PL-HA119 product page and official specification sheet identify this as an 18-gauge stainless-steel, single-bowl **undermount** kitchen sink with a rear offset drain. Its exterior measures **31¼ × 18 × 10 inches** and its interior bowl measures **29¼ × 16 × 9½ inches**. The technical drawing locates the drain **5 inches from the bowl’s right side and 5 inches from its rear edge**.

The measured vessel and bowl are sufficient, but the current centered-drain sink geometry cannot represent the documented rear-right offset accurately. The profile remains outside the physical fixture palette until drain offsets can persist through the Designer and render in the correct orientation under rotation. No generic substitute geometry, product photography, or source-image texture is used.

### Sources

93. [Pelican Int’l — PL-HA119 product page](https://buildpelican.com/products/pl-ha119)
94. [Pelican Int’l — PL-HA119 R15 specification sheet](https://cdn.accentuate.io/8978112544908/1775067326529/PL-HA119-R15.pdf?v=1775067326529)

## Not Admitted to Exact Kitchen Placement Yet — PL-VS3618

Pelican’s direct current `products/pl-vs3618` URL returns a **404 Not Found** page. No current Pelican product page or official Pelican specification sheet was recovered, so the item remains outside the verified Designer fixture palette until its product identity, measurements, installation class, and sink-base compatibility can be established. No third-party dimensions, product imagery, or generic substitute geometry are used.

## Not Admitted to Exact Kitchen Placement Yet — PL-8205 and PL-8410

Pelican’s direct current `products/pl-8205` URL returns a **404 Not Found** page, so its product identity and dimensions cannot be verified for physical placement. PL-8410 remains active as a double-handle wall-mounted kitchen faucet, but its product page and Pelican’s current documentation library expose no official technical sheet with the wall-mount span, projected reach, outlet height, or other geometry required for a faithful profile. Both products remain outside the verified Designer fixture palette; no third-party dimensions, catalog imagery, or generic faucet substitutes are used.

## Not Admitted to Exact Kitchen Placement Yet — PL-8461

Pelican’s active PL-8461 product page identifies the item as a double-handle wall-mounted kitchen faucet. Its current product page exposes no official technical sheet or exact wall-mount span, spout reach, outlet height, and handle geometry. It remains outside the physical Designer fixture palette until Pelican provides that complete source documentation; no product imagery or generic faucet substitute is used.

## Next Verified Farmhouse Sink Candidate — PL-HA139 R15

Pelican’s current product page and official PL-HA139 R15 specification sheet identify this as a 16-gauge stainless-steel, double-bowl **apron-front undermount** farmhouse kitchen sink. Its exterior measures **33 × 21 × 10 inches**. Its bowls are asymmetric: the left bowl is **12 × 16 × 10 inches** and the right bowl is **17 × 16 × 10 inches**. The technical sheet identifies a double-bowl configuration and shows two drains.

An exact profile must preserve the documented left-to-right 12-inch and 17-inch bowl widths. The sink is eligible only on compatible 33-inch-or-wider farmhouse bases, including FSB-36. It does not change cabinetry or pricing, and Pelican product images and DXF files remain display-only.

### Sources

73. [Pelican Int’l — PL-HA139 product page](https://buildpelican.com/products/pl-ha139)
74. [Pelican Int’l — PL-HA139 R15 specification sheet](https://cdn.accentuate.io/7876666982540/1729874196839/PL-HA139-R15.pdf?v=1729874196839)

## Next Verified Standard-Sink Candidate — PL-VS2718

Pelican’s active product page and official normal-depth PL-VS2718 specification sheet identify this as a 16- or 18-gauge stainless-steel, single-bowl **undermount** kitchen sink. Its normal-depth exterior measures **27 × 18 × 9 inches** and its interior bowl measures **25 × 16 × 9 inches**. Pelican identifies the ADA version separately, so that shallow variant cannot inherit this normal-depth bowl profile.

These measurements support a source-measured stainless parametric profile for compatible 27-inch-or-wider standard SB-style sink bases. It has no apron-front geometry, does not change farmhouse-base behavior, cabinetry, or pricing, and product images and DXF files remain display-only.

### Sources

95. [Pelican Int’l — PL-VS2718 product page](https://buildpelican.com/products/pl-vs2718)
96. [Pelican Int’l — PL-VS2718 normal-depth specification sheet](https://cdn.accentuate.io/7876667900044/1729876262131/PL-VS2718.pdf?v=1742392624082)

## Next Verified Standard-Sink Candidate — PL-VS1815

Pelican’s active PL-VS1815 kitchen-sink product page and official technical specification sheet identify an 18-gauge stainless-steel, single-bowl **undermount** sink. Its exterior measures **18½ × 15 × 7 inches** and its interior bowl measures **16½ × 13 × 7 inches**. The technical drawing identifies a single centered drain and no special geometry beyond the documented rounded corners.

These measurements support a source-measured stainless parametric profile for compatible 21-inch-or-wider standard SB-style sink bases. It has no apron-front geometry, does not change farmhouse-base behavior, cabinetry, or pricing, and product images and DXF files remain display-only.

### Sources

97. [Pelican Int’l — PL-VS1815 product page](https://buildpelican.com/products/pl-vs1815)
98. [Pelican Int’l — PL-VS1815 specification sheet](https://cdn.accentuate.io/7876667375756/1729875932156/PL-VS1815.pdf?v=1742391310508)

## Next Verified Standard-Sink Candidate — PL-VS2118

Pelican’s active product page and official PL-VS2118 specification sheet identify this as an 18-gauge stainless-steel, single-bowl **undermount** kitchen sink. Its exterior measures **20⅝ × 17⅞ × 9 inches** and its interior bowl measures **18⅝ × 15⅞ × 9 inches**. The source identifies a single centered drain and no special geometry beyond documented rounded corners.

These measurements support a source-measured stainless parametric profile for compatible 21-inch-or-wider standard SB-style sink bases. It has no apron-front geometry, does not change farmhouse-base behavior, cabinetry, or pricing, and product images and DXF files remain display-only.

### Sources

99. [Pelican Int’l — PL-VS2118 product page](https://buildpelican.com/products/pl-vs2118)
100. [Pelican Int’l — PL-VS2118 specification sheet](https://cdn.accentuate.io/7876667408524/1729875967180/PL-VS2118.pdf?v=1742391427922)

## Next Verified Standard-Sink Candidate — PL-VS2318

Pelican’s active product page and official normal-depth PL-VS2318 specification sheet identify this as a 16- or 18-gauge stainless-steel, single-bowl **undermount** kitchen sink. Its normal-depth exterior measures **23 × 17¾ × 9 inches** and its interior bowl measures **21 × 15¾ × 9 inches**. The source identifies a single centered drain, and Pelican separately documents the ADA variant.

These measurements support a source-measured stainless parametric profile for compatible 24-inch-or-wider standard SB-style sink bases. It has no apron-front geometry, does not change farmhouse-base behavior, cabinetry, or pricing, and product images and DXF files remain display-only.

### Sources

101. [Pelican Int’l — PL-VS2318 product page](https://buildpelican.com/products/pl-vs2318)
102. [Pelican Int’l — PL-VS2318 normal-depth specification sheet](https://cdn.accentuate.io/7876667474060/1729876113634/PL-VS2318-.pdf?v=1742392230407)

## Not Admitted to Exact Kitchen Placement Yet — PL-VS2418

Pelican’s direct current `products/pl-vs2418` URL returns a **404 Not Found** page. No current Pelican product page or official Pelican specification sheet was recovered, so this product remains outside the verified physical Designer palette until its exact source, measurements, installation class, and compatible sink-base requirement can be established. No third-party dimensions, catalog imagery, or generic substitute geometry are used.

## Not Admitted to Exact Kitchen Placement Yet — PL-VS1515

Pelican’s direct current `products/pl-vs1515` URL returns a **404 Not Found** page. No current Pelican product page or official Pelican specification sheet was recovered, so this product remains outside the verified physical Designer palette until its exact source, measurements, installation class, and compatible sink-base requirement can be established. No third-party dimensions, catalog imagery, or generic substitute geometry are used.

## Not Admitted to Exact Kitchen Placement Yet — PL-HA143

Pelican’s direct current `products/pl-ha143` URL returns a **404 Not Found** page. No current Pelican product page or official Pelican specification sheet was recovered, so this product remains outside the verified physical Designer palette until its exact source, measurements, installation class, and compatible sink-base requirement can be established. No third-party dimensions, catalog imagery, or generic substitute geometry are used.

## Next Verified Standard-Sink Candidate — PL-HA108 R0

Pelican’s active product page and official PL-HA108 R0 specification sheet identify this as a 16- or 18-gauge stainless-steel, single-bowl **undermount** kitchen sink. Its exterior measures **23 × 18 × 10 inches** and its interior bowl measures **21 × 16 × 10 inches**. The source identifies a single centered drain; ADA and R15 variants are separately documented and cannot inherit this normal-depth R0 profile.

These measurements support a source-measured stainless parametric profile for compatible 24-inch-or-wider standard SB-style sink bases. It has no apron-front geometry, does not change farmhouse-base behavior, cabinetry, or pricing, and product images and DXF files remain display-only.

### Sources

103. [Pelican Int’l — PL-HA108 product page](https://buildpelican.com/products/pl-ha108)
104. [Pelican Int’l — PL-HA108 R0 specification sheet](https://cdn.accentuate.io/7876665376908/1729872673252/PL-HA108-R0.pdf?v=1729872673252)

## Not Admitted to Exact Kitchen Placement Yet — PL-VS3118

Pelican’s direct current `products/pl-vs3118` URL returns a **404 Not Found** page. No current Pelican product page or official Pelican specification sheet was recovered, so this product remains outside the verified physical Designer palette until its exact source, measurements, installation class, and compatible sink-base requirement can be established. No third-party dimensions, catalog imagery, or generic substitute geometry are used.

## Not Admitted to Exact Kitchen Placement Yet — PL-HA103

Pelican’s direct current `products/pl-ha103` URL returns a **404 Not Found** page. No current Pelican product page or official Pelican specification sheet was recovered, so this product remains outside the verified physical Designer palette until its exact source, measurements, installation class, and compatible sink-base requirement can be established. No third-party dimensions, catalog imagery, or generic substitute geometry are used.

## Not Admitted to Exact Kitchen Placement Yet — PL-HA107

Pelican’s direct current `products/pl-ha107` URL returns a **404 Not Found** page. No current Pelican product page or official Pelican specification sheet was recovered, so this product remains outside the verified physical Designer palette until its exact source, measurements, installation class, and compatible sink-base requirement can be established. No third-party dimensions, catalog imagery, or generic substitute geometry are used.

## Not Admitted to Exact Kitchen Placement Yet — PL-HA105

Pelican’s direct current `products/pl-ha105` URL returns a **404 Not Found** page. No current Pelican product page or official Pelican specification sheet was recovered, so this product remains outside the verified physical Designer palette until its exact source, measurements, installation class, and compatible sink-base requirement can be established. No third-party dimensions, catalog imagery, or generic substitute geometry are used.

## Not Admitted to Exact Kitchen Placement Yet — PL-CI6012

Pelican’s active PL-CI6012 product page and official specification sheet identify this as a white cast-iron, double-bowl **self-rimming** kitchen sink. The documented exterior is **43 × 22 × 10⅝ inches**. The sheet also specifies two 90-millimeter drains and **four pre-drilled 1⅜-inch faucet holes on 4-inch centers**, with compatibility for the PL-8480 faucet. Its drawing shows unequal bowl widths of **18 57⁄64 inches** and **16½ inches**.

The verified-only physical fixture gate remains closed for this item because the current standard undermount renderer cannot truthfully model its elevated self-rim, special cast-iron material, four-hole deck configuration, and the drawing does not label independent three-axis interior dimensions for both bowls in the same form used by the existing parametric sink profile. No generic undermount substitute, product image, or unmeasured visual feature is used.

### Sources

105. [Pelican Int’l — PL-CI6012 product page](https://buildpelican.com/products/pl-ci6012)
106. [Pelican Int’l — PL-CI6012 specification sheet](https://cdn.accentuate.io/8980582826124/1776101769649/PL-CI6012-Spec.pdf?v=1776101769649)

## Not Admitted to Exact Kitchen Placement Yet — PL-FC3321SB

Pelican’s active PL-FC3321SB product page and official specification sheet identify a white, matte-grey, or matte-black fireclay, single-bowl **apron-front undermount** sink. Its documented exterior measures **33 × 20⅞ × 10 inches** and its interior bowl measures **31⅝ × 19¾ × 10 inches**. The technical sheet and product page expressly identify a **curved apron front**.

The existing farmhouse renderer has a straight measured apron and the source does not provide the curved apron’s radius, depth, or sectional geometry. Its prior physical profile has therefore been withdrawn. This sink must remain outside the physical Designer fixture palette until the curve can be source-measured and faithfully rendered. No straight-apron substitute, product image, or inferred curvature is used.

### Sources

107. [Pelican Int’l — PL-FC3321SB product page](https://buildpelican.com/products/pl-fc3321sb)
108. [Pelican Int’l — PL-FC3321SB specification sheet](https://cdn.accentuate.io/8980578599052/1775068792025/PL-FC3321SB.pdf?v=1776100377350)

## Not Admitted to Exact Kitchen Placement Yet — PL-VS2321

Pelican’s active PL-VS2321 product page and official specification sheet identify this as an 18-gauge stainless-steel, single-bowl **undermount** kitchen sink. Its documented exterior measures **23½ × 20⅞ × 9 inches** and its interior bowl measures **21½ × 18⅞ × 9 inches**. Unlike the already admitted straight-walled sinks, its drawing specifies a drawn-bowl shape with a **47¼-inch inner radius**, a **35½-inch outer lower radius**, and additional 7⅞-inch and ¾-inch radii around the rim profile.

The current rectangular parametric renderer cannot represent those documented rounded bowl walls and rim transitions exactly. This sink remains outside the physical Designer fixture palette until the source-measured drawn-bowl radii can be persisted and faithfully rendered. No box-bowl substitute, catalog image, or inferred curvature is used.

### Sources

109. [Pelican Int’l — PL-VS2321 product page](https://buildpelican.com/products/pl-vs2321)
110. [Pelican Int’l — PL-VS2321 specification sheet](https://cdn.accentuate.io/7876667736204/1729876188293/PL-VS2321.pdf?v=1742392364751)

## Not Admitted to Exact Kitchen Placement Yet — PL-VS3070

Pelican’s active PL-VS3070 product page and official specification sheet identify a 16- or 18-gauge stainless-steel, double-bowl **undermount** kitchen sink. The documented exterior is **31½ × 20½ × 9 inches**. Its bowls are asymmetric: the left is **10⅝ × 16 × 7 inches** and the right is **17¾ × 18½ × 9 inches**. The drawing additionally specifies complex radii, including **3½-inch**, **3-inch**, **2-inch**, **1½-inch**, and **1⅜-inch** contours across the drawn bowls and rim.

Although the current fixture metadata supports independently measured bowl widths and depths, its rectangular sink renderer cannot faithfully reproduce those documented drawn-bowl radii and rim transitions. PL-VS3070 therefore remains outside the physical Designer palette until the source-measured curved geometry can be rendered exactly. No box-bowl substitute, catalog image, or inferred curvature is used.

### Sources

111. [Pelican Int’l — PL-VS3070 product page](https://buildpelican.com/products/pl-vs3070)
112. [Pelican Int’l — PL-VS3070 specification sheet](https://cdn.accentuate.io/7876668129420/1729876545002/PL-VS3070.pdf?v=1742392860993)

## Not Admitted to Exact Kitchen Placement Yet — PL-VT2522-1

Pelican’s active PL-VT2522 product page and official PL-VT2522-1 specification sheet identify an 18-gauge stainless-steel, single-bowl **top-mount** kitchen sink. Its exterior measures **25 × 22 × 8 inches** and its interior bowl measures **21 × 15¾ × 8 inches**. The drawing documents a raised rim, four bowl-corner radii of **3 inches**, and a **pre-drilled faucet-hole deck** on the rear rim.

The current standard-sink renderer can draw only a generic rounded bowl; it has no profile-specific three-inch-corner, raised top-mount rim, or faucet-deck model. The drawing identifies a pre-drilled deck but does not publish the deck’s complete hole size and placement dimensions, so they cannot be inferred. This model remains outside the physical Designer palette until those source-measured top-mount features can be persisted and rendered exactly. No undermount substitute, product image, or inferred geometry is used.

### Sources

113. [Pelican Int’l — PL-VT2522 product page](https://buildpelican.com/products/pl-vt2522)
114. [Pelican Int’l — PL-VT2522-1 specification sheet](https://cdn.accentuate.io/7876669145228/1729877217251/PL-VT2522-1-Spec.pdf?v=1729877217251)

## Official Active-Product Discovery Queue

Pelican’s live public product feed currently lists several kitchen sink models not in the verified physical palette, including **PL-GMB135**, **PL-GMB144**, **PL-CI6004**, **PL-CI8001**, **PL-CI8002**, **PL-CI8004**, **PL-125**, **PL-150**, **PL-VL5050**, **PL-WS400**, **PL-WS500**, **PL-VT6040**, **PL-VT5050**, and **PL-VT3322**. Their live listing alone is not sufficient for Designer admission. Each must be independently checked for an official technical drawing and for geometry that the exact renderer can reproduce without approximation.

### Source

115. [Pelican Int’l — live public product feed](https://buildpelican.com/products.json?limit=250)

## Not Admitted Under the Current Sink-Base Policy — PL-GMB135 R0

Pelican’s active PL-GMB135 page and official specification sheet identify this as a 16-gauge stainless-steel, single-bowl **retrofit apron-front** kitchen sink. The product page says the apron-front design rests on cabinetry and allows installation into existing standard kitchen cabinets without remodeling, while the technical sheet lists its installation as **apron front, undermount**. The measured exterior is **35½ × 21¼ × 9⅜ inches**, and the measured interior bowl is **32½ × 17¼ × 9⅛ inches**.

The current verified placement policy is intentionally stricter: any apron-front sink is offered only on a farmhouse base, and any standard SB-style base offers normal non-apron sinks only. The conflicting retrofit claim therefore prevents a truthful, policy-compliant palette placement until the owner establishes a distinct retrofit sink-base category and geometry rule. No standard-sink substitute, generic apron, product photograph, or inferred installation is used.

### Sources

116. [Pelican Int’l — PL-GMB135 product page](https://buildpelican.com/products/pl-gmb135)
117. [Pelican Int’l — PL-GMB135 R0 specification sheet](https://cdn.accentuate.io/8978112348300/1775067777812/PL-GMB135-R0.pdf?v=1775067777812)

## Not Admitted to Exact Physical Placement Yet — PL-150 Granite Composite

Pelican’s active PL-150 product page and official specification sheet identify this as a granite-composite, single-bowl **undermount** kitchen sink. Its exterior measures **29½ × 18¾ × 9½ inches**, and its interior bowl measures **27 × 16½ × 9½ inches**. Pelican offers the product in Alpina, Chroma, Concrete, Gunmetal, Mocha, Onyx, and Sand finishes.

Although its published overall and bowl dimensions are sufficient for basic parametric placement, the current exact sink profile stores neither a source-defined composite material nor the selected seven-color finish. The source does not publish numeric color values or complete formed corner/sidewall geometry. Rendering it in the generic stainless treatment or inferring color from catalog imagery would be misleading, so PL-150 remains outside the verified physical palette until source-referenced non-texture material definitions and its profile-specific formed geometry are supported.

### Sources

118. [Pelican Int’l — PL-150 product page](https://buildpelican.com/products/pl-150)
119. [Pelican Int’l — PL-150 specification sheet](https://cdn.accentuate.io/8059575566476/1737642094870/PL-150.pdf?v=1737642094870)

## Not Admitted to Exact Physical Placement Yet — PL-VL5050

Pelican’s active PL-VL5050 product page and official specification sheet identify an 18-gauge 304 stainless-steel double-bowl **drawn top-mount** kitchen sink. Its listed exterior is **32¼ × 18⅞ × 8½ inches**. The official product page links top-mount installation instructions, and the technical drawing depicts a formed deck/rim and drawn bowl sidewalls rather than the current sink renderer’s simple undermount rim and rectangular bowl construction.

Even though Pelican provides an official sheet, the current parametric profile does not support this product’s formed top-mount deck or its documented drawn bowl geometry. Rendering it as an undermount sink, using a generic rim, or inferring bowl form from catalog imagery would be misleading. It remains outside the verified physical palette until those exact special features can be represented and tested.

### Sources

120. [Pelican Int’l — PL-VL5050 product page](https://buildpelican.com/products/pl-vl5050)
121. [Pelican Int’l — PL-VL5050 specification sheet](https://cdn.accentuate.io/8138474619020/1745954728015/PL-VL5050.pdf?v=1745954728015)

## Not Admitted to Exact Kitchen Placement Yet — PL-HA114 and PL-HA106

Pelican’s direct current product URLs for **PL-HA114** and **PL-HA106** each return a **404 Not Found** page. No current Pelican product page or official specification sheet was recovered for either model. They remain outside the verified physical Designer palette until an authoritative source establishes their active product identity, installation class, exact dimensions, bowl geometry, and compatible sink-base requirement. No third-party dimensions, catalog imagery, or generic substitute geometry is used.

### Sources

122. [Pelican Int’l — PL-HA114 product URL](https://buildpelican.com/products/pl-ha114)
123. [Pelican Int’l — PL-HA106 product URL](https://buildpelican.com/products/pl-ha106)

## Not Admitted to Exact Kitchen Placement Yet — PL-8219

Pelican’s direct current `products/pl-8219` URL returns a **404 Not Found** page. No current Pelican product page or official technical specification was recovered. This faucet remains outside the verified physical Designer palette until Pelican documentation establishes its active product identity, kitchen role, overall height, spout reach, outlet height, and compatible fixture-placement geometry. No catalog image, third-party dimension, or generic faucet substitute is used.

### Source

124. [Pelican Int’l — PL-8219 product URL](https://buildpelican.com/products/pl-8219)

## Not Admitted to Exact Kitchen Placement Yet — PL-8480

Pelican’s active PL-8480 page identifies a deck-mounted, double-handle bridge kitchen faucet in Brushed Gold, Brushed Nickel, Chrome, and Matte Black finishes. However, the current product page exposes no official technical specification link, and the official documentation library search did not identify a PL-8480 drawing. Its overall height, spout reach, outlet height, hole spacing, and bridge geometry therefore remain undocumented for exact parametric placement. The item remains outside the verified physical Designer palette; no catalog image, third-party dimensions, or generic pull-down substitute is used.

### Source

125. [Pelican Int’l — PL-8480 product page](https://buildpelican.com/products/pl-8480)

## Not Admitted to Exact Physical Placement Yet — PL-8369 Wall-Mounted Pot Filler

Pelican’s active PL-8369 product page and official specification sheet identify an ADA-compliant, wall-mounted, single-lever kitchen pot filler with dual-jointed swing arms. The technical drawing documents a **24-inch spout length**, **3 5⁄32-inch spout height**, a **26 3⁄16-inch overall reach**, a **13-inch arm span**, and source-labeled 90-millimeter and 28-millimeter components. It is offered in Brushed Gold, Brushed Nickel, Chrome, and Matte Black finishes.

Pelican’s installation instructions confirm wall mounting but do **not** prescribe a fixed countertop-relative or range-relative mounting height. The current verified fixture workflow also places faucets only as sink-associated deck fixtures, while the current 3D renderer has no wall-mounted range host, articulated dual-arm hierarchy, or pot-filler mounting-height persistence. A September 2026 source review also confirmed that the drawing does not explicitly dimension the wall-side escutcheon/mounting plate or all visible base proportions, and the installation sheet provides an assembly sequence rather than those missing dimensions. It therefore cannot truthfully auto-place or completely model PL-8369 despite the documented arm envelope. The item remains outside the physical Designer palette until a complete official mounting drawing and a range-associated wall-faucet workflow preserve an explicit user-chosen mounting height and the documented extended arm geometry. No catalog image or generic sink faucet is substituted.

### Sources

126. [Pelican Int’l — PL-8369 product page](https://buildpelican.com/products/pl-8369)
127. [Pelican Int’l — PL-8369 specification sheet](https://cdn.accentuate.io/9507678257292/1784297892633/PL-8369-Spec.pdf?v=1784297892633)
128. [Pelican Int’l — PL-8369 installation instructions](https://cdn.accentuate.io/9507678257292/1784297936129/PL-8369-Installation-Instructions-(2).pdf?v=1784297936130)

## Next Verified Kitchen Faucet Candidate — PL-8257

Pelican’s active PL-8257 product page and official technical sheet identify this as an ADA-compliant, single-hole, single-lever **pull-down** kitchen faucet with a pull-out sprayer. Its source measurements are **17¾ inches overall height**, **8¼ inches spout length**, and **9½ inches spout height**. The sheet identifies Chrome, Brushed Nickel, and Matte Black finishes.

These documented values match the existing verified deck-faucet placement model: the profile can be physically attached only through the compatible sink-base workflow and retains the selected catalog finish. It does not alter cabinetry, pricing, or the sink-base compatibility gate; product images and technical drawings remain source evidence only and are not used as 3D assets.

### Sources

129. [Pelican Int’l — PL-8257 product page](https://buildpelican.com/products/pl-8145)
130. [Pelican Int’l — PL-8257 specification sheet](https://cdn.accentuate.io/8105530785932/1744290070437/PL-8257.pdf?v=1744290070437)

## Active Kitchen Faucet Collection Check — September 2026

Pelican’s current Kitchen faucet collection displayed **21 products** and mixes fixtures with non-faucet accessories. Visible items included wall-mounted PL-8410 and PL-8461, wall-mounted PL-8369 pot filler, accessories such as Air Switch Assembly and Flanges, and source-verified deck-mounted models PL-8206, PL-8248, PL-8213, and PL-8218. This confirms that only an active, source-documented, sink-mounted faucet of a renderer-supported form should enter the exact Designer palette; wall fixtures and accessories remain excluded until their distinct placement/geometry contracts exist.

### Source

131. [Pelican Int’l — current Kitchen faucet collection](https://buildpelican.com/collections/faucets/Kitchen?system_tags=kitchen)

## Not Admitted to Exact Physical Placement Yet — PL-GMB144 Obsidian Farmhouse Sink

Pelican’s active PL-GMB144 page and official R10 drawing identify a 16-gauge stainless-steel, apron-front undermount farmhouse sink with a single bowl, integrated front towel bar, fitted sound-deadening pads, and Stainless Steel or Gunmetal Black PVD finishes. The drawing supplies a **33 × 21 × 10-inch** exterior, a **31 × 16 × 9¾-inch** bowl, an R10 corner reference, a centered 114-millimeter drain, and 30-inch/23⅜-inch towel-bar spans.

The current farmhouse profile deliberately supports only source-measured plain stainless or fireclay bowls and straight aprons. Although PL-GMB144 has a compatible general installation role, the source does not completely dimension the towel bar’s cross-section, its attachment geometry, the apron profile, or a source-defined PVD material treatment. Omitting its expressly integrated towel bar or substituting the standard stainless model would misrepresent this premium product; inferring those values from product images is prohibited. PL-GMB144 therefore remains outside the physical Designer palette until a complete source dimension set and a material contract can retain its real towel-bar and Gunmetal Black variant without approximation.

### Sources

132. [Pelican Int’l — PL-GMB144 product page](https://buildpelican.com/products/pl-gmb144)
133. [Pelican Int’l — PL-GMB144 R10 specification sheet](https://cdn.accentuate.io/8978112446604/1775062193659/PL-GMB144-R10.pdf?v=1775062193659)

## Not Admitted to Exact Physical Placement Yet — PL-125 Crystallite Dual-Mount Sink

Pelican’s active PL-125 page and official drawing identify a single-bowl granite-composite sink with an offset drain and six named finishes: Alpina, Chroma, Concrete, Gunmetal, Onyx, and Sand. The drawing describes dual-mount installation, provides a top-mount cutout, and lists a **32 63⁄64 × 22 1⁄64 × 10-inch** exterior with a **30 33⁄64 × 17 33⁄64 × 10-inch** bowl. It also depicts the formed rim, a 13-millimeter cutout radius, the offset drain, and several preformed rear-deck positions.

The current physical sink workflow supports only source-measured straight-sided undermount or farmhouse profiles with approved material treatment. PL-125’s dual-mount/top-mount rim, formed composite walls, rear deck, offset drain, six finish variants, and its product-page apron-front description require a dedicated source-aligned profile and resolved sink-base role. Treating it as a standard stainless undermount or an ordinary farmhouse sink would erase documented features, while taking color or geometry from the catalog images is prohibited. PL-125 therefore remains outside the physical Designer palette pending a dedicated exact profile and material contract.

### Sources

134. [Pelican Int’l — PL-125 product page](https://buildpelican.com/products/pl-125)
135. [Pelican Int’l — PL-125 specification sheet](https://cdn.accentuate.io/8978111791244/1772658910634/PL-125.pdf?v=1772664110821)

## Not Admitted to Exact Physical Placement Yet — PL-CI6004 Forge Self-Rimming Sink

Pelican’s active PL-CI6004 page and official drawing identify a white cast-iron, porcelain-enamel, self-rimming kitchen sink with two bowls, four pre-drilled faucet holes on 4-inch centers, and stated compatibility with the PL-8480 bridge faucet. Its drawing lists a **33 × 22 × 8½-inch** exterior, shows a raised rim and four-hole deck, and documents unequal double-bowl/drain geometry.

The current physical sink renderer does not model a cast-iron porcelain material, raised self-rimming deck, four-hole faucet pattern, or the specified bridge faucet; PL-8480 also remains unverified for exact geometry. Converting PL-CI6004 to an undermount or replacing its deck with a single-hole faucet would remove source-defined features. It therefore remains outside the physical Designer palette until the self-rimming, material, multi-hole deck, and compatible faucet contracts can all be faithfully represented without catalog-image-derived substitutes.

### Sources

136. [Pelican Int’l — PL-CI6004 product page](https://buildpelican.com/products/pl-ci6004)
137. [Pelican Int’l — PL-CI6004 specification sheet](https://cdn.accentuate.io/8980582760588/1776101928435/PL-CI6004-Spec.pdf?v=1776101928436)

## Not Admitted to Exact Physical Placement Yet — PL-VT6040 Signature Top-Mount Sink

Pelican’s active PL-VT6040 page and official PL-VT6040-1 drawing identify an 18-gauge stainless-steel, top-mount sink with one pre-drilled faucet hole, a formed raised rim, rounded corners, and two unequal bowls. The drawing supplies a **33 × 22 × 9-inch** exterior, a **15¾ × 15⅝ × 9-inch** left bowl, a **12⅜ × 16 × 7-inch** right bowl, two drains, and source-labelled bowl/rim radii.

The current verified physical sink path supports straight-walled undermount and farmhouse sink forms. It does not yet reproduce a source-defined top-mount rim, pre-drilled deck, or the documented drawn-bowl radii. Recasting PL-VT6040 as a rectangular undermount or omitting its formed deck would misstate the selected product, and catalog photos cannot supply the missing geometry. PL-VT6040 therefore remains outside the physical Designer palette until a dedicated source-measured top-mount/drawn-bowl profile can persist and render its actual construction.

### Sources

138. [Pelican Int’l — PL-VT6040 product page](https://buildpelican.com/products/pl-vt6040)
139. [Pelican Int’l — PL-VT6040-1 specification sheet](https://cdn.accentuate.io/7876669407372/1729877587399/_PL-VT6040-1.pdf?v=1742389522523)

## Not Admitted to Exact Physical Placement Yet — PL-FC3020WS Fireclay Workstation Sink

Pelican’s active PL-FC3020WS page and official drawing identify a reversible-front, apron-front undermount fireclay workstation sink in White, Matte Grey, and Matte Black. The product includes graduated accessory ledges, a custom wood cutting board, a roll-out drying rack, a bottom grid, and a stainless-steel deluxe strainer. Its drawing supplies a **30 × 20 × 10-inch** exterior, a **27¾ × 18 × 9-inch** single bowl, and a 92-millimeter drain opening.

The current exact farmhouse-sink profile does not model source-defined workstation ledges or any of the included accessory products. Pelican’s drawing does not dimension the individual accessory bodies or provide the complete ledge/retention geometry needed to position them faithfully. A plain apron-front bowl would omit the selected product’s material functionality, while catalog imagery cannot supply the missing dimensions. PL-FC3020WS therefore remains outside the physical Designer palette until those source-measured workstation components can persist and render without approximation.

### Sources

140. [Pelican Int’l — PL-FC3020WS product page](https://buildpelican.com/products/pl-fc3020ws)
141. [Pelican Int’l — PL-FC3020WS specification sheet](https://cdn.accentuate.io/9714226987148/1786633188065/PL-FC3020WS.pdf?v=1786633188065)

## Not Admitted to Exact Physical Placement Yet — PL-FC3018SB Reversible Fireclay Farmhouse Sink

Pelican’s active PL-FC3018SB product page and readable official specification sheet identify a **30 × 18 × 10-inch**, single-bowl fireclay farmhouse sink with a **28⅝ × 16⅝ × 9¼-inch** bowl, an apron-front/undermount installation class, a reversible-front design, and White, Matte Grey, and Matte Black variants. The official sheet provides this general dimensional text but no plan/elevation drawing that locates the drain, defines the apron shape, or distinguishes the two selectable front configurations.

The existing farmhouse sink renderer must not infer this missing geometry from catalog images or silently collapse the reversible product to a generic straight-apron model. Its prior physical profile has therefore been withdrawn. PL-FC3018SB remains outside the physical Designer palette until a complete official drawing establishes the selected front geometry, drain position, countertop seating, and compatible farmhouse-base requirements.

### Sources

142. [Pelican Int’l — PL-FC3018SB product page](https://buildpelican.com/products/pl-fc3018sb)
143. [Pelican Int’l — PL-FC3018SB specification sheet](https://cdn.accentuate.io/9682969362572/1786578710369/PL-FC3018SB-Spec.pdf?v=1786578710369)

## Not Admitted to Exact Physical Placement Yet — PL-FC2418SB Reversible Fireclay Farmhouse Sink

Pelican’s active PL-FC2418SB product page and readable official specification sheet identify a white, single-bowl **24 × 18 × 10-inch** fireclay farmhouse sink with a **22½ × 16⅝ × 9-inch** bowl, apron-front/undermount installation, and two reversible faces: one designed and one flat. The product page also links a DXF reference. The specification sheet provides this general dimensional text but no plan/elevation drawing that locates the drain, defines the apron profile, or describes the distinct designed front.

The existing farmhouse sink renderer must not infer the missing drain or reversible-apron geometry from product photos, DXF artwork, or a generic sink front. Its prior physical profile has therefore been withdrawn. PL-FC2418SB remains outside the physical Designer palette until an official geometry drawing establishes the selected-front, apron, drain, countertop seating, and compatible farmhouse-base requirements.

### Sources

144. [Pelican Int’l — PL-FC2418SB product page](https://buildpelican.com/products/pl-fc2418sb)
145. [Pelican Int’l — PL-FC2418SB specification sheet](https://cdn.accentuate.io/7876648042636/1729870572366/PL-FC2418SB.pdf?v=1729870572366)

## Not Admitted to Exact Physical Placement Yet — PL-FC099

Pelican’s public product feed currently contains a PL-FC099 listing, but the direct active `products/pl-fc099` product URL returns **404 Not Found**. No current official product detail page or technical specification was available to establish its precise product identity, installation class, exterior and bowl dimensions, drain geometry, apron form, finish, or compatible sink-base rule.

PL-FC099 remains outside the physical Designer palette until Pelican exposes an authoritative current product page and complete technical documentation. No catalog-feed value, product photograph, or generic sink substitution is used as a physical model.

### Sources

146. [Pelican Int’l — current public product feed](https://buildpelican.com/products.json?limit=250)
147. [Pelican Int’l — PL-FC099 product URL](https://buildpelican.com/products/pl-fc099)

## Not Admitted to Exact Physical Placement Yet — PL-FC101

Pelican’s public product feed currently contains a PL-FC101 listing, but the direct active `products/pl-fc101` product URL returns **404 Not Found**. No current official product detail page or technical specification was available to establish its exact identity, installation class, bowl or drain geometry, apron form, materials, finish, or compatible sink-base rule.

PL-FC101 remains outside the physical Designer palette until Pelican provides an authoritative current product source and complete technical documentation. No catalog-feed entry, product photograph, or generic sink substitute is used as a physical model.

### Sources

148. [Pelican Int’l — current public product feed](https://buildpelican.com/products.json?limit=250)
149. [Pelican Int’l — PL-FC101 product URL](https://buildpelican.com/products/pl-fc101)

## Not Admitted to Exact Physical Placement Yet — PL-FC103

Pelican’s public product feed currently contains a PL-FC103 listing, but the direct active `products/pl-fc103` product URL returns **404 Not Found**. No current official product detail page or technical specification was available to establish its exact identity, installation class, bowl or drain geometry, apron form, materials, finish, or compatible sink-base rule.

PL-FC103 remains outside the physical Designer palette until Pelican provides an authoritative current product source and complete technical documentation. No catalog-feed entry, product photograph, or generic sink substitute is used as a physical model.

### Sources

150. [Pelican Int’l — current public product feed](https://buildpelican.com/products.json?limit=250)
151. [Pelican Int’l — PL-FC103 product URL](https://buildpelican.com/products/pl-fc103)

## Admitted Physical Placement — PL-HA109 R0 Standard Undermount Sink

Pelican’s active PL-HA109 product page and official R0 drawing establish a 304 stainless-steel handmade standard undermount sink with a satin-brushed finish, a **30 × 18 × 10-inch** exterior, a **28 × 16 × 10-inch** single bowl, and a drain centered laterally but **1 inch from the bowl’s rear edge**. The revised source-driven renderer preserves the rear-center drain on every saved wall orientation rather than falling back to an inferred generic location.

The normal-depth PL-HA109 remains available only on standard SB-style sink bases with a nominal 30-inch-or-wider opening. Its separate ADA variants retain their existing distinct shallow-depth profile and do not inherit this normal-depth geometry.

### Sources

152. [Pelican Int’l — PL-HA109 product page](https://buildpelican.com/products/pl-ha109)
153. [Pelican Int’l — PL-HA109 R0 specification sheet](https://cdn.accentuate.io/7876665442444/1729872829476/PL-HA109-R0.pdf?v=1729872829477)

## Retain Exclusion — PL-HA135 R0 Retrofit Apron-Front Sink

Pelican’s active product page and R0 drawing establish a 16-gauge 304 stainless-steel, satin-brushed single-bowl sink with a **35½ × 21¼ × 9⅜-inch** exterior and **32½ × 17¼ × 9⅛-inch** bowl. They also establish centered drain and side-view geometry. However, Pelican explicitly identifies the sink’s apron as a **retrofit apron front** that allows installation in existing standard kitchen cabinets without remodel or custom cabinetry.

That intended compatibility conflicts with the Designer’s preserved policy: apron-front fixtures are placed only on farmhouse bases with a supported countertop opening and visible cabinet-face apron; standard SB-style bases accept undermounts only. Adding PL-HA135 would require a distinct verified retrofit cabinet/opening contract rather than silently treating it as either a standard undermount or an ordinary farmhouse sink. It therefore remains outside the physical palette.

### Sources

154. [Pelican Int’l — PL-HA135 product page](https://buildpelican.com/products/pl-ha135)
155. [Pelican Int’l — PL-HA135 R0 specification sheet](https://cdn.accentuate.io/8978112643212/1775067586424/PL-HA135-R0.pdf?v=1775067586424)

## Retain Exclusion — PL-HA127

Pelican’s current direct PL-HA127 product URL returns **404 Not Found**. No active official product page or technical sheet is available to verify the fixture’s installation form, exterior, bowl, drain, finish, or compatible sink-base rule. It remains outside the physical Designer palette rather than receiving a catalog-feed or generic substitute.

### Source

156. [Pelican Int’l — PL-HA127 product URL](https://buildpelican.com/products/pl-ha127)

## Retain Exclusion — PL-8107 Cascade Vanity Faucet

Pelican’s active PL-8107 product page identifies this 7⅝-inch ADA-compliant Cascade Series product as a **bathroom vanity faucet**, not a kitchen faucet. Although the product has a specification sheet and Brushed Nickel, Chrome, and Matte Black variants, admitting it into a kitchen sink-base flow would misrepresent its documented intended role. It therefore remains absent from the kitchen Designer fixture palette.

### Source

157. [Pelican Int’l — PL-8107 product page](https://buildpelican.com/products/pl-8107)

## Admitted Physical Placement — PL-8206 Fountain Articulated Kitchen Faucet

The current direct product URL is unavailable, but Pelican’s accessible official PL-8206 technical sheet identifies an ADA-compliant, single-hole, single-lever **Kitchen Faucet** with a pull-out sprayer and two 360-degree swing joints. It documents a **10½-inch overall height**, **9¾-inch spout length**, and **9¼-inch spout height**, matching the existing source-verified physical profile. Brushed Nickel, Chrome, and Matte Black persist as the available registered finish variants.

The profile remains available only through the compatible sink-base fixture workflow. No product image or generic faucet form is used as its 3D model.

### Sources

158. [Pelican Int’l — PL-8206 product URL](https://buildpelican.com/products/pl-8206)
159. [Pelican Int’l — PL-8206 technical sheet](https://cdn.accentuate.io/8105530654860/1744229984387/PL-8206.pdf?v=1744229984387)

## Retain Exclusion — PL-8480 Deck-Mounted Bridge Kitchen Faucet

Pelican’s active PL-8480 product page identifies a deck-mounted, double-handle **bridge** kitchen faucet with Brushed Gold, Brushed Nickel, Chrome, and Matte Black options. The page supplies no official technical drawing, mounting-hole spacing, overall height, spout reach, outlet datum, or handle geometry. In addition, the existing verified faucet contract represents only single-hole deck fixtures. PL-8480 therefore remains outside the physical kitchen palette until Pelican provides complete source measurements and a distinct exact bridge-faucet contract is available.

### Source

159. [Pelican Int’l — PL-8480 product page](https://buildpelican.com/products/pl-8480)

## Retain Exclusion — PL-8515 Flowline Freestanding Bathtub Faucet

Pelican’s active PL-8515 product page identifies this Flowline Series item as a single-handle, floor-mounted freestanding **bathtub faucet** with hand shower. It is designed to operate outside the tub basin for bathroom use, not at a kitchen sink base. It therefore remains absent from the kitchen Designer fixture palette.

### Source

160. [Pelican Int’l — PL-8515 product page](https://buildpelican.com/products/pl-8515)

## Admitted Physical Placement — PL-8248 Fountain Pull-Out Kitchen Faucet

The current direct product URL is unavailable, but Pelican’s accessible official PL-8248 technical sheet identifies an ADA-compliant, single-hole, single-lever **Kitchen Faucet** with a pull-out sprayer. It documents a **12⅜-inch overall height**, **10¹⁄₁₆-inch spout length**, and **10⅞-inch spout height**, matching the existing source-verified physical profile. Brushed Nickel, Chrome, and Matte Black persist as the available registered finish variants.

The profile remains available only through the compatible sink-base fixture workflow. No product image or generic faucet form is used as its 3D model.

### Sources

161. [Pelican Int’l — PL-8248 product URL](https://buildpelican.com/products/pl-8248)
162. [Pelican Int’l — PL-8248 technical sheet](https://cdn.accentuate.io/8105530687628/1744289003241/PL-8248.pdf?v=1744289003241)

## Retain Exclusion — PL-8538 Flowline Freestanding Bathtub Faucet

Pelican’s active PL-8538 product page identifies this Flowline Series item as a single-handle, floor-mounted freestanding **bathtub faucet** with hand shower. It is designed to operate outside a tub basin for bathroom use, not at a kitchen sink base. It therefore remains absent from the kitchen Designer fixture palette.

### Source

162. [Pelican Int’l — PL-8538 product page](https://buildpelican.com/products/pl-8538)

## Retain Exclusion — PL-HA121

Pelican’s current direct PL-HA121 product URL returns **404 Not Found**. No active official product page or technical sheet establishes the model’s installation form, exterior and bowl dimensions, drain geometry, material, finish, or compatible sink-base rule. It remains outside the physical kitchen fixture palette rather than receiving a generic substitute.

### Source

163. [Pelican Int’l — PL-HA121 product URL](https://buildpelican.com/products/pl-ha121)

## Source-Verified Drain Datum — PL-HA104 R0 Standard Undermount Sink

Pelican’s official PL-HA104 R0 drawing identifies a 16-gauge stainless-steel single-bowl undermount sink with a **17 × 18 × 10-inch** exterior and a **15 × 16 × 10-inch** interior. Its plan drawing places the drain on the bowl centerline and labels the drain center **1 inch from the rear bowl edge**. The physical profile must preserve this rear-center drain datum rather than use the generic sink-drain fallback.

### Source

164. [Pelican Int’l — PL-HA104 R0 technical drawing](https://cdn.accentuate.io/7876665278604/1729872420755/PL-HA104-R0.pdf?v=1729872420755)

## Source-Verified Drain Datum — PL-HA108 R0 Standard Undermount Sink

Pelican’s official PL-HA108 R0 drawing identifies a 16- or 18-gauge stainless-steel single-bowl undermount sink with a **23 × 18 × 10-inch** exterior and a **21 × 16 × 10-inch** interior. Its plan drawing places the drain on the bowl centerline and labels the drain center **1 inch from the rear bowl edge**. The physical profile must preserve this rear-center drain datum rather than use the generic sink-drain fallback.

### Source

165. [Pelican Int’l — PL-HA108 R0 technical drawing](https://cdn.accentuate.io/7876665376908/1729872673252/PL-HA108-R0.pdf?v=1729872673252)

## Source-Verified Drain Datum — PL-HA111 R0 Standard Undermount Sink

Pelican’s official PL-HA111 R0 drawing identifies a 16-gauge stainless-steel single-bowl undermount sink with a **27 × 18 × 10-inch** exterior and a **25 × 16 × 10-inch** interior. Its plan drawing places the drain on the bowl centerline and labels the drain center **1 inch from the rear bowl edge**. The physical profile must preserve this rear-center drain datum rather than use the generic sink-drain fallback.

### Source

166. [Pelican Int’l — PL-HA111 R0 technical drawing](https://cdn.accentuate.io/7876665802892/1729873006384/PL-HA111-R0.pdf?v=1729873006384)

## Source-Verified Drain Datum — PL-HA117 R0 Standard Double-Bowl Undermount Sink

Pelican’s official PL-HA117 R0 drawing confirms a 16- or 18-gauge stainless-steel **double-bowl** undermount sink with a **32 × 18 × 10-inch** exterior and two **14½ × 16 × 10-inch** bowls. It locates each bowl’s drain on its centerline and **120 mm (4.724 inches) from the rear bowl edge**. The physical profile must retain this shared rear-center drain datum for both bowls rather than use a generic double-bowl fallback.

### Source

167. [Pelican Int’l — PL-HA117 R0 technical drawing](https://cdn.accentuate.io/7876666130572/1729873362647/PL-HA117-R0.pdf?v=1729873362647)

## Source-Verified Drain Datum — PL-HA118 R15 Farmhouse Sink

Pelican’s official PL-HA118 R15 drawing identifies a 16-gauge stainless-steel apron-front undermount sink with a **30 × 21 × 10-inch** exterior and a **27 × 16 × 10-inch** single bowl. Its plan drawing places the drain on the bowl centerline and labels the drain center **120 mm (4.724 inches) from the rear bowl edge**. The physical farmhouse profile must preserve this rear-center drain datum rather than use the generic sink-drain fallback.

### Source

168. [Pelican Int’l — PL-HA118 R15 technical drawing](https://cdn.accentuate.io/7876666196108/1729873514105/PL-HA118-R15.pdf?v=1729873514105)

## Source-Verified Drain Datum — PL-HA125 R0 Asymmetric Double-Bowl Farmhouse Sink

Pelican’s official PL-HA125 R0 drawing confirms a 16-gauge stainless-steel apron-front undermount sink with a **35⅞ × 20¾ × 10-inch** exterior, a **19 × 16 × 10-inch** left bowl, and a **13 × 16 × 10-inch** right bowl. The plan locates both drains on their respective bowl centerlines and **120 mm (4.724 inches) from the rear bowl edge**. The physical profile must retain the shared rear-center datum for both asymmetric bowls rather than use a generic double-bowl fallback.

### Source

169. [Pelican Int’l — PL-HA125 R0 technical drawing](https://cdn.accentuate.io/7876666392716/1729873787540/PL-HA125-R0.pdf?v=1729873787540)

## Source-Verified Drain Datum — PL-HA124 R0 Farmhouse Sink

Pelican’s official PL-HA124 R0 drawing identifies a 16-gauge stainless-steel apron-front undermount sink with a **35⅞ × 20¾ × 10-inch** exterior and a **33 × 16 × 10-inch** single bowl. Its plan drawing places the drain on the bowl centerline and labels the drain center **120 mm (4.724 inches) from the rear bowl edge**. The physical farmhouse profile must preserve this rear-center drain datum rather than use the generic sink-drain fallback.

### Source

170. [Pelican Int’l — PL-HA124 R0 technical drawing](https://cdn.accentuate.io/7876666294412/1729873733866/PL-HA124-R0.pdf?v=1729873733866)

## Source-Verified Drain Datum — PL-HA115 R0 Standard Undermount Sink

Pelican’s official PL-HA115 R0 drawing identifies a 16- or 18-gauge stainless-steel single-bowl undermount sink with a **32 × 18 × 10-inch** exterior and a **30 × 16 × 10-inch** interior. Its plan drawing places the drain on the bowl centerline and labels the drain center **120 mm (4.724 inches) from the rear bowl edge**. The physical profile must preserve this rear-center drain datum rather than use the generic sink-drain fallback.

### Source

171. [Pelican Int’l — PL-HA115 R0 technical drawing](https://cdn.accentuate.io/7876665966732/1729873248748/PL-HA115-R0.pdf?v=1729873248749)

## Source-Verified Drain Datum — PL-HA130 R0 Double-Bowl Farmhouse Sink

Pelican’s official PL-HA130 R0 drawing identifies a 16-gauge stainless-steel apron-front undermount sink with a **36 × 21 × 10-inch** exterior and two **16 × 16 × 10-inch** bowls. The plan locates both drains on their respective bowl centerlines and **120 mm (4.724 inches) from the rear bowl edge**. The physical profile must retain this shared rear-center drain datum for both bowls rather than use a generic double-bowl fallback.

### Source

172. [Pelican Int’l — PL-HA130 R0 technical drawing](https://cdn.accentuate.io/7876666818700/1729873984961/PL-HA130-R0.pdf?v=1729873984961)

## Source-Verified Drain Datum — PL-HA122 R15 Farmhouse Sink

Pelican’s official PL-HA122 R15 drawing identifies a 16-gauge stainless-steel apron-front undermount sink with a **32⅞ × 20¾ × 10-inch** exterior and a **30 × 16 × 10-inch** single bowl. Its plan drawing places the drain on the bowl centerline and labels the drain center **120 mm (4.724 inches) from the rear bowl edge**. The physical farmhouse profile must preserve this rear-center drain datum rather than use the generic sink-drain fallback.

### Source

173. [Pelican Int’l — PL-HA122 R15 technical drawing](https://cdn.accentuate.io/7876666261644/1729873641877/PL-HA122-R15-(1).pdf?v=1729873641877)

## Source-Verified Drain Datum — PL-HA136 R15 Asymmetric Double-Bowl Farmhouse Sink

Pelican’s official PL-HA136 R15 drawing identifies a 16-gauge stainless-steel apron-front undermount sink with a **33 × 21 × 10-inch** exterior, a **17 × 16 × 10-inch** left bowl, and a **12 × 16 × 10-inch** right bowl. The plan locates both drains on their respective bowl centerlines and **120 mm (4.724 inches) from the rear bowl edge**. The physical profile must retain this shared rear-center datum for both asymmetric bowls rather than use a generic double-bowl fallback.

### Source

174. [Pelican Int’l — PL-HA136 R15 technical drawing](https://cdn.accentuate.io/7876666949772/1729874053747/PL-HA136-R15.pdf?v=1729874053747)

## Source-Verified Drain Datum — PL-HA139 R15 Asymmetric Double-Bowl Farmhouse Sink

Pelican’s official PL-HA139 R15 drawing identifies a 16-gauge stainless-steel apron-front undermount sink with a **33 × 21 × 10-inch** exterior, a **12 × 16 × 10-inch** left bowl, and a **17 × 16 × 10-inch** right bowl. The plan locates both drains on their respective bowl centerlines and **120 mm (4.724 inches) from the rear bowl edge**. The physical profile must retain this shared rear-center datum for both asymmetric bowls rather than use a generic double-bowl fallback.

### Source

175. [Pelican Int’l — PL-HA139 R15 technical drawing](https://cdn.accentuate.io/7876666982540/1729874196839/PL-HA139-R15.pdf?v=1729874196839)

## Source-Verified Drain Datum — PL-HA144 R10 Farmhouse Sink

Pelican’s official PL-HA144 R10 drawing identifies a 16-gauge stainless-steel apron-front undermount sink with a **33 × 21 × 10-inch** exterior and a **31 × 16 × 9¾-inch** single bowl. Its plan drawing places the drain on the bowl centerline and labels the drain center **120 mm (4.724 inches) from the rear bowl edge**. The physical farmhouse profile must preserve this rear-center drain datum rather than use the generic sink-drain fallback.

### Source

176. [Pelican Int’l — PL-HA144 R10 technical drawing](https://cdn.accentuate.io/8978112807052/1775059262434/PL-HA144-R10.pdf?v=1775059262434)

## Source-Verified Drain Datum — PL-HA148 R10 Farmhouse Sink

Pelican’s official PL-HA148 R10 drawing identifies a 16-gauge stainless-steel apron-front undermount sink with a **36 × 21 × 10-inch** exterior and a **34 × 16 × 9¾-inch** single bowl. Its plan drawing places the drain on the bowl centerline and labels the drain center **120 mm (4.724 inches) from the rear bowl edge**. The physical farmhouse profile must preserve this rear-center drain datum rather than use the generic sink-drain fallback.

### Source

177. [Pelican Int’l — PL-HA148 R10 technical drawing](https://cdn.accentuate.io/8978112938124/1775058900343/PL-HA148-R10.pdf?v=1775058900343)

## Retain Exclusion — PL-FC2522SB Fireclay Farmhouse Sink

Pelican’s official PL-FC2522SB drawing documents a **25 × 22 × 11⅝-inch** exterior and a **19⅞ × 14 × 11-inch** single bowl. It also identifies a **reversible front design**, but does not provide enough measured geometry to distinguish the reversible apron configurations or a numerical plan datum for the drain center. The current simple physical profile cannot honestly substitute a generic rectangular apron and inferred drain for those missing source details.

PL-FC2522SB must therefore remain outside physical Designer placement until Pelican supplies a source-complete drawing for the selected reversible-front geometry and drain position. The catalog record remains unaffected.

### Source

178. [Pelican Int’l — PL-FC2522SB technical drawing](https://cdn.accentuate.io/8980578369676/1775069308518/PL-FC2522SB.pdf?v=1776100502044)

## Source-Verified Drain Datum — PL-HA126 R0 Asymmetric Double-Bowl Standard Undermount Sink

Pelican’s official PL-HA126 R0 drawing confirms a 16-gauge stainless-steel double-bowl undermount sink with a **31¼ × 20½ × 10-inch** exterior, a **14 × 18 × 10-inch** left bowl, and a **13½ × 16 × 10-inch** right bowl. The plan locates both drains on their respective bowl centerlines and **120 mm (4.724 inches) from the rear bowl edge**. The physical profile must retain this shared rear-center datum for both independently measured bowls rather than use a generic double-bowl fallback.

### Source

179. [Pelican Int’l — PL-HA126 R0 technical drawing](https://cdn.accentuate.io/7876666523788/1729873836731/PL-HA126-R0.pdf?v=1729873836732)

## Source-Verified Drain Datum — PL-HA128 R15 Double-Bowl Farmhouse Sink

Pelican’s official PL-HA128 R15 drawing confirms a 16-gauge stainless-steel apron-front undermount sink with a **33 × 21 × 10-inch** exterior and two **14½ × 16 × 10-inch** bowls. The plan locates both drains on their respective bowl centerlines and **120 mm (4.724 inches) from the rear bowl edge**. The physical profile must retain this shared rear-center datum for both bowls rather than use a generic double-bowl fallback.

### Source

180. [Pelican Int’l — PL-HA128 R15 technical drawing](https://cdn.accentuate.io/7876666720396/1729873935066/PL-HA128-R15-%282%29.pdf?v=1729873935067)

## Drain-Datum Source Limit — PL-VS3218 Standard Undermount Sink

Pelican’s official PL-VS3218 drawing confirms the existing **32⅛ × 18 × 9-inch** exterior and **30⅛ × 16 × 9-inch** single-bowl dimensions, together with the documented rounded bowl-corner radii. Although the plan depicts the drain opening, it does **not** supply a numerical rear or lateral drain-center datum. No new `drainInset` metadata is introduced from this drawing, and the source must not be used to infer an offset for an exact-plan correction.

### Source

181. [Pelican Int’l — PL-VS3218 technical drawing](https://cdn.accentuate.io/7876668227724/1729876598079/PL-VS3218.pdf?v=1758834311979)

## Drain-Datum Source Limit — PL-VS3018 Standard Undermount Sink

Pelican’s official PL-VS3018 drawing confirms the existing **30 × 18 × 9-inch** exterior and **28 × 16 × 9-inch** single-bowl dimensions, including documented rounded bowl-corner radii. It does **not** state a numerical rear or lateral drain-center datum. No `drainInset` metadata is introduced from this drawing, and the source must not be used to infer an offset for an exact-plan correction.

### Source

182. [Pelican Int’l — PL-VS3018 technical drawing](https://cdn.accentuate.io/7876667965580/1729876393881/PL-VS3018.pdf?v=1758828574961)

## Drain-Datum Source Limit — PL-VS2718 Standard Undermount Sink

Pelican’s official PL-VS2718 drawing confirms the existing **27 × 18 × 9-inch** exterior and **25 × 16 × 9-inch** single-bowl dimensions, including documented rounded bowl-corner radii. It does **not** state a numerical rear or lateral drain-center datum. No `drainInset` metadata is introduced from this drawing, and the source must not be used to infer an offset for an exact-plan correction.

### Source

183. [Pelican Int’l — PL-VS2718 technical drawing](https://cdn.accentuate.io/7876667900044/1729876262131/PL-VS2718.pdf?v=1742392624082)

## Drain-Datum Source Limit — PL-VS1815 Compact Standard Undermount Sink

Pelican’s official PL-VS1815 drawing confirms the existing **18½ × 15 × 7-inch** exterior and **16½ × 13 × 7-inch** single-bowl dimensions, including documented rounded bowl-corner radii. It does **not** state a numerical rear or lateral drain-center datum. No `drainInset` metadata is introduced from this drawing, and the source must not be used to infer an offset for an exact-plan correction.

### Source

184. [Pelican Int’l — PL-VS1815 technical drawing](https://cdn.accentuate.io/7876667375756/1729875932156/PL-VS1815.pdf?v=1742391310508)

## Drain-Datum Source Limit — PL-VS2118 Compact Standard Undermount Sink

Pelican’s official PL-VS2118 drawing confirms the existing **20⅝ × 17⅞ × 9-inch** exterior and **18⅝ × 15⅞ × 9-inch** single-bowl dimensions, including documented rounded bowl-corner radii. It does **not** state a numerical rear or lateral drain-center datum. No `drainInset` metadata is introduced from this drawing, and the source must not be used to infer an offset for an exact-plan correction.

### Source

185. [Pelican Int’l — PL-VS2118 technical drawing](https://cdn.accentuate.io/7876667408524/1729875967180/PL-VS2118.pdf?v=1742391427922)

## Drain-Datum Source Limit — PL-VS2318 Standard Undermount Sink

Pelican’s official PL-VS2318 drawing confirms the existing **23 × 17¾ × 9-inch** exterior and **21 × 15¾ × 9-inch** single-bowl dimensions, including documented rounded bowl-corner radii. It does **not** state a numerical rear or lateral drain-center datum. No `drainInset` metadata is introduced from this drawing, and the source must not be used to infer an offset for an exact-plan correction.

### Source

186. [Pelican Int’l — PL-VS2318 technical drawing](https://cdn.accentuate.io/7876667474060/1729876113634/PL-VS2318-.pdf?v=1742392230407)

## Retain Exclusion — PL-HA129

Pelican’s current direct PL-HA129 product URL returns **404 Not Found**. No active official product page or technical drawing establishes its intended installation, bowl geometry, drain datum, material treatment, finish set, or sink-base fit. It remains outside the physical Designer palette rather than receiving a generic sink substitute.

### Source

187. [Pelican Int’l — PL-HA129 product URL](https://buildpelican.com/products/pl-ha129)

## Retain Exclusion — PL-HA131

Pelican’s current direct PL-HA131 product URL returns **404 Not Found**. No active official product page or technical drawing establishes its intended installation, bowl geometry, drain datum, material treatment, finish set, or sink-base fit. It remains outside the physical Designer palette rather than receiving a generic sink substitute.

### Source

188. [Pelican Int’l — PL-HA131 product URL](https://buildpelican.com/products/pl-ha131)

## Retain Exclusion — PL-HA132

Pelican’s current direct PL-HA132 product URL returns **404 Not Found**. No active official product page or technical drawing establishes its intended installation, bowl geometry, drain datum, material treatment, finish set, or sink-base fit. It remains outside the physical Designer palette rather than receiving a generic sink substitute.

### Source

189. [Pelican Int’l — PL-HA132 product URL](https://buildpelican.com/products/pl-ha132)

## Retain Exclusion — PL-HA141

Pelican’s current direct PL-HA141 product URL returns **404 Not Found**. No active official product page or technical drawing establishes its intended installation, bowl geometry, drain datum, material treatment, finish set, or sink-base fit. It remains outside the physical Designer palette rather than receiving a generic sink substitute.

### Source

190. [Pelican Int’l — PL-HA141 product URL](https://buildpelican.com/products/pl-ha141)

## Source-Verified Profile Audit — PL-HA119 R19 Offset-Drain Standard Undermount Sink

Pelican’s official PL-HA119 R19 drawing confirms the existing physical profile: an **18-gauge stainless-steel**, single-bowl **undermount** sink with a **31¼ × 18 × 10-inch** exterior and **29¼ × 16 × 9½-inch** interior. It identifies a rear-offset drain with its center **5 inches from the bowl’s rear edge** and **5 inches from the bowl’s right edge**. The existing profile retains those source-measured dimensions and drain data; no geometry change is required.

### Source

191. [Pelican Int’l — PL-HA119 R19 technical drawing](https://cdn.accentuate.io/8978112544908/1775067326529/PL-HA119-R15.pdf?v=1775067326529)

## Retain Exclusion — PL-FC3318DB Reversible Double-Bowl Farmhouse Sink

Pelican’s official drawing confirms that PL-FC3318DB is a double-bowl, reversible-front fireclay apron-front undermount sink, together with nominal exterior and bowl dimensions. It does **not** document which reversible apron face is selected for a saved design, a source-measured parametric form for either apron face, or numerical drain-center offsets. Those omissions prevent faithful saved-plan geometry. PL-FC3318DB is therefore removed from physical eligibility rather than rendered with a generic reversible apron or inferred drain positions.

### Source

192. [Pelican Int’l — PL-FC3318DB technical drawing](https://cdn.accentuate.io/8980578435212/1775069060533/PL-FC3318DB-(2).pdf?v=1776100453253)

## Retain Exclusion — PL-FC3219SB Offset-Drain Fireclay Sink

Pelican’s official drawing identifies PL-FC3219SB as a single-bowl fireclay sink with an **offset drain** and confirms nominal exterior and bowl dimensions. It does **not** give numerical rear or lateral drain-center offsets. A generic centered drain would contradict the documented offset-drain feature, while estimating an offset would violate exact-plan fidelity. PL-FC3219SB is therefore removed from physical eligibility rather than rendered with an inferred drain location.

### Source

193. [Pelican Int’l — PL-FC3219SB technical drawing](https://cdn.accentuate.io/9687395860620/1786579710979/PL-FC3219SB.pdf?v=1786579710979)
