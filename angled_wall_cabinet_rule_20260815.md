# AW1230 Angled Wall Cabinet Designer Rule

The existing **AW1230** Cabinet Config record is now treated as the illustrated 12-inch angled wall cabinet: a **12×12-inch** corner envelope, **30- or 36-inch configured wall height**, one side-hinged door, and two adjustable shelves. Its existing `wall_angle` Cabinet Config value is now a selectable, named drawing rule rather than an unrecognized legacy value.

The shared plan uses a true 12×12 triangular footprint with its single 45-degree outer face; it no longer inflates the item to a 24×24 WDC wall-corner footprint. The 2D elevation retains the supplied single-door/open-shelf intent, and the 3D scene uses the same compact triangular carcass with one diagonal face door. The saved appliance, pricing, and base-cabinet rules remain unaffected.

Focused regressions validate the shared footprint, Cabinet Config profile registration, 2D custom face, one-door 3D wedge, and 30-inch height. Tablet and mobile designer screenshots also confirm the broader designer interface remains usable after the rule addition.
