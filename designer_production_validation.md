# Live Designer Validation Notes

- **2026-09-05:** The anonymous production route at `/design` first showed a loading indicator, then resolved to the expected “Start Your Kitchen Design” launch form. It did not expose the authenticated saved-plan workspace needed to reproduce the reported SB36 placement failure.
- **Reported condition:** The user’s authenticated production screenshot shows the older full-workspace Designer interface and a failed SB36 placement workflow. The next investigation step is to compare authenticated production assets and saved-plan routing with the current published Designer build.

- **2026-09-05 Gemini test audit:** The safe server-side Gemini readiness test passes and confirms an image-capable Google model is available. The current Designer Photo Quality button is intentionally not a Gemini generation action: it submits only a locked, high-resolution deterministic WebGL capture. The Operations-panel Gemini button validates connection access only. A real Google image test would require a separate, explicit administrator-only generation action and must retain the existing plan, lead, and secret safeguards.

- **2026-09-05 post-change visual check:** After the hot-reload cycle, the unauthenticated Designer route completed normally and displayed the fitted workspace controls plus the expected empty-plan guidance. The administrator-only Google image test itself requires a signed-in administrator and a saved plan, so its actual provider call remains intentionally unavailable in this unauthenticated visual check.

- **2026-09-05 production follow-up:** The live public `/design` route again completed from its initial loading indicator to the intentional unauthenticated **Start Your Kitchen Design** form. The older full-workspace screen and SB36 placement failure remain specific to the reported authenticated saved-plan session; no placement rule was changed from this anonymous route check.
