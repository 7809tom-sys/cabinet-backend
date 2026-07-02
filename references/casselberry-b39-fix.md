# Casselberry missing base cabinet fix (user: "please autocorrect")

## Diagnosis
- Distributor 1 = US Cabinet Depot.
- Casselberry styles: CW = Casselberry White (door_styles.id 30055), CS = Casselberry Saddle (id 30056).
- Each Casselberry style has 43 base cabinets; the fullest UCD styles (SW Nova White, etc.) have 44.
- The single missing base cabinet is **B-39** (39" Single Door Base, cabinets.id 55). Present in SW, absent in CW+CS.
- 30" base is present as **BMW-30** (verify separately; user only flagged missing normal base — B-39 is the concrete gap).

## Pricing pattern (from existing rows)
Reference existing Casselberry neighbors and SW B-39:
- CW/CS B-36: platformSku B36-CW-UCD / B36-CS-UCD, distributorSku B36, list 1301.00, yourCost 390.30, adjustedList 1040.80, wholesale 650.50, contractor 780.60, homeowner 664.00
- CW/CS B-42: list 1380.00, yourCost 414.00, adjustedList 1104.00, wholesale 690.00, contractor 828.00, homeowner 704.00
- SW B-39: list 1150.00, yourCost 345.00, adjustedList 920.00, wholesale 575.00, contractor 690.00, homeowner 587.00

Note: SW B-39 price (1150) is LOWER than CW B-36 (1301). Casselberry line prices differ from Nova White line. B-39 sits between B-36 (1301) and B-42 (1380) in size, so for Casselberry, interpolate B-39 ~ midpoint = 1340.50 -> round. But safer/consistent: use the SAME Casselberry price ladder. Simplest defensible choice: price B-39 for Casselberry as the average of CW B-36 and B-42:
  - list = (1301+1380)/2 = 1340.50
  - yourCost = (390.30+414.00)/2 = 402.15
  - adjustedList = (1040.80+1104.00)/2 = 1072.40
  - wholesale = (650.50+690.00)/2 = 670.25
  - contractor = (780.60+828.00)/2 = 804.30
  - homeowner = (664.00+704.00)/2 = 684.00

## platformSku pattern
`{distributorSku}-{styleCode}-UCD` e.g. B39-CW-UCD, B39-CS-UCD. distributorSku = B39.
isAvailable=1, isPublished=1. supplierCabinetName was NULL in samples.

## Plan
INSERT two rows into distributor_skus:
- cabinetId=55, distributorId=1, styleId=30055 (CW), platformSku B39-CW-UCD
- cabinetId=55, distributorId=1, styleId=30056 (CS), platformSku B39-CS-UCD
Then re-verify counts = 44 for CW+CS and B-39 appears. Guard against dup platformSku (unique).
