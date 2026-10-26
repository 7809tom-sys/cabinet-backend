# ProKitchen vs. Cabinet Dealz: Feature Comparison

## Executive Summary

ProKitchen is the industry's leading professional kitchen and bath design software, used by over 100,000 professionals across North America [1]. It is a Java-based desktop/cloud application priced at $2,395/year that provides photorealistic 3D rendering, VR walkthroughs, 500+ manufacturer catalogs, and electronic ordering. Cabinet Dealz is a web-based kitchen design and ordering platform that bundles a 2D/elevation design tool with e-commerce, CRM integration, and real-time distributor pricing — included as part of the dealer membership at no additional software cost.

This report compares the two platforms across every major capability area, identifies where Cabinet Dealz already matches or exceeds ProKitchen, and highlights the gaps that represent opportunities for future development.

---

## Platform Overview

| Attribute | ProKitchen | Cabinet Dealz |
|-----------|-----------|---------------|
| Type | Desktop + Cloud (Java) | Web-based (React SPA) |
| OS Support | Windows, Mac | Any browser (desktop + mobile) |
| Pricing | $2,395/year (with catalogs) [2] | Included in dealer membership |
| Offline Access | Yes | No (requires internet) |
| Mobile Support | No native mobile app | Fully responsive mobile UI |
| Installation | Cloud version requires no install | No install — URL access |
| Current Version | v11.3.0 [3] | Continuously deployed |

The fundamental architectural difference is that ProKitchen is a traditional desktop application (with a cloud option) designed for professional designers working at a desk, while Cabinet Dealz is a browser-first platform designed for dealers, salespeople, and homeowners who need quick layouts on any device including tablets and phones.

---

## Design & Layout

| Feature | ProKitchen | Cabinet Dealz | Status |
|---------|-----------|---------------|--------|
| 2D floor plan editor | Yes — full drafting with walls, angles, radius walls | Yes — room builder with 4 walls, doors, windows, openings | **Partial parity** |
| Cabinet drag-and-drop placement | Yes — placement zones per wall | Yes — tap-to-place on selected wall | **Parity** |
| Wall cabinet auto-placement | Manual | Auto-suggest matching wall cab above base | **CD advantage** |
| Blind corner handling | Yes | Yes — auto-filler, rectangle rendering | **Parity** |
| Filler detection & placement | Manual | Auto-detect gaps, one-click filler or cab+filler combo | **CD advantage** |
| Island support | Yes — full island design | Yes — island builder with cabinet placement | **Parity** |
| Radius / angled walls | Yes — radius walls, cathedral ceilings, skylights | No — rectangular rooms only | **Gap** |
| Multi-room projects | Yes — multiple rooms in one project | No — single room per design | **Gap** |
| Undo / Redo | Yes | Yes — 80-snapshot history, Ctrl+Z/Y | **Parity** |
| Annotations / notes | Yes — notes saved with Solutions [3] | Yes — draggable text labels on plan | **Parity** |
| Auto-dimensioning | Yes — adaptive measurement options | Yes — all walls simultaneously with tick marks | **Parity** |
| Tape measure tool | Yes | Yes — two-pick measurement + live drag tape | **Parity** |
| Ceiling beams | Yes — automated in v11.2.0 | No | **Gap** |
| Stairs | Yes — stairs collection | No | **Gap** |

Cabinet Dealz matches ProKitchen on the core layout workflow (place cabinets on walls, handle corners, fillers, dimensions) and actually surpasses it in automation (auto-suggest wall cabinets, one-click cab+filler combos, wine rack suggestions). The gaps are in architectural complexity — radius walls, cathedral ceilings, multi-room projects, and decorative elements like ceiling beams.

---

## Cabinet Modifications & Accessories

| Feature | ProKitchen | Cabinet Dealz | Status |
|---------|-----------|---------------|--------|
| Door style selection | Yes — per manufacturer catalog | Yes — locked to distributor collection | **Parity** |
| Glass door upgrade | Yes — mullions, glass inserts, aluminum mullion | Yes — GD variant toggle with pricing | **Partial parity** |
| No-door option | Yes | Yes — per cabinet toggle | **Parity** |
| Rollout drawers | Yes | Yes — qty stepper per cabinet | **Parity** |
| Turned legs / split posts | Yes — v11 feature | No | **Gap** |
| Pocket doors | Yes | No | **Gap** |
| Distressing (21 techniques) | Yes | No | **Gap** |
| Channels | Yes | No | **Gap** |
| Edge banding | Yes — global options | No | **Gap** |
| Cabinet box modifications | Yes — extensive (split shelves, partitions, toe kick options) | No — uses catalog dimensions as-is | **Gap** |
| Hardware selection | Yes — Jeffrey Alexander collection | No — hardware shown in elevation but not selectable | **Gap** |
| Hinge side control | Yes — mirror operations | Yes — left/right hinge per cabinet | **Parity** |
| Vertical lift / bifold hinges | Yes | No | **Gap** |

ProKitchen offers significantly deeper cabinet customization because it targets professional designers who need to specify every detail for manufacturing. Cabinet Dealz takes a catalog-driven approach where cabinets are ordered as-is from the distributor, with modifications limited to what the manufacturer supports (glass doors, rollouts, no-door).

---

## Countertops & Surfaces

| Feature | ProKitchen | Cabinet Dealz | Status |
|---------|-----------|---------------|--------|
| Countertop designer | Yes — ProCountertop add-on with fabricator sheets | Yes — material selection with Pelican Quartz integration | **Partial parity** |
| Edge profiles | Yes — slider selection with visual preview | Yes — 8 profiles with SVG icons | **Parity** |
| Backsplash | Yes — included in countertop sheets | Yes — Pelican tile & mosaic selection | **Parity** |
| Countertop dimensions for fabricator | Yes — full fabricator-ready sheets | No — edge profile noted in BOM only | **Gap** |
| Flooring | Yes — 3D floor textures | Yes — Pelican flooring selection | **Parity** |
| Sinks & faucets | Yes — from manufacturer catalogs | Yes — Pelican sinks & faucets | **Parity** |
| Sherwin Williams paint colors | Yes — catalog included | No | **Gap** |

The ProCountertop add-on generates fabricator-ready countertop sheets with precise dimensions, edge profiles, and backsplash specifications — a feature that Cabinet Dealz does not replicate. However, Cabinet Dealz integrates real Pelican product pricing for surfaces, which ProKitchen does not offer for non-catalog items.

---

## Trim & Molding

| Feature | ProKitchen | Cabinet Dealz | Status |
|---------|-----------|---------------|--------|
| Crown molding | Yes — automatically stacked | Yes — per-wall with qty override | **Parity** |
| Light rail | Yes | Yes — per-wall with qty override | **Parity** |
| Toe kick | Yes — improved options in v11 | Yes — per-wall with qty override | **Parity** |
| Batten molding | Unknown | Yes — per-wall with qty override | **CD advantage** |
| Valance (arched) | Yes | Yes — VA-48 above windows | **Parity** |
| Stacked moldings | Yes — automatic | No — single layer only | **Gap** |
| Trim auto-color matching | Unknown | Yes — auto-switches when door style changes | **CD advantage** |

---

## Visualization & Presentation

| Feature | ProKitchen | Cabinet Dealz | Status |
|---------|-----------|---------------|--------|
| Elevation views | Yes — per wall | Yes — front view, corner view, split view | **Parity** |
| Door style textures on cabinets | Yes — full 3D textures | Yes — door sample photo as texture | **Parity** |
| 3D photorealistic rendering | Yes — HD ray tracing [1] | No | **Major gap** |
| 360° panoramas | Yes — HD panoramas | No | **Major gap** |
| VR walkthrough | Yes — Oculus Quest [4] | No | **Major gap** |
| 3D-Live (real-time 3D while designing) | Yes | No | **Major gap** |
| 3D-GO (text/email 3D to clients) | Yes — interactive rotational views | No | **Major gap** |
| Dynamic Design Showcase | Yes — template-based presentations | No | **Gap** |
| Lighting wizard | Yes — dynamic lighting, shadows | No | **Gap** |
| 3D Texture Randomizer | Yes — avoids repetitive wood grain | No | **Gap** |

This is the single largest gap between the two platforms. ProKitchen's core value proposition is its photorealistic 3D rendering with ray tracing, 360° panoramas, and VR walkthroughs. Cabinet Dealz provides 2D plan views and elevation views with door textures but has no 3D rendering capability. However, Cabinet Dealz's elevation views with real door photos provide a "good enough" visualization for the sales process, and the platform compensates with speed and accessibility.

---

## Pricing & Ordering

| Feature | ProKitchen | Cabinet Dealz | Status |
|---------|-----------|---------------|--------|
| Real-time distributor pricing | Via EZ-Link catalogs (per manufacturer) | Yes — live pricing from distributor SKUs | **Parity** |
| Per-item discount/surcharge | Yes | Yes — % input per BOM line | **Parity** |
| Bill of Materials | Yes — detailed BOM reports | Yes — grouped BOM with pricing | **Parity** |
| Build sheet export | Yes — manufacturer reports | Yes — CSV export with all line items | **Parity** |
| Electronic ordering | Yes — EZ-Link to manufacturers [5] | Yes — direct order to distributor via cart | **Parity** |
| QuickBooks integration | Yes [1] | No | **Gap** |
| Multi-quote / combined reports | Yes | No — single quote per design | **Gap** |
| Customer database | Yes — all designs in one DB | Yes — CRM integration with design linking | **Parity** |

Both platforms handle the core pricing and ordering workflow well. ProKitchen integrates with QuickBooks and supports multi-quote scenarios for complex projects. Cabinet Dealz has a tighter integration with its own e-commerce and CRM system, making the design-to-order pipeline seamless.

---

## Collaboration & Business Tools

| Feature | ProKitchen | Cabinet Dealz | Status |
|---------|-----------|---------------|--------|
| Cloud save | Yes — AutoSave, AutoBackup | Yes — auto-save drafts to server | **Parity** |
| Share designs | Yes — via cloud | Yes — via shareable links | **Parity** |
| Multi-user / license management | Yes — ProKitchen Portal | Yes — role-based access (admin/user) | **Parity** |
| Design time tracking | Yes — Cloud Admin Tool | No | **Gap** |
| Import 2020 .kit files | Yes — v11.3.0 [3] | No | **Gap** |
| CRM integration | No native CRM | Yes — built-in CRM with design linking | **CD advantage** |
| E-commerce storefront | No | Yes — full product catalog with cart | **CD advantage** |
| Mobile design capability | No | Yes — fully responsive | **CD advantage** |
| Live chat support (in-software) | Yes | Yes — Tawk.to integration | **Parity** |

---

## Catalog & Manufacturer Support

| Feature | ProKitchen | Cabinet Dealz | Status |
|---------|-----------|---------------|--------|
| Manufacturer catalogs | 500+ (Diamond, Yorktowne, MasterBrand, etc.) [1] | Single distributor per design (locked collection) | **Gap** |
| Catalog updates | Background auto-updates | Real-time from distributor database | **Parity** |
| Appliance catalogs | Yes (KitchenAid, Bosch, Broan) | Yes — appliance category in palette | **Parity** |
| Custom catalog creation | Yes — sample & custom catalog pricing | No — uses distributor catalog only | **Gap** |

ProKitchen's 500+ manufacturer catalog library is a significant competitive advantage for designers who work with multiple brands. Cabinet Dealz is designed for a single-distributor workflow where the dealer sells one cabinet line, which is a different business model rather than a limitation.

---

## Summary Scorecard

| Category | ProKitchen Wins | Cabinet Dealz Wins | Parity | Gaps to Close |
|----------|----------------|-------------------|--------|---------------|
| Design & Layout | 4 | 2 | 8 | Radius walls, multi-room |
| Cabinet Mods | 6 | 0 | 4 | Hardware picker, box mods |
| Countertops | 2 | 0 | 4 | Fabricator sheets |
| Trim & Molding | 1 | 2 | 4 | Stacked moldings |
| Visualization | 7 | 0 | 2 | **3D rendering (major)** |
| Pricing & Ordering | 2 | 0 | 5 | QuickBooks |
| Collaboration | 2 | 3 | 4 | Design time tracking |
| Catalogs | 2 | 0 | 2 | Multi-manufacturer |
| **Total** | **26** | **7** | **33** | |

---

## Strategic Assessment

**Where Cabinet Dealz already wins:**

Cabinet Dealz provides a fundamentally different value proposition. It is a zero-cost, zero-install, mobile-friendly design tool that is tightly integrated with e-commerce, CRM, and a real ordering pipeline. For dealers selling a single cabinet line, it eliminates the $2,395/year software cost while providing a faster design-to-order workflow. The auto-suggestion features (wall cabinet matching, wine rack combos, cab+filler placement) reduce design time for non-professional users.

**The critical gap — 3D visualization:**

The single most impactful feature gap is 3D rendering. ProKitchen's photorealistic ray-traced images, 360° panoramas, and VR walkthroughs are its primary selling point for closing sales with homeowners. Cabinet Dealz's elevation views with door textures are functional but cannot match the "wow factor" of walking through a kitchen in VR.

**Recommended priorities for closing the gap:**

1. **PDF presentation export** — Generate a polished PDF with floor plan, elevations, BOM, and pricing that dealers can hand to customers (matches Dynamic Design Showcase).
2. **Hardware catalog** — Add a knob/pull picker with visual preview on elevation view (matches Jeffrey Alexander integration).
3. **Multi-room support** — Allow kitchen + bathroom + laundry in one project.
4. **Fabricator countertop sheet** — Generate a dimensioned countertop drawing with edge profiles for the fabricator.
5. **3D visualization** (long-term) — Consider integrating a WebGL-based 3D viewer for basic room walkthroughs, or partner with a rendering service for photorealistic output.

---

## References

[1]: https://www.prokitchensoftware.com/prokitchen-online-features/ "ProKitchen Online Features"
[2]: https://www.prokitchensoftware.com/pricing/ "ProKitchen Pricing"
[3]: https://www.prokitchensoftware.com/prokitchen-release/ "ProKitchen v11.3.0 Release Notes"
[4]: https://www.prokitchensoftware.com/prokitchen-oculus/ "ProKitchen Oculus VR"
[5]: https://www.prokitchensoftware.com/tag/ez-link/ "ProKitchen EZ-Link Electronic Ordering"
