# Peninsula Builder Validation Notes

- `pnpm check` completed without TypeScript errors after the peninsula-run changes.
- Focused regressions passed for Compass split behavior, 45°/90° run geometry, pull bounds, cabinet void reuse, countertop support, pricing, materials, and PlanCanvas contracts.
- The production build completed successfully; existing large-chunk warnings remained non-blocking.
- `/design-tool` is not a registered application route and correctly renders the app’s 404 page. The active Designer route is `/design`.
- The unauthenticated `/design` verification reached the existing loading/auth entry state rather than a saved plan, so live saved-plan interaction still requires owner validation after publication.
- The complete test suite was also run. It reported pre-existing failures across unrelated email, order-review, and elevation modules; the changed peninsula and Compass regression suites passed independently.
