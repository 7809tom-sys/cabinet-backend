# Designer Usability Verification — 2026-08-15

The saved design route `/design?load=8190001` was checked at a 390-by-844 mobile viewport after the compact control upgrade. The header exposes **Plan**, **Elevation**, and **3D** in a compact view switcher without obscuring the plan canvas. The persistent mobile toolbar retains **Undo**, **Redo**, and the new visible **Share** action alongside catalog and cart access.

The route loaded the saved “Aspin” design through the authenticated administrator review path. The Share action is intentionally disabled until a saved design identifier exists, and generates a URL on the active affiliate host when the design is saved.

The same saved elevation was reviewed at a 1024-by-768 iPad landscape viewport and a 1440-by-900 desktop viewport. The interactive control now reads **3D** rather than **3D preview**, leaving the toolbar within the available horizontal space while retaining its icon and accessible tooltip. Plan, elevation, room layout, sharing, wall selection, and action controls remained visible without overlapping the design canvas.

After publication, the same route was rechecked at both 1024-by-768 tablet and 390-by-844 mobile viewports. The compact **3D** action remained visible in the tablet toolbar, while mobile retained its compact Plan, Elevation, and 3D pill group plus the icon toolbar without horizontal overflow.
