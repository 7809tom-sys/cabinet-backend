# Supplied Realistic Appliance Appearance Assets

The following customer-supplied product images are cropped to remove the edge-connected white product canvas before use in the kitchen designer. Each visual fills the appliance's measured elevation box; the image does not define geometry.

| Appearance | Stored visual URL | Catalog envelope |
| --- | --- | --- |
| 30-inch Black Gas Range | `/manus-storage/30inchWideBlackGasRange_36cfca6b.webp` | 30 W × 25 D × 36 H |
| 30-inch Black Stainless Front-Control Range | `/manus-storage/30InchWideBlackStainlessSteelFrontControlRange_7cd9253e.webp` | 30 W × 25 D × 36 H |
| 30-inch White Electric Front-Control Range | `/manus-storage/30InchZlineFrontControlWhiteElectricRange_62f49682.avif` | 30 W × 25 D × 36 H |
| 30-inch Stainless Electric Range | `/manus-storage/30inchWideStainlessSteelElectricRange_3c3e8629.webp` | 30 W × 25 D × 36 H |
| 30-inch Stainless Front-Control Range | `/manus-storage/30InchWideStainlessSteelFrontControlRange_17cf2bce.webp` | 30 W × 25 D × 36 H |
| 30-inch Stainless Gas Range | `/manus-storage/30inchWideStainlessSteelGasRange.webp_3111419a.webp` | 30 W × 25 D × 36 H |
| 30-inch White Electric Range | `/manus-storage/30inchWideWhiteElectricrange_e81bd7a4.webp` | 30 W × 25 D × 36 H |
| 30-inch White Gas Range | `/manus-storage/30inchWideWhiteGasRange_c006d014.webp` | 30 W × 25 D × 36 H |
| 30-inch Glass Stainless Range Hood | `/manus-storage/30InchGlassStainlessRangeHood_765722d3.avif` | 30 W × 18 D × 18 H, mount 66 |
| 30-inch Stainless Range Hood | `/manus-storage/30InchWideStainlessRangeHood_9b452c9e.avif` | 30 W × 18 D × 18 H, mount 66 |
| 36-inch Stainless Range Hood | `/manus-storage/36InchStainlessRangeHood_c06c8cf7.webp` | 36 W × 18 D × 18 H, mount 66 |

## Pending Visual-Only Appliance Additions

| Appliance envelope | Selected source image | Visual finding | Intended 3D use |
| --- | --- | --- | --- |
| 36-inch French-door refrigerator | LG stainless French-door front, 1000×1000 | Square white canvas; product is centered, upright, and includes upper French doors plus lower freezer | Crop edge-connected white canvas and apply as the exact-envelope front material for `FRIDGE-36` only. |
| 24-inch built-in dishwasher | Whirlpool stainless dishwasher front, 1000×1000 | Square white canvas; centered front image includes the handle, upper control strip, stainless door, and dark recessed kick | Crop edge-connected white canvas and apply as the exact-envelope front material for `DW-24` only. |
| 30-inch over-range microwave | ZLINE stainless front, 1000×1000 | Wide white canvas; the front appliance is cleanly isolated, centered, and shows a left door, center handle, and right control panel | Crop edge-connected white canvas and apply as the exact-envelope front material for `MW-30` only. |

The ZLINE lifestyle image was reviewed and rejected because it includes cabinetry, a range, countertop, and room background. Only the isolated front-facing product image is suitable for a deterministic appliance envelope.

Prepared visual-only assets were verified after edge-connected white canvas removal. The refrigerator retains its complete French-door, dispenser, lower-freezer, and foot detail at 528×1000 pixels. The dishwasher retains its complete control strip, handle, stainless front, and recessed kick at 668×903 pixels. Their source-image aspect ratios are preserved; each is still stretched only across its existing catalog-owned 3D front envelope at render time.

| Appearance | Stored visual URL | Catalog envelope |
| --- | --- | --- |
| 36-inch Stainless French-Door Refrigerator | `/manus-storage/lg_french_door_refrigerator_front_b498406f.webp` | 36 W × 30 D × 70 H |
| 24-inch Stainless Dishwasher | `/manus-storage/whirlpool_dishwasher_front_5c695d52.webp` | 24 W × 24 D × 34.5 H |
| 30-inch Stainless Over-Range Microwave | `/manus-storage/zline_over_range_microwave_front_4976b7ab.webp` | 30 W × 15 D × 17 H, mount 54 |

## Presentation Boundary

All appliance **2D elevations** now use measured vector fronts rather than product photographs. This includes the supplied range and hood imagery as well as the refrigerator, dishwasher, and microwave additions. The cropped catalog product assets remain available only as transparent front planes on their fixed catalog envelopes in the interactive **3D room preview**. Focused visual-mode, shared-design, and 3D renderer regressions assert that split explicitly.

The calibrated 2D range front is the explicit selling-view exception: the tightly cropped, transparent supplied range image is now drawn within the exact catalog range envelope so the stove no longer reads as a generic cartoon. The hood, refrigerator, dishwasher, and microwave retain their measured vector elevation faces; all appliance images continue to use the catalog envelope and never change placement geometry.
