# Active Cabinet Code-Dimension Audit

This read-only review applies the owner’s rule only where a master code explicitly encodes both width and height. Codes that do not encode both dimensions, specialty codes, and accessory codes remain outside this automated check and require their own source review.

| Explicit code pattern | Active records audited | Stored width/height mismatches |
|---|---:|---:|
| Standard wall cabinet: `W1530` → 15 in × 30 in | 44 | 0 |
| Wine-rack wall cabinet: `WRC2430` → 24 in × 30 in | 3 | 0 |
| Dashed pantry: `U-24-90-24` → 24 in × 90 in | 6 | 0 |
| Compact pantry: `U249024` → 24 in × 90 in | 4 | 0 |

The audit covered 686 active cabinets. The code patterns above account for 57 active records with explicit width-height encoding, and every one matches its stored dimensions. No catalog or diagram correction is proposed from this result.
