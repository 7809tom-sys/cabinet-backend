# Runtime flooring handoff findings

The managed preview can open the owner’s saved-design URL but cannot pass the authenticated Kitchen Designer launch gate. It therefore cannot expose the owner’s active 3D scene or inspect its runtime props. The owner’s current mobile screenshot remains the authoritative visual evidence: Bedrock reaches the renderer, while the flooring remains the same generic multicolor plank field despite changes to Bahia and Acorn product-source resolution.

The next investigation must trace all in-code floor mesh and texture construction branches, not assume the current `catalogFlooringName` or `catalogFlooringProductId` input is the final source used by the visible mesh.
