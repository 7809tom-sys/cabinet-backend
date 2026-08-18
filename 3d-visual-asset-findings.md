# 3D Visual Asset Findings

- **LS3612** has a verified Cabinet Config catalog image, but that asset is a 250×250 line drawing of the Lazy Susan cabinet rather than a photorealistic surface texture. It must not replace the selected feature-style door sample as a generic face texture.
- **Natura Maple (Ashford)** supplies a full Shaker door sample at `/manus-storage/media-library/1785437970467_designer_natural_door_e92f1e17`; that supplied sample contains the intended complete door face and should be used unaltered on visible door and drawer fronts.
- The reported live result remains generic despite the source asset being available, so the next correction must target the material attached to the exact visible face meshes, not the catalog metadata or a new fallback asset.
