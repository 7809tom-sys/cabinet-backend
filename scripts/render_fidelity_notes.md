# AI 3D render fidelity fix — investigation notes

## Bug (user report, with screenshots)
- User design: ONE-WALL galley (single back-wall run: W-39-30 / open / W-39-30 uppers; B-30, RANGE-30, B-30, FRIDGE-30 base), window over sink area, NO island. Room 10' x 7'4".
- AI render returned: L-shaped kitchen + large island + dishwasher + different arrangement. Style/materials were right (white shaker, butcher-block-look counter, light oak floor) but GEOMETRY was wrong.

## Root causes (in code)
1. `shared/photorealPrompt.ts` CAMERA_CLAUSE["three-quarter"] hard-codes "two adjoining runs of cabinetry receding into the room" for EVERY render -> biases toward L-shape.
2. No explicit wall-configuration statement (one-wall / galley / L / U) and no negative constraint against inventing an island or extra runs.
3. `hasIsland` is passed but a false value produces no counter-instruction; the model defaults to adding an island.

## Files
- Prompt builder: `shared/photorealPrompt.ts` (PhotorealPromptInput + buildPhotorealPrompt)
- Scene builder (client): `client/src/lib/photorealScene.ts` (buildPhotorealScene -> wallSummaries, hasIsland)
- Client caller: `client/src/pages/DesignTool.tsx` buildPhotorealSceneInput (~line 1232)
- Server mutation: `server/routers/design.ts` photorealPreview (~line 1728), input schema mirrors PhotorealPromptInput
- Client type: `client/src/components/design/PhotorealPreview.tsx` PhotorealSceneInput type
- Test: `server/photorealPrompt.test.ts`

## Fix plan
1. photorealScene.ts: compute `layoutType` (one-wall | galley | L-shaped | U-shaped | island) from which walls carry cabinets + island; also count wallsWithCabinets. Add to PhotorealSceneInput.
2. photorealPrompt.ts: add `layoutType`, make camera clause layout-aware (don't force two runs for one-wall), add an explicit "This is a <layoutType> kitchen: cabinetry ONLY on <walls>; <island/no island>" statement, and add negative constraints ("do not add an island / extra runs / dishwasher not in design").
3. Pass appliance list explicitly so range/fridge/dishwasher only appear if present.
4. Update server input schema + client type + test. Verify end-to-end.
