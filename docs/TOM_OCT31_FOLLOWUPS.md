# Tom's Oct 31 follow-ups (status notes)

## 1-2. DL Featured Styles photos and door forms: NOT done here
Placing the photos and filling each door form is a live admin/database action. This workspace has no storage credentials and I may not run SQL, so nothing was placed or saved, and there is nothing yet for Cursor to review. PR #55 (merged) holds the originals, the manifest and the by-hand upload script and SQL.

DL's own photos on file (manifest `sample-photos/manifest.csv`; the path `/workspace/dl/sample-photos/` does not exist in this workspace). The sizes below are what the manifest recorded for each file. I could not reach DL's site from here to look for a larger version, so "use the largest DL offers" is still to do.

| Line | Style | Size (px) | Short edge | Needs better photo from Rich |
|---|---|---|---|---|
| Core | white-shaker | 185x379 | 185 | YES |
| Core | driftwood | 298x620 | 298 | YES |
| Core | cyber-grey | 760x1536 | 760 | no |
| Core | glacier-white | 192x384 | 192 | YES |
| Core | dove-grey | 192x387 | 192 | YES |
| Core | pearl-white | 189x382 | 189 | YES |
| Core | dark-caramel | 189x382 | 189 | YES |
| Core | versa-shaker | 172x348 | 172 | YES |
| Slim | slim-shaker-alabaster | 187x374 | 187 | YES |
| Slim | slim-shaker-ebony | 399x806 | 399 | YES |
| Luxe | european-white-oak | 160x320 | 160 | YES |

10 of 11 need a better photo from Rich (under 400px short edge): white-shaker, driftwood, glacier-white, dove-grey, pearl-white, dark-caramel, versa-shaker, slim-shaker-alabaster, slim-shaker-ebony, european-white-oak. Only cyber-grey qualifies. LUXE-TBD has no photo and is skipped. Room scenes go last and are not touched.

## 3. Door audit (PR #58, merged)
Gate stays closed (manifest has no doors). Waiting on Cursor's scores per door; Claude's scores go beside them. Pass only if both are 7+ on every criterion.

## 4. Items in Cabinet Conflict that became visible when #57 merged
PR #57 is already merged. The live database is not reachable from here, so I cannot list them. Read-only query for Tom to run (shows every held `conflict` item that is active, canonical and has a published positive price, i.e. what customers can now see):

```sql
SELECT c.masterCode, c.description, c.conflictReason, c.conflictedAt
FROM cabinet_dealz.cabinets c
WHERE c.conflictStatus = 'conflict' AND c.isActive = 1
  AND EXISTS (SELECT 1 FROM cabinet_dealz.distributor_skus s
              WHERE s.cabinetId = c.id AND s.isAvailable = 1 AND s.isPublished = 1
                AND (COALESCE(s.listPrice,0) > 0 OR COALESCE(s.yourCost,0) > 0))
ORDER BY c.conflictedAt;
```

## 5. PR #56 publish blocks after the DL activate script
`dl_go_live_tidb.sql` Block 2 publishes every pending DL SKU (`isPublished = FALSE OR status <> 'approved'`). Blocks 97-100 only touch `status = 'pending' AND isPublished = 0` SKUs from this PR's list and set only `status` / `isPublished`, never a price column, so SKUs already live are skipped and no price changes. Block 101 now also skips masters that are already fully published. New read-only Block 96A lists how many of this PR's SKUs are already live. Note: if go-live ran after the PR #56 inserts, those SKUs went live before their masters; Block 101 then activates the masters.

## 8. Feature requests (NOT to build yet)
- Sort-by-distributor control on Featured Door Styles.
- Supplier PDF auto-ingest.
- Auto-applying the designer margin rules.
