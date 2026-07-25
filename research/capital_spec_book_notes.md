# Capital Spec Book Notes

Source: `/home/ubuntu/upload/Capital_Spec_Book_Single_Pages_V8_DIGITAL_ONLY_2.pdf`

## Early pages reviewed visually

| Pages | Section | Key findings |
|---|---|---|
| 1 | Cover | Capital Collection, framed cabinetry, U.S. Cabinet Depot branding |
| 2-5 | Shaker door style specifications | Style codes observed: White (SW), Antique White (SA), Dove (SD), Grey (SG), Ivy (SI), Navy (SN), Black (SB), Honey (SH), Cinder (SC), Unfinished (SU) |
| 6-7 | Oxford door style specifications | Style codes observed: White (OW), Cashmere (OC), Sage (OS), Mist (OM), Toffee (OT) |
| 8-9 | Haven door style specifications | Style codes observed: Dune (HD), Sage (HS), Harbor (HH), Ridge (HR), Ember (HE) |
| 10 | Edgeline door style specifications | Style code observed: White (EW) |

## Import assumptions to validate

| Topic | Current assumption |
|---|---|
| Distributor | U.S. Cabinet Depot / Capital Collection |
| Price meaning | Numbers in cabinet tables are list prices, not our cost |
| Update rule | Overwrite existing list prices and insert missing items |
| Matching rule | Use our master alias and sub alias mapping |

## Next steps

Extract all pricing tables from the PDF text/tables, map item codes to master/sub aliases, then upsert list prices only.
