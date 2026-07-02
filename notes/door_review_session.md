# Door-by-Door Review Session (going through EVERY door)

User format: `Line | code | distributor name | our name | paint ref (optional)`
Distributors in DB: Line A (id 1), Line B (id 2), Line C (id 3) = "Skyline" line so far.

For each door: (1) match record, (2) fix distributor/line if wrong, (3) fix style category, (4) fix our-name, (5) regenerate swatch + mark verified.

## Corrected swatches generated so far (Skyline / Line C, id 3) — images done, DB updates PENDING
| code | distributorName | our name (user) | DB our name now | style | new image asset | notes |
|---|---|---|---|---|---|---|
| DDW | Double Dove White | Dual White | Dual White | Double Shaker | door-dual-shaker-white-v2 | verified/applied earlier |
| DSG | Double Smokey Gray | Dual Dusk | Dual Dusk | Double Shaker | door-dual-shaker-gray-v2 | verified/applied earlier |
| OS | Oak Shade | Umbra Oak | Shadow Oak | Slab | door-oak-shade-v2 | name fix pending |
| OB | Oak Blonde | Solis Oak | Solar Oak | Slab | door-oak-blonde-v2 | name fix pending |
| MI | Matte Ivory | Vellum Crema | Velvet Cream | Slab | door-matte-ivory-v2 | name fix pending |
| MB | Matte Black | Vellum Noir | Velvet Black | Slab | door-matte-black-v2 | name fix pending |
| MG | Midnight Glass | Nocturne Glass | Night Glass | Slab(->Glass?) | door-midnight-glass-v2 | glass-in-frame; category TBD |
| CG | Crystal Glass | Prism Clear | Prism Clear | Slab(->Glass?) | door-crystal-glass-v2 | ribbed glass-in-frame; category TBD |
| HG | High Glossy Gray | Glace Cinder | Ice Cinder | Slab | door-high-gloss-gray-v2 | name fix pending (gen interrupted-redo) |
| HW | High Glossy White | Glace Blanc | Ice White | Slab | door-high-gloss-white-v2 | name fix pending (gen interrupted-redo) |
| AC | Aspen Charcoal | Carbon Frost | Carbon Frost | Shaker->Raised Panel? | door-aspen-charcoal-v2 | raised panel; gen interrupted-redo |

## OPEN QUESTIONS / UNRESOLVED
- AW (Aspen White): TWO rows exist — id 30001 (code ASP, Line B/id2, Raised Panel) and id 30022 (code AW, Line C/id3, Shaker). User said "the other aspen white is from clark and son" and "that's a different door". AW sample sent = Lumina Blanc (SW 7006). AC and AW are DIFFERENT door profiles. User will provide correct info. HOLD.
- Need real distributor names: which of Line A/B/C = Skyline, and where does "Clark and Son" fit (may be a 4th distributor not yet in DB).
- Category taxonomy: may need to add "Raised Panel" and/or "Glass" categories. Awaiting user direction.

## DB updates NOT yet applied — waiting until user finishes all doors, then apply in one pass + checkpoint.

## Additional doors processed
| code | distributorName | our name (user) | DB our name now | current style | correct style | new image asset | notes |
|---|---|---|---|---|---|---|---|
| CW | Charleston White | Haven White | Haven White | Shaker | Raised Panel | door-charleston-white-v2 | ornate raised panel, antique cream + glaze; recategorize to Raised Panel |

## Iron Black (IB / SIB) — MERGE
- IB (Iron Black / Obsidian Forge, id 30016) and SIB (Slim Iron Black / Air Obsidian, id 30029) are the SAME slim-look black door.
- DECISION: KEEP IB id 30016 (Slim Shaker look), point to new swatch door-iron-black-v2, mark verified. DELETE SIB id 30029.
- IB style: it's a slim-shaker look; consider category "Slim Shaker" (was "Shaker"). Confirm during final pass.

## Pending DELETES
- id 30029 (SIB / Slim Iron Black / Air Obsidian) — DELETE, merged into IB 30016.

## REVERTED: IB/SIB merge cancelled — they are DIFFERENT doors
- NO deletion. id 30029 SIB stays. id 30016 IB stays. Remove earlier "Pending DELETES" of 30029.

## SIB (confirmed) — Line C / Skyline, id 30029
- distributor name: Slim Iron Black | our name: Aero Obsidian (DB has "Air Obsidian" -> FIX to "Aero Obsidian") | SW 6258 Tricorn Black | Slim Shaker.
- Image: door-iron-black-v2 (slim matte black look) -> assign to SIB 30029, mark verified.

## IB (still pending) — Line C / Skyline, id 30016
- Iron Black / Obsidian Forge / SW 6258 Tricorn Black. Different (standard/wider shaker) door. AWAIT its own sample from user before generating/verifying.

## SAG (confirmed) — Line C / Skyline, id 30028, Slim Shaker
- distributor: Slim Antique Grey | our name: Aero Relic (DB "Air Relic" -> FIX) | SW 7015 Repose Gray.
- Color is muted OLIVE SAGE green-gray (not neutral gray). Image: door-slim-antique-grey-v2 -> assign, mark verified.

## SAG (FINAL) — Line C / Skyline, id 30028, Slim Shaker
- distributor: Slim Antique Grey | our name: **Aero Sage** (DB "Air Relic" -> FIX to "Aero Sage") | SW 7015 Repose Gray.
- Color: olive-sage GREEN (name updated to reflect green per user). Image: door-slim-antique-grey-v2 -> assign, mark verified.

## Slim-shaker batch (confirmed) — Line C / Skyline
| code | distributorName | our name (user) | DB our name now | id | style | new image asset | paint | notes |
|---|---|---|---|---|---|---|---|---|
| SWO | Slim White Oak | Aero Alba | Air Dawn | 30031 | Slim Shaker | door-slim-white-oak-v2 | SW 3118 White Oak | natural light white-oak grain; DOUBLE-CHECKED OK (retried after fetch fail) |
| SAO | Slim Autumn Oak | Aero Solstice | Air Solstice | 30030 | Slim Shaker | door-slim-autumn-oak-v2 | SW 3125 Autumn Oak | medium taupe-brown/greige smoked oak grain |
| SDW | Slim Dove White | Aero Blanc | Air White | 30027 | Slim Shaker | door-slim-dove-white-v2 | SW 7001 Marshmallow | soft warm dove/off-white paint |

## Charm Collection — Shaker style (Line C / Skyline, distId 3)
User confirmed this batch is "Shaker style Charm Collection". Format: code | distributor | our name | paint.
| code | id | distributor | our name (user) | DB our name now | new image asset | paint | color/notes |
|---|---|---|---|---|---|---|---|
| NB | 30014 | Navy Blue | Cobalt Abyss | Cobalt Abyss (ok) | door-navy-blue-v2 | SW 6244 Naval | deep dark navy, matte |
| IB | 30016 | Iron Black | Obsidian Forge | Obsidian Forge (ok) | door-iron-black-standard-v2 | SW 6258 Tricorn Black | STANDARD shaker (wider frame) matte black — distinct from slim SIB 30029 |
| TC | 30020 | Treasure Chest | Aurum Vault | Gold Vault -> FIX to Aurum Vault | door-treasure-chest-v2 | SW 6130 Manila | warm honey/golden natural wood grain |
| AG | 30015 | Aston Green | Virid Echo | Green Echo -> FIX to Virid Echo | door-aston-green-v2 | SW 6194 Basil | deep basil/hunter green, matte |
| SA | 30017 | Smokey Ash | Vesper Ash | Dusk Ash -> FIX to Vesper Ash | door-smokey-ash-v2 | SW 7017 Dorian Gray | weathered dark gray stained ash w/ open grain |
| LG | 30018 | Lunar Gray | Selene Gray | Moon Gray -> FIX to Selene Gray | door-lunar-gray-v2 | SW 7016 Mindful Gray | soft warm light greige gray, matte |
| RW | 30021 | Rustic Wood | Sylvan Rust | Forest Rust -> FIX to Sylvan Rust | door-rustic-wood-v2 | SW 3111 Rustic | dark chocolate-espresso stained wood grain (NOTE: id 30062 Rustic Hickory Line B also "Forest Rust" — leave alone) |
| SB | 30019 | Sage Breeze | Zephyr Sage | Zephyr Sage (ok) | door-sage-breeze-v2 | SW 6191 Rosemary | soft muted grayish sage green, matte |

| SW | 30011 | Shaker White | Blanc Core | White Core -> FIX to Blanc Core | door-shaker-white-v2 | SW 7006 Extra White | clean bright pure white, matte. NOTE: id 30046 also "Shaker White" but Line A (distId1) our name Nova White — leave alone (that's a different line's SW). |
| GR | 30012 | Shaker Gray | Cinder Core | Cinder Core (ok) | door-shaker-gray-v2 | SW 7015 Repose Gray | medium cool slate/dove blue-gray, matte. NOTE: id 30051 "Shaker Cinder" Line A also Cinder Core — leave alone. |
| SE | 30013 | Shaker Expresso | Umbra Shaker | Shadow Shaker -> FIX to Umbra Shaker | door-shaker-espresso-v2 | SW 2750 Espresso | very dark espresso brown stained wood, near-black cocoa w/ subtle grain, matte. NOTE id 30042 "Floral Expresso" different door — leave alone. |

### Floral line — DELETE decision
User: FG & FE not on Skyline site (unavailable). Decision = remove entirely, KEEP Floral White.
- DELETE id 30041 Floral Gray (Bloom Cinder)
- DELETE id 30042 Floral Expresso (Bloom Shadow)
- KEEP id 30040 Floral White (Bloom White) — as-is unless sample provided

## Clark And Son (Line B / distId 2)
Confirmed: Line B = Clark And Son. (Line C = Skyline, Line A = ? maybe Faircrest.)
User confirmed 30001 (ASP Clark&Son Raised Panel) and 30022 (AW Skyline Shaker) are DIFFERENT doors — keep both.
| code | id | distributor | our name (user) | DB our name now | new image asset | paint | notes |
|---|---|---|---|---|---|---|---|
| ASP | 30001 | Aspen White | Lumina White | Lumina White (ok) | door-aspen-white-clarkson-v2 | SW 7006 Extra White | RAISED PANEL: stepped frame + applied ogee molding + domed raised center panel, white |
| HS | 30005 | Hickory Shaker | Silva Shaker | Silver Shaker -> FIX to Silva Shaker | door-hickory-shaker-v2 | SW 3123 Hickory | rustic natural hickory, high-contrast blonde+walnut streaks, knots, matte |
| PS | 30008 | Platinum Shaker | Sterling Pulse | Sterling Pulse (ok) | door-platinum-shaker-v2 | SW 7057 Silver Drop | medium cool neutral silver-gray, matte |
| WPG | 30009 | West Point Grey | Nimbus Grey | Nimbus Grey (ok) | door-west-point-grey-v2 | SW 7066 Gray Matters | RAISED PANEL: stepped frame + applied ogee molding + raised domed center panel, medium gray w/ light antique/weathered mottle. **CATEGORY FIX: Shaker -> Raised Panel** |
| WS | 30010 | White Shaker | Nova White | Nova White (ok) | door-white-shaker-cs-v2 | SW 7006 Extra White | clean flat-panel Shaker, crisp bright white, matte |
| NG | 30007 | Winchester Grey | Slate Echo | Slate Echo (ok) | door-winchester-grey-v2 | SW 7018 Dovetail | Shaker, warm greige/taupe-gray w/ soft wood-grain, lightly weathered, matte |
| MBS | 30006 | Midnight Black Shaker | Onyx Shadow | Onyx Shadow (ok) | door-midnight-black-v2 | SW 6258 Tricorn Black | flat-panel Shaker, deep matte black |
| RH | 30062 | Rustic Hickory | Forest Rust | Forest Rust (ok) | door-rustic-hickory-v2 | NATURAL (no stain) | Shaker, natural rustic hickory — medium warm brown natural tone, dramatic grain, knots + dark mineral streaks, clear/matte. DISTINCT from HS (HS is LIGHT blonde hickory). Currently points at Skyline sylvan-rust swatch -> replace. |

### Clark And Son swatch generation batch (v2 assets, from cropped refs)
- ASP -> door-aspen-white-clarkson-v2.png (ref aspen-white-crop.jpg) — Raised Panel white
- HS  -> door-hickory-shaker-v2.png (ref hickory-shaker-crop.jpg) — LIGHT natural blonde hickory shaker
- PS  -> door-platinum-shaker-v2.png (ref platinum-shaker-crop.jpg) — silver-gray shaker
- WPG -> door-west-point-grey-v2.png (ref west-point-grey-crop.jpg) — Raised Panel gray
- WS  -> door-white-shaker-cs-v2.png (ref white-shaker-crop.jpg) — white shaker
- NG  -> door-winchester-grey-v2.png (ref winchester-grey-crop.jpg) — greige shaker
- MBS -> door-midnight-black-v2.png (ref midnight-black-crop.jpg) — black shaker
- RH  -> door-rustic-hickory-v2.png (ref rustic-hickory-crop.jpg) — natural rustic hickory shaker (darker warm brown, no stain)

### CS added to batch
| CS | 30003 | Carmel Shaker | Terra Shaker | Earth Shaker -> FIX to Terra Shaker | door-carmel-shaker-v2 | SW 7732 Lemongrass | Shaker, warm caramel/golden-tan wood tone, soft mottled finish, mid warm brown-gold, matte |
- CS -> door-carmel-shaker-v2.png (ref carmel-shaker-crop.jpg)

### FS added to batch
| FS | 30004 | Fresh Sage | Zenith Sage | Zenith Sage (ok) | door-fresh-sage-v2 | SW 2860 Sage | flat-panel Shaker, muted gray-green sage, smooth painted matte. NOTE: crop reads as cool blue-gray; TRUST paint SW 2860 Sage = gray-green sage tone |
- FS -> door-fresh-sage-v2.png (ref fresh-sage-crop.jpg)

### CC added to batch
| CC | 30002 | Classic Cream | Aura Cream | Aura Cream (ok) | door-classic-cream-v2 | SW 7012 Creamy | flat-panel Shaker, soft warm cream/off-white, smooth painted matte |
- CC -> door-classic-cream-v2.png (ref classic-cream-crop.jpg)

## FULL Clark And Son batch = 11 doors: ASP, HS, PS, WPG, WS, NG, MBS, RH, CS, FS, CC

### GV Greek Villa — NEW DOOR TO ADD (not currently in DB)
- Line: Clark And Son (distributorId 2)
- Code: GV
- Distributor name: Greek Villa
- Our name: Villa Blanc
- Paint: SW 7551 Greek Villa
- Category: Raised Panel
- Image asset: door-greek-villa-v2.png (ref greek-villa-crop.jpg)
- Notes: soft warm off-white / creamy white; stepped outer frame with a stepped (recessed-then-raised) center panel; smooth painted satin. NOT in Clark And Son 2025 catalog color key or sample-door page — treated as new/off-catalog addition per user direction.
- ACTION at final apply: INSERT new door_styles row (needs id — use next available; verify no collision). Set doorStyle=Raised Panel, doorSampleVerified=true, isActive=true.

## Clark And Son FINAL batch = 12 assets: ASP, HS, PS, WPG, WS, NG, MBS, RH, CS, FS, CC, GV
## Catalog cross-check: WPG confirmed RAISED PANEL (fix from Shaker). ASP confirmed Raised Panel (already correct).

### DN Designer Natural — NEW DOOR TO ADD (not in door_styles DB; HAS full pricing on Clark and Sons sheet)
- Line: Clark And Son (distributorId 2)
- Code: DN
- Distributor name: Designer Natural  (sheet spelling; photo label said "Designer Nature")
- Our name: Natura Maple
- Paint/stain: Natural (no stain) — paintRef blank
- Category: Shaker
- Wood species: Maple/Birch (light natural)
- Image asset: door-designer-natural-v2.png (ref designer-natural-crop.jpg)
- Pricing: CONFIRMED present on Google Sheet "Clark and Sons" tab (gid 1544715108). Full SKU line DN-* with wholesale/retail/customer prices (e.g. DN-B24 $497.28 wholesale / $629.89 customer). Pricing lives in SKU/pricing import, separate from door_styles catalog row.
- Notes: soft pale natural maple/birch; flat recessed shaker panel; stepped inner reveal; soft cathedral grain; clear matte, no stain.
- ACTION at final apply: INSERT new door_styles row (next available id), doorStyle=Shaker, doorSampleVerified=true, isActive=true.

## Clark And Son FINAL batch now = 13 assets: ASP, HS, PS, WPG, WS, NG, MBS, RH, CS, FS, CC, GV, DN


## PROGRESS LOG (phase 4 apply)
### DN import COMMITTED
- DN door_styles row id = 30063 (Natura Maple / Designer Natural / Shaker, distId 2).
- distributor_skus: 298 DN rows imported total. 146 published (matched to real cabinets), 152 conflict placeholders (isPublished=0), tiers auto-derived from yourCost via pricing_settings.
- 152 conflict placeholder cabinets created (conflictStatus='conflict', descriptionSource='Clark And Son sheet (DN)', showInCatalog=0/showInDesigner=0). No unpriced rows.

### Catalog name/category fixes COMMITTED (30 updates)
- Clark And Son: HS->Silva Shaker, CS->Terra Shaker, WPG->Raised Panel, ASP->Raised Panel.
- Skyline: SE->Umbra Shaker, SW->Blanc Core, TC->Aurum Vault, AG->Virid Echo, SA->Vesper Ash,
  LG->Selene Gray, RW->Sylvan Rust, SAG->Aero Sage, SIB->Aero Obsidian, SWO->Aero Alba,
  SAO->Aero Solstice, SDW->Aero Blanc, IB->Obsidian Forge, GR->Cinder Core, SB->Zephyr Sage, NB->Cobalt Abyss.
- Skyline slab/RP: OS->Umbra Oak, OB->Solis Oak, MI->Vellum Crema, MB->Vellum Noir, MG->Nocturne Glass,
  CG->Prism Clear, HG->Glace Cinder, HW->Glace Blanc, AC->Carbon Frost, CW->Haven White (Raised Panel).

### Swatch asset CloudFront URLs (compressed .webp) — assign to door_styles image fields
- ASP door-aspen-white-clarkson-v2 (already gen, verified white raised panel)
- WPG door-west-point-grey-v2 (verified gray raised panel)
- HS  door-hickory-shaker-v2 (verified light blonde hickory)
- PS  door-platinum-shaker-v2 (verified silver-gray shaker)
- WS  https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/door-white-shaker-cs-v2-WUiNjeefe8mQysAdJRsX8Y.webp
- NG  https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/door-winchester-grey-v2-Ab5GvZQU9HE3Sf3ZUwFgJF.webp
- MBS https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/door-midnight-black-v2-k2ofDU8ofvrsndyfETdGwf.webp
- RH  https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/door-rustic-hickory-v2-N3mNEUWRvHFBYZBHm3XjCR.webp
- STILL TO GENERATE: CS, FS, CC, GV, DN (batch 3).
- Note: need the CloudFront URLs for the 4 batch-1 assets (ASP/HS/PS/WPG) too — regenerate URL via manus-upload-file --webdev or reuse existing door_styles if already uploaded.

### Final swatch verification findings saved before DB image apply
The newly generated Clark And Son batch-3 assets were visually checked against the user-provided cropped references.

| Code | Asset | Verification finding |
|---|---|---|
| GV | door-greek-villa-v2.png | Correct warm off-white Raised Panel profile with stepped molding and raised center, visually consistent with the Greek Villa reference and distinct from the Shaker doors. |
| DN | door-designer-natural-v2.png | Correct light natural maple/birch Shaker with pale blonde tone and soft natural grain; reads clearly as unstained natural wood. |
| FS | door-fresh-sage-v2.png | Correct muted gray-green sage Shaker; tone reads as a soft desaturated sage rather than blue-gray. |
| CS | door-carmel-shaker-v2.png | Correct warm caramel/golden-brown Shaker with soft wood tone and matte finish. |
| CC | door-classic-cream-v2.png | Correct warm cream/off-white Shaker with soft creamy paint tone. |

Batch-2 assets were also visually checked and approved for continued DB assignment.

| Code | Asset | Verification finding |
|---|---|---|
| WS | door-white-shaker-cs-v2.png | Correct crisp bright white flat-panel Shaker. |
| NG | door-winchester-grey-v2.png | Correct warm greige/taupe-gray Shaker with subtle wood-grain/weathered character. |
| MBS | door-midnight-black-v2.png | Correct deep matte black flat-panel Shaker. |
| RH | door-rustic-hickory-v2.png | Correct natural rustic hickory Shaker, darker and warmer than HS, with strong grain/character variation. |

Batch-1 assets already present locally for ASP, HS, PS, and WPG and were previously checked as visually acceptable for assignment.

Next DB work still pending after this note:
1. Insert GV door_styles row if not yet inserted.
2. Ensure DN row 30063 and all Clark And Son rows point to the correct swatch image URLs.
3. Verify door sample flags and category values after image assignment.
4. Save final checkpoint once all DB/image assignments are complete.

Source files reviewed: /home/ubuntu/webdev-static-assets/door-greek-villa-v2.png, /home/ubuntu/webdev-static-assets/door-designer-natural-v2.png, /home/ubuntu/webdev-static-assets/door-fresh-sage-v2.png, /home/ubuntu/webdev-static-assets/door-carmel-shaker-v2.png, /home/ubuntu/webdev-static-assets/door-classic-cream-v2.png, /home/ubuntu/webdev-static-assets/door-white-shaker-cs-v2.png, /home/ubuntu/webdev-static-assets/door-winchester-grey-v2.png, /home/ubuntu/webdev-static-assets/door-midnight-black-v2.png, /home/ubuntu/webdev-static-assets/door-rustic-hickory-v2.png.

