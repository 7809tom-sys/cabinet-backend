# Tablet optimization — Designer toolbar (2026-10-03)

User screen: Windows tablet, 1920x1080 @150% => ~1280x690 CSS px viewport (chrome tabs + taskbar). Screenshot /home/ubuntu/upload/Screenshot2026-10-03122027.png.
User asks: optimize for tablet, "eliminate some duplicate screens or keys".

## Measured at 1280x690 (Playwright, /tmp/render_tablet.py; inject file client/public/__qa_inject.js = /tmp/inject2_orig.js)
- documentElement.scrollWidth = 1976 (page scrolls horizontally!) — the designer toolbar strip (DesignTool.tsx line ~11189, class `border-b border-border bg-card px-3 py-1.5 flex items-center gap-1.5 shrink-0 ...`) is 2977px wide; in compact mode (isCompactWorkspace, <1440px) it is `flex-wrap ... lg:flex-nowrap lg:overflow-x-auto` so at lg (>=1024) it is a nowrap horizontal scroller.
- Site header (`container flex h-16`) scrollWidth 1292 vs 1280 (slight overflow; Sign In / Admin pushed off).
- Canvas: 1278x572.

## Compact-mode toolbar contents (DesignTool.tsx 11205-11390), in order
Floor Plan | 3D View (primary switch) · RoomSizeControl ("Room size") · Drag 45° (compact only) · Room layout · Show panels (compact toggle) · Catalog · Materials & Parts · Surfaces · Price & cart · Island zone · More · Wall <select> · View <select Plan/Elevation/3D/Island>.
Non-compact-only (hidden in compact): title+badge, Materials&Parts (dup), ConsultantRoomControl, Eye/Split/Island precision view group, Save, Trash, Print, Export PNG, Export PDF.
Mobile (<1024) has its own `mobile-designer-top-actions` icon row + "More" bottom Sheet (moreSheetOpen) containing active wall, autofill, builtin fridge, lock, measure, auto dim, island, fillers, swing door, save, my plans, hardware, trim, order section.

## Duplicates identified
1. "View" select (Plan/Elevation/3D) duplicates the Floor Plan | 3D View switch (only Elevation is unique) → replace with a single Elevation button in the switch group; drop the select.
2. "Wall" select duplicates the Active wall grid in the More sheet AND the wall tabs in Elevation view → keep only in More sheet / elevation.
3. "Show panels" + "Catalog" + "Price & cart": Show panels toggles sidebars; Catalog/Price&cart open the same panels as drawers → keep Catalog & Price & cart, drop "Show panels" from toolbar (move to More).
4. "Materials & Parts" appears twice in source (non-compact + compact) — only one visible at a time; keep.
5. 3D overlay (InteractiveRoom3D, top-right): "Add cabinet", "Wall heights", "Room context", "Hide/Show wall cabinets", "Color: Plan colors" — Add cabinet duplicates toolbar Catalog; Show wall cabinets duplicates "Show panels" naming confusion.
6. Island zone + Surfaces + Room layout: secondary; fold into More on tablet.

## Plan
- Add `isTabletWorkspace` = width between 1024 and 1366 (useIsMobile(1366) && !isMobile).
- Toolbar: `flex-wrap` on tablet (no horizontal scroll), smaller gap; show: Floor Plan | Elevation | 3D, Room size, Catalog, Surfaces, Price & cart, Materials, More. Fold Room layout, Island zone, Drag 45°, Show panels, Wall select, View select into More sheet (for lg too when compact).
- Header: allow nav to hide secondary links at <1366 (More dropdown already exists).
- 3D overlay buttons: icon-only on tablet (labels via title) or collapse into one "View options" popover.
- Fix `html` overflow: ensure body `overflow-x: hidden` on /design? Better fix root cause (toolbar nowrap).
