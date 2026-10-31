# Door audit (dual judge)

`scores_manifest.json` holds one entry per sample door: distributor, source photo, and every round (render path, what changed, Claude's and Cursor's scores). Commit the renders and source photos next to it (`renders/<style>/round-N.png`, `source/<style>.jpg`).

Gate: `shared/doorDualJudge.ts` `kitchenCraftGate()`; KitchenCraft onboarding does not start until it is open. Status `blocked` means the source photo is missing or under 400px on its short edge; report what is needed instead of looping.

Status: the manifest is empty. Nothing was rendered or scored in this PR (see PR body).
