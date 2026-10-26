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

## Owner-confirmed current-state limitation

On 2026-09-02, the owner confirmed that the 2560×1440 capture was visually the same interactive 3D kitchen, not a photo-quality result. This is expected from the current implementation: it increases output resolution and texture filtering but does not invoke a different lighting solver or production material pipeline. The door-sample image can only affect cabinet faces after it is loaded into the live Three.js scene. The matching catalog room-scene image is not a renderer input and must never be represented as one.

## Exact-plan production-render architecture

| Option | Exact-plan mechanism | What it can improve | Constraint | Decision |
| --- | --- | --- | --- | --- |
| **Current high-resolution preview** | Captures the exact current Three.js scene and live camera | Resolution and existing texture filtering only | Cannot turn single catalog images into physically accurate material maps or new lighting | Retain only as an accurately named 3D preview; not Photo Quality. |
| **Browser path-traced production candidate** | Locks the existing Three.js scene and camera, then renders the same meshes through a path tracer | Global illumination, soft shadows, reflection behavior, depth of field, and higher-fidelity PBR response | Requires WebGL2, compatible standard/physical materials, texture normalization, and progressive rendering time; mobile support must be tested explicitly | Best first engineering prototype because it cannot alter the layout or camera. |
| **Exported scene + offline Cycles service** | Exports a frozen GLB scene, camera, light rig, and product maps; server-side Cycles renders the exported scene | Highest deterministic quality, denoising, PBR material graph, high sample counts, and consistent output across devices | Requires a renderer service beyond the WebDev Node/512 MB runtime, an S3 job pipeline, and complete material maps | Best production architecture once infrastructure and assets are available. |
| **Kitchen-specific visual CPQ** | Synchronizes CabinetDealz catalog and design entities to a dedicated visual configurator | Mature cabinet/appliance libraries, renders, and visualization workflow | Commercial vendor selection, catalog onboarding, and integration effort | Enterprise alternative, not a short corrective patch. |

### Recommended staged path

1. Treat the current control as **High-resolution 3D preview** and preserve its exact-plan capture as an approval/reference image.
2. Create a browser path-tracing proof of concept from a cloned, locked Three.js scene. It must receive the live camera unchanged, never accept a text prompt, and require verified `MeshStandardMaterial`/`MeshPhysicalMaterial` and material maps.
3. Build a material package for each supported cabinet finish, countertop, flooring, backsplash, appliance, and fixture. A proper package has at least base color, roughness, normal/bump, and metalness/clearcoat values where physically relevant; catalog room photography is not a substitute.
4. If the browser prototype does not meet mobile time and memory limits, export the identical scene through Three.js `GLTFExporter` to an offline Cycles job. The job must store the geometry/camera/material manifest hash and reject any result whose manifest differs from the saved design.
5. Only after side-by-side owner evaluation visibly shows a meaningful quality improvement may the user-facing control regain the **Photo Quality** name.

## Technical evidence

The `three-gpu-pathtracer` project is an MIT-licensed Three.js path tracer with support for physically based material information, textures, normal maps, emission, environment maps, high-resolution tiled rendering, a fixed supplied scene/camera, and progressive samples. It requires WebGL2, supports only `MeshStandardMaterial` and `MeshPhysicalMaterial`, and requires compatible texture wrapping/interpolation settings. Those restrictions make it promising for a locked-scene test but unsuitable for an unvalidated customer control.[1]

Three.js `GLTFExporter` can export a scene with meshes, materials, textures, lights, and cameras into glTF/GLB. That makes a frozen export manifest practical for a server-side renderer, although exporter support alone does not create a quality render.[2] Blender documents background command-line Cycles rendering, which supports a deterministic, non-interactive server job after an exact scene export has been generated.[3]

The current Three.js exporter documentation also confirms the direct `parseAsync(scene, options)` path and support for binary GLB output and physical-material extensions including clearcoat, IOR, transmission, and texture transforms.[4] This confirms that a future job can receive the same frozen CabinetDealz meshes, camera, materials, textures, and deterministic lights rather than an AI-reinterpreted screenshot. It does not remove the requirement for production-grade authored material maps or GPU render infrastructure.

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

## References

1. [three-gpu-pathtracer — project README](https://github.com/gkjohnson/three-gpu-pathtracer)
2. [Three.js GLTFExporter documentation](https://threejs.org/docs/pages/GLTFExporter.html)
3. [Blender Manual — Rendering From the Command Line](https://docs.blender.org/manual/en/latest/advanced/command_line/render.html)
4. [Three.js GLTFExporter API](https://threejs.org/docs/pages/GLTFExporter.html)
