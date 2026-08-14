# BEC-24 End-Return Validation — 2026-08-14

The canonical BEC-24 rule suite was rerun successfully: **5 test files, 332 assertions**.

| Contract | Verified behavior |
|---|---|
| Cabinet Config classification | `BEC-24` resolves to the non-corner 45-degree two-door end-angle/end-return drawing profile. |
| Plan footprint | The base end return remains a 24-by-24 footprint and is excluded from diagonal, blind, and lazy-Susan corner rules. |
| Existing-placement refresh | Current Cabinet Config values refresh stale placed BEC records to the `Base End Cabinet` subcategory and `base_end_return` profile. |
| Catalog identity | `BA-24` and `BEC24` resolve through canonical `BEC-24` without restoring duplicates. |

The live Ashford palette independently showed a single canonical BEC-24 Specialty Base entry using the active Aspen White finish, while the active saved kitchen remained unmodified.

The rendered elevation fixtures were also rerun successfully: **2 test files, 31 assertions**. They confirm the 45-degree non-corner end face has two measured 12-inch doors, a center seam, selected door-sample treatment, and no generic-image fallback; they also cover refreshed stale BA-24 metadata resolving to the same end-return vector profile.

The matching PlanCanvas fixture was rerun with the elevation suites: **3 test files, 35 assertions**. It renders BEC-24 as a 24-by-24 rectangular end-cabinet footprint with an angled front marker and explicitly rejects all true-corner wedge clipping.
