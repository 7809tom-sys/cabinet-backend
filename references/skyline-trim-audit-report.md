# Skyline Cabinetry Trim Audit Report

**Date:** July 5, 2026  
**Source catalog:** Milestone Premium Spec Book 2026 (60 pages, downloaded from Google Drive)  
**Database:** CabinetDealz production, distributor ID 3 (Skyline), 32 door styles, 65 accessory items

---

## Summary

The Skyline Premium catalog (pages 46-56) lists approximately 56 distinct accessory/trim SKUs. The CabinetDealz database currently carries 65 unique Skyline accessory items. All 65 items have catalog images assigned. The catalog and database are broadly aligned, with a few notable differences documented below.

---

## 1. Catalog Items Present and Correct in Database

The following catalog items are confirmed present in the Skyline database with correct master-code mappings and distributor SKU aliases:

| Catalog Code | DB Master Code | DB Distributor SKU | Category |
|---|---|---|---|
| ACM8 | ACM-8 | ACM8 | Trim & Molding |
| ALRM8 | ALRM-8 | ALRM8 | Trim & Molding |
| BAM | BAM | BAM | Trim & Molding |
| BCM8(DCM) | BCM-8 | BCM8(DCM) | Trim & Molding |
| CM8 | CM-8 | CM8 | Trim & Molding |
| COV | COV | COV | Trim & Molding |
| FBM | FBM | FBM | Trim & Molding |
| LRM8 | LRM-8 | LRM8 | Trim & Molding |
| OCM8 | OCM-8 | OCM8 | Trim & Molding |
| RCM4S(LCM) | RCM-4S | RCM4S(LCM) | Trim & Molding |
| SHM | SHM | SHM | Trim & Molding |
| SM8(SCR) | SM-8 | SM8(SCR) | Trim & Molding |
| TKC | TK-8 | TKC | Trim & Molding |
| F342 | F-3-42 | F342 | Trim & Molding |
| F642 | F-6-42 | F642 | Trim & Molding |
| F396 | F-3-96 | F396 | Trim & Molding |
| F696 | F-6-96 | F696 | Trim & Molding |
| FPV4296 | FPV-42-96 | FPV4296 | Skin Panel |
| USV2496 | USV-24-96 | USV2496 | Skin Panel |
| BSV | BSV | BSV | Skin Panel |
| WSV24 | WSV-24 | WSV24 | Skin Panel |
| WSV30 | WSV-30 | WSV30 | Skin Panel |
| WSV36 | WSV-36 | WSV36 | Skin Panel |
| WSV42 | WSV-42 | WSV42 | Skin Panel |
| DWR3 | DWR-3 | DWR3 | Decorative End Panel |
| REPV2496 | REPV-24-96 | REPV2496 | Decorative End Panel |
| REPV2796 | REPV-27-96 | REPV2796 | Decorative End Panel |
| TDEP2484 | TDEP-24-84 | TDEP2484 | Decorative End Panel |
| TDEP2490 | TDEP-24-90 | TDEP2490 | Decorative End Panel |
| TDEP2496 | TDEP-24-96 | TDEP2496 | Decorative End Panel |
| WDEP30 | WDEP-30 | WDEP30 | Decorative End Panel |
| WDEP36 | WDEP-36 | WDEP36 | Decorative End Panel |
| WDEP42 | WDEP-42 | WDEP42 | Decorative End Panel |
| BDEP | BDEP | BDEP | Decorative End Panel |
| VDEP | VDEP | VDEP | Decorative End Panel |
| S2496 | S-24-96 | S2496 | Skin Panel |
| CB9 | CB-9 | CB9 | Countertop Support Bracket |
| CBT | CBT | CBT | Trim & Molding |
| CLDL | CLDL | CLDL | Decorative Leg |
| FLDL | FLDL | FLDL | Decorative Leg |
| VA48 | VA-48 | VA48 | Trim & Molding |
| RS18-RS36 | RS-18 through RS-36 | RS18-RS36 | Roll Out Shelf |
| FS24/30/36 | FS-24/30/36 | FS24/30/36 | Floating Shelf |
| Trash Bin | Waste Bin | Waste Bin | Waste Bin Insert |
| CHROME TRAY33/36 | CTRAY-33/36 | CHROME TRAY33/36 | Tray Base |

---

## 2. Catalog Items Marked Discontinued

These items appear in the 2026 Premium catalog but are explicitly marked "Discontinued Item":

| Catalog Code | Item Name | Status in DB |
|---|---|---|
| ROPE | Rope Moulding (96") | **Not in Skyline DB** — acceptable since discontinued |
| DMTIS | Dentil Moulding (96") | **Not in Skyline DB** — acceptable since discontinued |

**Recommendation:** No action needed. Discontinued items should not be added to the active catalog.

---

## 3. Catalog Items Potentially Missing from Database

After deeper investigation, several items initially thought to be missing are actually present in the database but were not surfaced in the initial trim-only query:

| Catalog Code | Item Name | Actual DB Status |
|---|---|---|
| VA30, VA36, VA42 | Arched Valance (30/36/42") | **MISSING** — DB only has VA-48 (id 230). Note: VA-30/36/42 master codes (ids 227-229) exist but are vanity sink base cabinets, NOT valances. New arched valance records are needed. |
| SGH30 | Glass Holder (30") | **PRESENT** — exists as SGH-30 (id 182) with 16 Skyline style SKUs. Was not in the initial accessory-only query because it's categorized differently. |
| VKD36 | Knee Drawer (36") | **PRESENT** — exists as VKD-36 (id 241) with 21 Skyline style SKUs. Same categorization issue as above. |
| Skin Panel - Interior | Interior Skin Panel (48x48x1/4) | **Unclear** — may be a catalog-only reference diagram rather than an orderable SKU |
| Shelf Board W | Shelf Board Wall (36" wide) | **Unclear** — may be covered by existing shelf items or be a catalog-only diagram |
| Shelf Board B | Shelf Board Base (48" wide) | **Unclear** — same as above |
| SD | Sample Door | **Likely intentional exclusion** — merchandising item |
| Sample Door - Display | Sample Door Display Stand | **Likely intentional exclusion** — merchandising/showroom item |

**Recommendation:** The only confirmed missing items are the **VA-30, VA-36, and VA-42 arched valances**. The DB currently only has VA-48 as an arched valance accessory. Three new cabinet records should be created for the smaller valance sizes. SGH30 and VKD36 are already properly represented in the Skyline database.

---

## 4. Database Items NOT in the Premium Catalog

These items exist in the Skyline database but do NOT appear in the Premium 2026 catalog pages 46-56:

| DB Master Code | DB Description | Assessment |
|---|---|---|
| CM-2 | Crown Molding 2" profile | May belong to Builder/Slim Shaker line only |
| CM-4 | Crown Molding 4" profile | May belong to Builder/Slim Shaker line only |
| LRM | Light Rail Molding (smaller profile) | May be a legacy or alternate-line item |
| F-1.5 | 1.5" Base Filler | May belong to Builder/Slim Shaker line |
| FPL-24-96 | 24" Full Height Base Panel | Not shown in Premium catalog — may be a different product line |
| FPL-37-96 | 37" Full Height Base Panel | Same as above |
| DCSF-42 | Diagonal Corner Sink Floor | Hardware item, not typically in trim/molding section |
| PR-30-15 | 30x15 Plate Rack | Hardware item, not in trim section |
| TUK | Touch Up Kit | Hardware item |
| MINI | Mini Cabinet | Sample/display item |
| WOOD TRAY | Wood Tray Insert | Insert item, not in trim section |

**Assessment:** These items are likely valid Skyline products that either belong to other Skyline product lines (Builder, Slim Shaker, Frameless) or are hardware/insert items that appear in a different section of the full catalog. No action needed unless the user wants to verify against other Skyline catalogs.

---

## 5. Style Coverage Issues

Based on the earlier coverage audit, several Skyline trim items have incomplete style coverage (not available in all 32 Skyline door styles):

| Coverage Level | Items Affected |
|---|---|
| 30/32 styles | DWR-3, F-3-42, F-3-96, F-6-42, F-6-96, OCM-8, REPV-24-96, SHM, SM-8, TK-8 |
| 27/32 styles | BDEP, REPV-27-96, WDEP-30, WDEP-36, WDEP-42 |
| 24/32 styles | FPV-42-96, MINI, S-24-96 |
| 22/32 styles | BAM, BSV, USV-24-96, WSV-42 |
| 21/32 styles | TDEP-24-96, VDEP |

**Note:** Some coverage gaps may be intentional (e.g., certain panels are only available in specific collections as noted in the catalog: "Available in the Double Shaker and Charm collections, excluding NB"). However, core trim items like fillers and moldings at 30/32 coverage likely have 2 styles that should be added.

---

## 6. Photo Status

All 65 Skyline trim items currently have catalog images assigned (marked "IMG" in the database query). This is a clean result — no missing photos were identified for existing Skyline trim items.

---

## 7. Recommended Actions (Priority Order)

1. **Add VA-30, VA-36, VA-42 arched valances** — Three missing sizes that are explicitly in the Premium catalog. The DB only has VA-48. New cabinet records (category: Accessory, subCategory: Trim & Molding) and corresponding Skyline distributor SKUs are needed.
2. **Investigate style coverage gaps** — Particularly for items at 30/32 that should likely be universal (fillers, moldings). The 2 missing styles for core trim items may indicate styles that were added after the initial trim import.
3. **Optionally verify** Shelf Board W/B and Skin Panel - Interior against the Skyline order form spreadsheet to determine if they are distinct orderable SKUs or just catalog reference diagrams.
4. **No action needed** for ROPE and DMTIS (discontinued), SGH30 and VKD36 (already present), or sample/display items.

---

## 8. Cross-Distributor Comparison Note

For reference, the UCD distributor carries 23 trim items that Skyline does not (e.g., LACM8, CMB, DCM, KCM, ROPE, SCR, TKC, FOL630/636/642, BBFPV4296, REPV3096, REPVKIT, WDEP1212/1215/1218, WDEF42, S3696, MCB, CDL, SCDL, VASH48, WMS-30-18). Most of these are UCD-specific products that do not apply to Skyline. The only overlap worth noting is ROPE, which Skyline has discontinued.
