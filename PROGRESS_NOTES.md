# Progress Notes (Session Context)

## Completed in this session:
1. **Valance (VA-48) feature** - Fully wired into pricing pipeline. Only VA-48 exists in catalog (VA-30/36/42 are vanity codes). Checkpoint: c050ee45
2. **Countertop edge profile selection** - 8 profiles (Eased, Full Bullnose, Half Bullnose, Bevel, Ogee, DuPont, Waterfall, Mitered) with SVG icons. Persisted in draft, shown in BOM + build sheet. TypeScript clean, tests pass.
3. **Annotations / text notes (IN PROGRESS)**:
   - Added `PlanAnnotation` interface + `makeAnnotation()` to design.ts
   - Added `type PlanAnnotation` import to PlanCanvas.tsx
   - Added annotation props to PlanCanvas Props interface (annotations, selectedAnnotationUid, onSelectAnnotation, onMoveAnnotation, onDeleteAnnotation)
   - STILL NEEDED: Add annotations state to DesignTool.tsx, add annotation rendering in PlanCanvas, add "Add Note" button in toolbar, add annotation editing UI, persist in draft, add i18n keys

## Remaining todo items:
- [x] Annotations / text notes on floor plan - DONE
- [ ] Trimmable fillers (auto-size filler to exact gap width) - IN PROGRESS
- [ ] Full auto-dimensioning on floor plan (cabinet-to-cabinet, cabinet-to-wall)
- [ ] Undo / Redo (state history stack with Ctrl+Z / Ctrl+Y)
- [ ] Glass door / add-on accessories (quick-add to existing wall cabinets)

## Trimmable Fillers Analysis:
- fillGapWithFiller already exists and places a filler trimmed to exact gap width (up to 6")
- Gap popover in PlanCanvas already shows orange "Place filler" button for gaps ≤6"
- makeFiller() creates FILL-{w} code with exact width
- The feature is ALREADY IMPLEMENTED: gaps are detected, filler-sized gaps (≤6") get an orange chip,
  clicking shows popover with "Place filler" button that auto-sizes to exact gap width.
- What's missing for "trimmable fillers" parity with 2020 Design:
  1. When a cabinet + filler combo would fit a gap (e.g. 27" gap = 24" cab + 3" filler),
     the popover should offer that combo as a one-click option.
  2. Currently realSuggestions only shows cabs where leftover ≤3", but doesn't auto-place
     the filler alongside the cabinet.

## Key Architecture:
- PlanCanvas.tsx: gap popover at lines 1209-1303
- fillGap callback: places a real cabinet from palette in the gap
- fillGapWithFiller: places a filler strip trimmed to exact gap width
- wallGaps(): detects all gaps ≥1" on all walls, both base and wall layers
- gapFillCandidatesByWidth: builds Map<width, DesignCabinet> from active palette

## Key DB findings:
- VA-48 (id=230): "48"W x 6"H Arched Valance - 3/4" Deep", category=Accessory, subCategory=Trim & Molding, has pricing in distributor_skus
- VA-30/36/42 (ids 227-229): Vanity Sink Base Cabinets, NOT valances

## Key file locations:
- PlanCanvas.tsx: 1385 lines, Props interface at line 25-101
- DesignTool.tsx: 7029 lines
- design.ts: PlanAnnotation at line 3296-3308, EdgeProfile at line 2896-2922
- trimCart.ts: TrimKind includes "valance", TRIM_MASTER_CODES.valance = "VA-48"
- site.ts: EN keys around line 1041-1046, ES keys around line 2319-2325
