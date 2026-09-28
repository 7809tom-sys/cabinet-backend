# KitchenCrest 2023 generic cabinet-rendering reference

**Author:** Manus AI  
**Reviewed:** September 28, 2026  
**Source reviewed:** *KCC New Spec Book — 2023 Fall* (29 pages; PDF metadata records creation and modification on December 19, 2023) [1]

## Conclusion

The supplied book is useful as a **generic line-art and construction reference**. It clearly documents common cabinet forms: door and drawer layouts, open-shelf count, cabinet depth families, corner/front conventions, panel roles, and trim profiles. It should improve the Designer where an existing cabinet is missing a generic visual form.

It is **not** a license to replace another manufacturer’s authoritative product information. A KitchenCrest drawing may supply a generic form only when the other line’s verified code, description, dimensions, and configuration describe the same cabinet type. The other line remains authoritative for its SKU, dimensions, price, availability, image, finish, and any source-specific geometry. Distributor price data remains the source for price.

No live catalog, price, availability, dimensions, source mapping, or saved design was changed while reviewing this book.

## What the book establishes for shared Designer forms

| Cabinet family | Generic line-art form supported by the book | Renderer use that is safe when the current source matches |
|---|---|---|
| Single-door base | 9-inch full-height door base, then 12–21-inch bases with one upper drawer and one lower door | Use the recorded door/drawer count rather than a blank rectangular face. |
| Double-door base | 24–30-inch bases have two doors and one upper drawer; 33–42-inch bases have two doors and two upper drawers | Render the verified front division. Do not infer a code or size from this pattern alone. |
| Drawer bases | 2DB cabinets have two large drawers. 3DB12–3DB36 have one standard upper drawer and two lower large drawers. | Render the recorded drawer stack. This directly corroborates the restored 3DB12 and 3DB21 form, but does not change their source data. |
| Spice pullout | SPB6 and SPB9 are narrow full-height base pullouts with three fixed shelves. | A verified six- or nine-inch spice-pullout can render as a tall narrow pullout with shelves; it is not a 12-inch cabinet. |
| Sink and farmhouse bases | Sink bases have false fronts and no shelf. The farmhouse form has an apron opening that is site-trimmable. | Use false-front/apron geometry only when the source cabinet is identified as that sink form. |
| Easy-reach and diagonal corners | The book distinguishes an easy-reach corner, a diagonal sink corner, blind corners, and a 24-inch base end-angle form. | Preserve distinct specialty geometry. Do not turn a blind corner into an L-corner or copy KitchenCrest footprints into another source line. |
| Standard wall cabinets | Standard wall cabinets are 12 inches deep. Their 30-, 36-, and 42-inch families have different shelf counts; the 42-inch form has three adjustable shelves. | Use the source-backed depth and door type, then render shelves/doors consistent with the verified configuration. |
| Bridge/stacker walls | 12- and 15-inch-high bridge cabinets are shallow, double-door wall cabinets with no shelf. | Support the existing microwave/bridge elevation rules with source-approved W3012/W3015/W3018/W3021/W3024 options only. The book does not authorize a WSC30 spice stacker to become a microwave bridge. |
| Wall open-end shelf | KitchenCrest OE630/OE636/OE642 are six-inch-wide, 12-inch-deep wall end shelves. Their top and bottom shelves are square; the 30-inch version has two shelves and 36/42 versions have three. | This defines the KitchenCrest open-end-shelf form only. It does **not** override a different source’s verified curved or wider WEOS/WOS cabinet form. |
| Tall utility and oven cabinets | 84-, 90-, and 96-inch tall forms are 24 inches deep. Two-door/tall pantry and oven forms have distinct front divisions and appliance openings. | Render a verified tall code with the matching source configuration, and retain the established 54-inch standard-wall and 72-inch refrigerator-upper baselines. |
| End panels, returns, skins, and fillers | Decorative end panels attach to an exposed cabinet side. A dishwasher return is a separate return panel. Fillers are field-trimmable stock; skins and panels have their own thickness and finish roles. | Keep a panel, return, skin, and filler as distinct product/geometry roles. A panel must not be silently substituted for a filler. |
| Crown, rail, toe kick, and trim | The book depicts separate crown, angled crown, light rail, furniture-base, outside-corner, scribe, batten, shoe, toe-kick, corbel, post, and valance pieces. | Use the verified source trim item or generic line art only after the trim family is selected; do not fabricate a sellable trim SKU or price. |

## Important boundaries

### The book is current evidence for KitchenCrest, not an automatic cross-brand catalog update

The file name and its internal metadata support a Fall 2023 KitchenCrest specification reference. For **KitchenCrest**, it can be used as live documentation for cabinet codes, stated sizes, descriptions, and illustrated form, subject to any later verified source release.

For another brand, it can inform a generic rendering only after the existing source record verifies the same form. For example, KitchenCrest’s OE6 wall end shelf has square shelves, while the verified WEOS0930 source reference is a different 9-inch wall-end shelf form. Those must remain different in the Designer.

### Catalog truth and design truth remain separate

The book does not contain the authorized distributor price list. It therefore cannot change cost, retail price, availability, supplier mapping, source photo, or sellable status. It also must not cause one brand’s cabinet dimensions or 3D shape to overwrite another brand’s verified configuration.

### Corner and filler rules remain physical-installation rules

The generic line art distinguishes corner types but does not replace the established Designer geometry rules. In particular, blind corners remain rectangular; true L/diagonal corners keep their own supported countertop geometry; 45-degree turns require physically supported mitered geometry; and a filler stays at the cabinet front where the installation requires it. A thin end panel is not a filler.

## Pages reviewed

The review covered the entire 29-page book. The most relevant pages are 1–6 for base, drawer, sink, easy-reach, blind-corner, and microwave forms; pages 7–16 for standard, bridge, deep, corner, specialty, and open-end wall forms; pages 17–21 for tall and vanity forms; and pages 22–29 for panels, returns, skins, decorative ends, mouldings, fillers, toe kick, and accessories. [1]

## Safe implementation sequence

The next safe implementation step is a **read-only comparison** between the current Designer’s generic specialty forms and the book’s named form categories. Each candidate should be classified as one of the following:

1. The source record already agrees with the illustrated form; a renderer-only regression can be added.
2. The source record differs; retain the source-specific form and document the difference.
3. The source record is incomplete or conflicted; hold it in the red Designer-compliance workflow until a supplier source resolves it.

This sequence improves visible geometry without guessing a SKU, dimension, sellable product, or price.

## References

[1]: file:///home/ubuntu/upload/KCC_NEW_SPEC_BOOK_2023_Fall_vBW_WEB.pdf "KCC New Spec Book 2023 Fall"
