# WDC2430 Elevation Investigation — 2026-08-14

The active saved design `8190001` confirms that persisted wall-diagonal corner records can retain `cornerType: null`. The same design currently contains `WDC2442` with `masterCode: "WDC2442"`, `category: "Wall"`, `placement: "wall"`, a 24-inch nominal width, a 24-inch nominal depth, and a null corner type.

Therefore, every view must derive the WDC diagonal geometry from the persisted master code whenever explicit corner metadata is absent. The elevation resolver must treat `WDC*` as `diagonal-corner` before standard wall-cabinet fallback; it cannot rely on a saved `cornerType` field.
