# Photo Quality Engine Assessment

## Observed failure

The current Photo Quality request returned an output that is visually a near-copy of the locked Three.js reference. It must not be described as a photo-quality render. The workflow must either return a materially improved render or report an honest failure.

## Candidate approaches

| Approach | Candidate | What it preserves | Suitability for CabinetDealz |
| --- | --- | --- | --- |
| Deterministic architectural renderer | D5 Render / Twinmotion / Unreal Engine / Enscape | Exact geometry, material assignment, lights, and camera when supplied with a complete 3D scene | Best long-term production path; requires an exportable high-fidelity cabinet/appliance/material scene rather than only a screenshot |
| Kitchen-specific visual CPQ platform | 3D Cloud | Kitchen-specific catalog configuration, 3D planning, photorealistic renders, and quote workflow | Strong enterprise alternative; requires vendor evaluation, catalog ingestion, commercial agreement, and migration/integration work |
| Architectural AI API | MyArchitectAI | Architecture-oriented image rendering, editing, style transfer, and upscaling | Candidate for an evaluated opt-in enhancement path; must prove locked-plan fidelity on real CabinetDealz scenes |
| General image-edit model | GPT Image / Imagen / FLUX-style control models | Atmosphere, material appearance, lighting, and detail enhancement from a controlled reference | Appropriate only as a reviewed enhancement; it cannot become the authority for quantities, geometry, selected products, or construction approval |

## Recommendation

Use a deterministic renderer as the future authoritative Photo Quality engine. It should render the exact current scene with product-specific PBR textures, calibrated materials, HDRI/daylight, and an unmodified saved camera. If an AI enhancer is offered, label it as a review image, retain the deterministic render side-by-side, and reject any result that changes locked geometry or selected products.

## Sources reviewed

- D5 Render kitchen workflow: imports a design model, maps materials, controls lighting, and uses ray tracing; it is not presented as a drop-in web API.
- 3D Cloud Kitchen Designer: offers a connected, kitchen-specific design/configuration ecosystem with photorealistic renders and enterprise integration.
- MyArchitectAI: advertises architecture-oriented rendering, style-transfer, prompt editing, and upscaling APIs.
- Rendero: describes AI interior rendering as useful for concept imagery but cautions that traditional rendering remains better for exact product representation and final production quality.

## Integration evidence and URLs

| Platform | Verified integration evidence | Implication |
| --- | --- | --- |
| 3D Cloud | Its developer index documents Kitchen Designer, Room Planner, Product Renders, and Lifestyle Renders. The Kitchen Designer description states that it provides real-time 3D, full BOMs, and exports; the platform describes HD/lifestyle renders as scalable and build-ready. Source: https://developers.3dcloud.com/ | Most suitable third-party enterprise path if CabinetDealz elects to adopt or integrate a dedicated visual CPQ/kitchen system rather than build a renderer internally. |
| MyArchitectAI | Its public API documentation lists `/render`, `/style-transfer`, `/text-to-image`, and `/upscale-4k`. The `/render` endpoint accepts an image URL or base64 image plus an `interior` scene type and prompt; `/style-transfer` accepts a base image, reference image, strength, positive prompt, and negative prompt. Source: https://rapidapi.com/myarchitectai-team-myarchitectai-team-default/api/architecture-rendering-api | Viable short-term API candidate to evaluate using the current locked Designer image and product material references. It remains generative and must be screened for geometry drift. |
| D5 Render | D5’s current materials describe a desktop visualization workflow based on imported/live-synced models, custom textures, lighting, ray-traced output, and optional post-AI effects. Sources: https://www.d5render.com/posts/kitchen-design-d5-render and https://www.d5render.com/ | Strong deterministic desktop-render workflow, but not a direct web-service replacement for CabinetDealz today. |
| Rendero | Its guidance explicitly describes AI interior rendering as useful for visual options while warning that traditional rendering is more suitable for exact product representation and production quality. Source: https://www.rendero.ai/ai-interior-rendering | Supports retaining a deterministic scene as authority and treating any AI output as an optional reviewed illustration. |
