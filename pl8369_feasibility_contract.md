# PL-8369 Physical Designer Feasibility Contract

## Source-measured product facts

Pelican identifies PL-8369 as a wall-mounted, single-lever kitchen pot filler. Its official drawing depicts one visible, extended dual-joint configuration and documents a 24-inch spout length, 3 5/32-inch spout height, 26 3/16-inch overall reach, 13-inch arm span, a 90-millimeter component, a 28-millimeter tube, and a 104-millimeter wall-side component. The product sheet shows Brushed Nickel, Matte Black, and Brushed Gold; the active product page additionally lists Chrome. The installation instructions confirm wall mounting but prescribe no countertop-relative or range-relative mounting height.

## Current admission decision

PL-8369 remains **excluded from physical Designer placement**. The source materials establish its role, its extended arm configuration, and several envelope dimensions, but they do not fully dimension the wall-side escutcheon/mounting plate or all visible base proportions. The one-page installation instruction supplies an assembly sequence only; it does not add those measurements or a finished-floor mount-height requirement. A catalog or staged image cannot close this gap because images are evidence only and are prohibited from becoming fixture geometry or texture.

If Pelican publishes a complete mounting drawing, the only acceptable implementation is an explicit range-hosted wall fixture. It is not a deck faucet and must not enter a sink-base faucet flow or a generic appliance placement flow. Its sole initial articulation state must be the extended configuration shown in Pelican's technical drawing; no folded position, free rotation, or inferred joint angle may be offered.

| Contract concern | Required behavior |
|---|---|
| Host | The saved `rangeUid` must identify an existing compatible range and must never be recomputed from a nearest range after save/load. |
| Plan transform | The fixture must center on the saved host range and face the same room wall. It must not displace cabinets, the range, or any other fixture. |
| Mount height | The customer must select an explicit, validated finished-floor mounting height before the fixture is added. The value must persist as `mountBottom`; there is no automatic default inferred from a countertop, range, or hood. |
| Geometry | The renderer would need an independently source-measured wall plate, supply body, 28-millimeter tube, two jointed arm spans, and 24-inch outlet reach. The current source does not provide all required wall-side measurements, so catalog or technical images cannot be used to fill the gap. |
| Finish | The selected catalog finish must persist and map only to the verified Brushed Gold, Brushed Nickel, Chrome, or Matte Black surface treatment. |
| Safety | Placement must reject no-range, stale-host, invalid-height, non-wall transform, and non-centered host scenarios clearly. Any plan-zone exemption is permitted only for the same saved range UID and valid elevated envelope. |

The next implementation review requires a complete official mounting drawing and must establish bounded mounting-height constraints from the kitchen wall envelope and valid range clearance. If either condition cannot be demonstrated without treating an arbitrary default or image-derived estimate as authoritative, PL-8369 remains excluded from the physical palette.

## References

[1]: https://cdn.accentuate.io/9507678257292/1784297892633/PL-8369-Spec.pdf?v=1784297892633 "Pelican PL-8369 specification sheet"
[2]: https://cdn.accentuate.io/9507678257292/1784297936129/PL-8369-Installation-Instructions-(2).pdf?v=1784297936130 "Pelican PL-8369 installation instructions"
[3]: https://buildpelican.com/products/pl-8369 "Pelican PL-8369 product page"
