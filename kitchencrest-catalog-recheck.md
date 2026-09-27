# KitchenCrest catalog recheck

**Date:** September 27, 2026  
**Scope:** Read-only audit of the supplied `KCC_2020_Design_Files.zip` archive and the current CabinetDealz catalog database. **No catalog, price, dimension, image, or 3D geometry was changed.**

## Conclusion

The word **“2020”** in the upload name should not be treated as the archive’s year by itself. It is a KitchenCrest catalog package for **2020 Design**. However, the package also contains a separate, repeated internal catalog description: **“KitchenCrest Framed Cabinets, LLC – Oct 2020.”** That is the only explicit catalog period/release date found in the supplied files. [1] [2] [3]

The archive has files and embedded record timestamps from December 2024. Those timestamps show later file activity, but they do **not** identify a 2024 catalog edition, release number, or effective date. The package therefore cannot yet be proven to be KitchenCrest’s current catalog. It should be treated as a **dated KitchenCrest-only source with an October 2020 internal catalog period** until KitchenCrest supplies a newer release notice or current price/specification file.

If that confirmation is later supplied, the source may support KitchenCrest’s own codes, source-backed descriptions, and source-backed measurements. It must still never alter another supplier’s identity, measurements, pricing, availability, or Designer geometry. Monetary prices must continue to come from the KitchenCrest distributor price list, not this 2020 Design package.

## What the package itself says

| Evidence | Observed value | Meaning |
|---|---|---|
| Catalog identity | `KITCR_21`, KitchenCrest Cabinets, LLC | KitchenCrest-specific source identity. [1] |
| Repeated catalog description | `KitchenCrest Framed Cabinets, LLC - Oct 2020` | The package labels its catalog period as October 2020. [1] [2] [3] |
| Units | Imperial | A catalog-wide unit-system declaration. [2] |
| Catalog version fields | `Catalog Version = 1`; PAF catalog `version="39"` | Internal package/version fields, not a dated later release. [3] [4] |
| Later timestamps | File entries and embedded records reach December 16, 2024 | Later package or source-file activity is present, but no 2024 release statement was found. [5] |

> **Decision:** The source is not rejected because its filename contains “2020.” Its own metadata supplies an October 2020 catalog period. Its status as KitchenCrest’s current catalog remains unproven.

## Code reconciliation

The 20-20 code index contains **4,992 direct entries**. This includes 148 internal 20-20 rule/template identifiers and one `2020-DELETED_REC` marker, which are not sellable product codes. After excluding those entries, the archive contains **4,843 KitchenCrest product-code candidates**. [6]

| Reconciliation result | Count | Treatment |
|---|---:|---|
| Candidate KitchenCrest product codes | **4,843** | Source inventory only; none is live or priced by this audit. |
| Code-string matches to existing CabinetDealz master codes after punctuation normalization | **56** | A code collision, not proof that it is the same sellable product. |
| Matches resolving to one existing master-code record | **31** | Require KitchenCrest-specific source mapping before any reuse. |
| Matches resolving to two existing master-code records | **25** | **Conflict status**. Examples include `W2430` matching both `W2430` and `W-2430`; no automatic mapping is permitted. |
| Matches through existing alias records | **0** | No KitchenCrest code was resolved through the current alias table. |
| Source-only candidate codes not present in the master catalog | **4,787** | New KitchenCrest candidates. They require a KitchenCrest price/source import and review before publication. |

The 56 existing-code hits are familiar cabinet names such as standard bases, sink bases, fillers, microwave walls, roll-out shelves, and wall cabinets. They remain **potential collisions only**. A shared string such as `W3024` does not establish shared construction, dimensions, shelf count, finish availability, or 3D shape across brands. The 25 double-resolution cases are explicitly blocked because the normalized code points to two existing master records.

The detailed candidate-by-candidate result is in `kitchencrest-code-recheck.csv`. It classifies every source candidate as new, a single-master candidate match, or a conflict.

## Current KitchenCrest connection in CabinetDealz

The database contains one approved **Kitchen Crest** vendor-profile row, but it has no source key, no linked distributor catalog line, and no KitchenCrest product mapping. There is no distributor record branded or named KitchenCrest, no KitchenCrest SKU record, and no KitchenCrest standalone vendor product in the audited tables. The profile is therefore not a live catalog or price feed.

The package’s DataPack provides a `List price` label and door-style price-level rules. It does not provide a verified per-product monetary distributor price list. This confirms the required division of authority: the design package can be a KitchenCrest technical/code source, while the distributor price list remains the commercial price source. [3] [4]

## Controlled next step

No live catalog change is ready to make. The safe next stage is to obtain and import a **current KitchenCrest distributor price list** and, if available, a catalog release notice or source date after October 2020. Each KitchenCrest SKU can then be linked only to its own KitchenCrest source record. The 25 normalized duplicate-master cases must remain in conflict status until an owner-reviewed mapping selects the correct, source-specific record.

## References

[1]: file:///home/ubuntu/kcc-2020-source/CatInfo.Xml "KitchenCrest KITCR_21 catalog metadata"

[2]: file:///home/ubuntu/kcc-2020-source/KITCR_21/DataPack/00_Settings.csv "KitchenCrest catalog settings"

[3]: file:///home/ubuntu/kcc-2020-source/KITCR_21/DataPack/paf.xml "KitchenCrest PAF catalog package"

[4]: file:///home/ubuntu/kcc-2020-source/KITCR_21/CatalogVersion.txt "KitchenCrest catalog version record"

[5]: file:///home/ubuntu/upload/KCC_2020_Design_Files.zip "KitchenCrest 2020 Design package archive"

[6]: file:///home/ubuntu/kcc-2020-source/kcc-2020-searchable-records.txt "KitchenCrest direct product-code index extract"
