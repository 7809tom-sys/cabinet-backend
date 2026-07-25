# Capital Spec Book - Extraction Notes

## Source
PDF: `/home/ubuntu/upload/Capital_Spec_Book_Single_Pages_V8_DIGITAL_ONLY_2.pdf`
Text: `/home/ubuntu/spec_book_pages/full_text.txt` (4165 lines)
Images: `/home/ubuntu/spec_book_pages/page-*.png` (87 pages at 150dpi)

## Structure
- Pages 1-4: Door style specs (Shaker SW/SA/SD, SG/SI/SN, SB/SH/SC, SU, Oxford OW/OC/OS, etc.)
- Pages ~5-20: Pricing tables (Cabinet + Weight + 4 price columns)
- Pages ~21 onwards (line ~1113): Table of contents then PRODUCT SPECIFICATIONS
  - Base Cabinets: pages 2-28 of spec section
  - Wall Cabinets: pages 29-42
  - Tall Cabinets: pages 43-45
  - Vanities: pages 46-51
  - Mouldings/Fillers/Panels: pages 52-58

## Key Spec Data Found

### Weight column
In pricing tables, format: `SKU  WEIGHT  $price1  $price2  $price3  $price4`
Weight is in lbs.

### Product Spec tables format
```
Model    Description         Width  Height  Depth
B12      Cabinet Dimensions   12    34½     24
         Door Dimensions      11½   22½     3/4
         Drawer Front         11½   6¼      3/4
         Drawer Box           8     3¼      20⅜
```

## Cabinet Types Found in Spec Section

### Base Cabinets
- **BT9**: Tray Base 9"W
- **B12FH, B15FH, B18FH, B21FH**: Full Height Single Door Bases (H=34½, D=24, door H=29)
- **B24FH, B27FH, B30FH, B33FH, B36FH**: Full Height Double Door Bases
- **B12, B15, B18, B21**: Single Door Single Drawer (door H=22½, drawer H=6¼)
- **B24, B27, B30, B33, B36**: Double Door Single Drawer
- **SB30S, SB33, SB36**: Sink Bases
- **SB30SADA, SB36ADA**: ADA Sink Bases
- **FSB30, FSB36**: Farm Sink Bases
- **DCSF42, SBF4242**: Diagonal Corner Sink
- **2DB24, 2DB30, 2DB36**: Two Drawer Bases
- **3DB12-3DB36**: Three Drawer Bases
- **BER33, BER36**: Base Easy Reach
- **LSB33, LSB36**: Base Easy Reach with Lazy Susan
- **BBC36, BBC42, BBC45**: Blind Base Corner
- Rollout shelf variants: B18FH1RS, B21FH1RS, B18FH2RS, etc.
- Trash can pullout variants: B15FHTCPO, B18FHTCPO, B21FHTCPO, etc.
- Tray divider variants: B12FHTD, B15FHTD, B18FHTD, B12TD, B15TD, B18TD

### Wall Cabinets
- **W0930-W2130**: Single Door Wall 30"H (D=12)
- **W2430-W4230**: Double Door Wall 30"H
- **W0936-W2136**: Single Door Wall 36"H
- **W2436-W4236**: Double Door Wall 36"H
- **W0942-W2142**: Single Door Wall 42"H
- **W2442-W4242**: Double Door Wall 42"H
- **DCW2430/2436/2442**: Diagonal Corner Wall
- **WER2430/2436/2442**: Wall Easy Reach
- **WBC2730/2736/2742**: Wall Blind Corner
- **W3012/W3612**: Bridge 12"H
- **W3015/W3615**: Bridge 15"H
- **W3018/W3618**: Bridge 18"H
- **W3024/W3624**: Bridge 24"H
- **W301224-W361224**: Refrigerator Wall 12"H 24"D
- **W301524-W361524**: Refrigerator Wall 15"H 24"D
- **W301824-W361824**: Refrigerator Wall 18"H 24"D
- **W302424-W362424**: Refrigerator Wall 24"H 24"D
- Glass door variants: W1530GD, W1536GD, etc.

### Tall Cabinets
- **U188424, U189024, U189624**: Utility 18"W Two Doors (H=84/90/96, D=24)
- **U248424-U309624**: Utility 24-30"W Four Doors
- Oven cabinets: OC2484, OC2490, OC2496, OC3084, OC3090, OC3096
- Rollout shelf utility variants

### Vanity Cabinets
- **VB12-VB21**: Vanity Sink Bases single door (H=34½, D=21)
- **VB24-VB48**: Vanity Sink Bases double door
- **VDB12-VDB21**: Vanity Drawer Bases
- **VSD36, VSD42, VSD48**: Vanity Combo Bases
- **VDDB42, VDDB48**: Vanity Combo Double Drawer Stack
- **VKD36**: Vanity Knee Drawer

## Notes
- Rollout Shelf Max Weight: 35lbs
- Floating Shelf Max Weight: 25lbs
- ADA cabinets: H=32½ instead of 34½
- Vanity depth: 21" (vs 24" for kitchen)
- "Three boxes will be received when ordering this cabinet kit flat pack" - common note for kit items
- "Two boxes will be received when ordering this cabinet kit flat pack" - for simpler kits

## PDF Page to Spec Section Mapping (approximate)
Pages 1-4: Door styles
Pages 5-20: Pricing tables  
Pages 21 (line ~1113 in text): Table of contents
Pages 22-28 of spec section: Base cabinets (text lines ~1158-2600)
Pages 29-42 of spec section: Wall cabinets (text lines ~2600-3340)
Pages 43-45: Tall cabinets (text lines ~3340-3600)
Pages 46-51: Vanity (text lines ~3600-3780)
Pages 52-58: Mouldings/Fillers (text lines ~3780+)

## Line Drawing Images
The PDF pages contain line drawings (cabinet diagrams). 
Each spec section page has a line drawing on the left side.
These need to be extracted from the PNG pages.

Key page mappings for line drawings:
- Base cabinet standard (door+drawer): around page 22-23 of spec section
- Full height door base: around page 22
- Sink base: around page 25
- Drawer base: around page 27-28
- Wall cabinet: around page 29-30
- Tall/utility cabinet: around page 43
- Vanity: around page 46-47

## Implementation Plan
1. Add spec columns to cabinets table: specNotes TEXT, specImageUrl VARCHAR(500)
   (weight already exists, cabinet dimensions already exist)
2. Write script to parse full_text.txt and extract per-SKU specs
3. Extract line drawing images from PDF pages (crop left portion)
4. Upload images via manus-upload-file --webdev
5. Populate DB with specs
6. Show specs in CabinetDetail.tsx
7. Add "Apply Specs to All" button in admin

## Viewed Page Findings for Line Drawings

The PDF page numbering in the image files is offset from the product-spec text section. The first product specification pages with usable cabinet line drawings begin around `page-33.png` onward.

A quick visual mapping from reviewed pages is as follows:

| PNG page | Visible section | Reusable drawing pattern | Notes |
|---|---|---|---|
| `page-33.png` | Double Door Double Drawer Bases | Standard 2-door 2-drawer base | Covers B33/B36/B39/B42 and ADA variant B36ADA |
| `page-34.png` | Sink Bases | Sink-base drawings | Includes SB30S, SB33/SB36, and ADA sink base exploded view |
| `page-38.png` | Three Drawer Bases | Standard 3-drawer base | Covers 3DB33/3DB36 and ADA 3-drawer base |
| `page-42.png` | Accessory Base Cabinets | Narrow pullout / trash pullout base | Contains BT9PO and B15FHTCPO drawings |

The spec pages generally use a consistent left-right layout in which the cabinet line drawing occupies the left portion of each product block and the dimension/spec table sits on the right. This means the extraction workflow can crop the left-side illustration area rather than trying to OCR or isolate individual vectors manually.

The drawing pages are suitable for assigning one generic diagram per cabinet family rather than one unique diagram per SKU. That aligns with the user's instruction that the universal descriptions are mostly the same and can be applied broadly.

The next extraction step should therefore classify cabinets by family, crop representative left-side drawings for each family, and then map those family drawings to all matching cabinets in the database.

Potential initial families include standard base door/drawer, full-height base, sink base, drawer base, wall single/double door, tall utility, and vanity.

