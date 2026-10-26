# Skyline (distributorId=3) — Door Style Category Review

Naming format the user uses: `Skyline | [code] | [distributor name] | [our name] | [paint ref if any]`

## Current categories in DB (32 rows)

### Double Shaker (2) — OK
- DDW / Double Dove White / Dual White — verified (image corrected)
- DSG / Double Smokey Gray / Dual Dusk — verified (image corrected)

### Shaker (currently 19) — REVIEW
- AC / Aspen Charcoal / Carbon Frost (SW 7068 Grizzle Gray) -> REF IS RAISED PANEL, not Shaker. NEEDS RECATEGORIZE -> "Raised Panel". Image regenerated as raised panel.
- AG / Aston Green / Green Echo — Shaker (unverified)
- AW / Aspen White / Lumina White — Shaker (unverified) [Aspen line — check if raised panel like AC?]
- CW / Charleston White / Haven White — Shaker (unverified)
- FE / Floral Expresso / Bloom Shadow — Shaker (unverified)
- FG / Floral Gray / Bloom Cinder — Shaker (unverified)
- FW / Floral White / Bloom White — Shaker (unverified) [user earlier: FW-SD promote as builder grade / economy]
- GR / Shaker Gray / Cinder Core — Shaker (unverified)
- IB / Iron Black / Obsidian Forge — Shaker (unverified)
- LG / Lunar Gray / Moon Gray — Shaker (unverified)
- NB / Navy Blue / Cobalt Abyss — Shaker (unverified)
- RW / Rustic Wood / Forest Rust — Shaker (unverified)
- SA / Smokey Ash / Dusk Ash — Shaker (unverified)
- SB / Sage Breeze / Zephyr Sage — Shaker (unverified)
- SE / Shaker Expresso / Shadow Shaker — Shaker (unverified)
- SW / Shaker White / White Core — Shaker (unverified)
- TC / Treasure Chest / Gold Vault — Shaker (unverified)

### Slab (10) — mostly OK (flat slab)
- CG / Crystal Glass / Prism Clear — Slab -> ACTUALLY glass-in-frame door. Image corrected (ribbed glass). Category could be "Glass".
- MG / Midnight Glass / Night Glass — Slab -> glass-in-frame. Image corrected (tinted glass). Category could be "Glass".
- HG / High Glossy Gray / (our name should be Glace Cinder; currently "Ice Cinder") — Slab OK
- HW / High Glossy White / (our name should be Glace Blanc; currently "Ice White") — Slab OK
- MB / Matte Black / (should be Vellum Noir; currently "Velvet Black") — Slab OK
- MI / Matte Ivory / (should be Vellum Crema; currently "Velvet Cream") — Slab OK
- OB / Oak Blonde / (should be Solis Oak; currently "Solar Oak") — Slab OK
- OS / Oak Shade / (should be Umbra Oak; currently "Shadow Oak") — Slab OK

### Slim Shaker (5) — OK
- SAG / Slim Antique Grey / Air Relic
- SAO / Slim Autumn Oak / Air Solstice
- SDW / Slim Dove White / Air White
- SIB / Slim Iron Black / Air Obsidian
- SWO / Slim White Oak / Air Dawn

## Naming discrepancies (our-name field) to fix per user's format
| code | user's our-name | current DB our-name |
|---|---|---|
| OS | Umbra Oak | Shadow Oak |
| OB | Solis Oak | Solar Oak |
| MI | Vellum Crema | Velvet Cream |
| MB | Vellum Noir | Velvet Black |
| HG | Glace Cinder | Ice Cinder |
| HW | Glace Blanc | Ice White |
| AC | Carbon Frost | Carbon Frost (OK) |

## Category questions for user
1. AC (Aspen Charcoal): raised panel — recategorize Shaker -> "Raised Panel"? (need a "Raised Panel" category)
2. Should AW (Aspen White) also be raised panel (same Aspen line)? Need the sample.
3. CG + MG are glass-in-aluminum-frame doors currently under "Slab". Keep as Slab, or add a "Glass" category?
