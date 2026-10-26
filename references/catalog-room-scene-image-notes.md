# Catalog room-scene image notes

Current candidate images reviewed for the category-first catalog layout.

| Intended use | Local path | Notes |
|---|---|---|
| Hero kitchen scene | `/home/ubuntu/upload/search_images/0r4AThoW46wv.jpeg` | Strong wide kitchen scene with visible base, wall, and tall cabinetry; good hero candidate. |
| Base/Wall combined room scene | `/home/ubuntu/upload/search_images/z5hObtiiJYce.jpg` | Clean modern composition showing both lower cabinets and upper glass-front wall cabinets. |
| Vanity category scene | `/home/ubuntu/upload/search_images/wvEKhEqThcBk.jpg` | Clear bathroom vanity run with drawers and doors; strong Vanity tile candidate. |
| ADA category scene | `/home/ubuntu/upload/search_images/MbIx8ZHRtqXE.jpg` | Accessible kitchen scene with wheelchair clearance at sink/work area; good ADA tile candidate. |
| Accessory category scene | `/home/ubuntu/upload/search_images/SwmoTOVQpq5R.jpg` | Shows crown molding detail integrated with cabinetry; strong Accessory tile candidate. |

These are visual candidates only. Before publishing them in the site, confirm explicit license-free usage and then copy approved originals into `/home/ubuntu/webdev-static-assets/` for upload.

Next search still needed: explicit license-free kitchen room scenes for Base, Wall, Tall, and a hero image, ideally from a source such as Unsplash, Pexels, or StockCake.

## Explicit license-free source candidates reviewed

| Intended use | Local path | Source hint | Notes |
|---|---|---|---|
| Hero / Base category | `/home/ubuntu/upload/search_images/B3gZxmtscdll.jpg` | Unsplash | Wide, bright kitchen with strong lower-cabinet visibility and clean premium feel. |
| Wall category | `/home/ubuntu/upload/search_images/rZhxUlGJtgAl.jpg` | Unsplash | Strong upper-wall-cabinet focus with integrated tall oven column. |
| Tall category | `/home/ubuntu/upload/search_images/JAbP5MfkD3K2.jpg` | CliqStudios | Good pantry/tall-cabinet visual, but not license-free; use only as a fallback reference, not for production. |
| Tall / mixed kitchen tile fallback | `/home/ubuntu/upload/search_images/TNCZcnpnKwzM.jpg` | Unsplash | Shows a tall cabinet column on the right edge plus full kitchen composition. |
| Vanity category | `/home/ubuntu/upload/search_images/wvEKhEqThcBk.jpg` | Editorial article image | Visually strong, but license still needs confirmation before production use. |
| ADA category | `/home/ubuntu/upload/search_images/MbIx8ZHRtqXE.jpg` | Editorial article image | Accurate ADA visual, but license still needs confirmation before production use. |
| Accessory category | `/home/ubuntu/upload/search_images/SwmoTOVQpq5R.jpg` | Editorial article image | Excellent crown molding detail, but license still needs confirmation before production use. |

Implementation direction if explicit free-use coverage remains incomplete: use the clearly free Unsplash hero and mixed kitchen scenes immediately, then either continue sourcing fully license-free vanity/ADA/accessory scenes or temporarily render those category tiles with the shared hero-style kitchen imagery until replacements are approved.

## Additional reviewed candidates

| Intended use | Local path | Source hint | Decision note |
|---|---|---|---|
| Shared hero / base-focused kitchen | `/home/ubuntu/upload/search_images/B3gZxmtscdll.jpg` | Unsplash | Approved candidate for immediate use; clearly free-source result and visually strong. |
| Wall-focused kitchen | `/home/ubuntu/upload/search_images/rZhxUlGJtgAl.jpg` | Unsplash | Approved candidate for immediate use; strong emphasis on uppers. |
| Tall / mixed kitchen scene | `/home/ubuntu/upload/search_images/TNCZcnpnKwzM.jpg` | Unsplash | Approved candidate for immediate use; includes a tall cabinet column plus full kitchen context. |
| Vanity scene | `/home/ubuntu/upload/search_images/jQ5wsu3izrSK.jpeg` | Pexels-style free stock result | Acceptable fallback if no better vanity run is found; visually clear floating vanity. |
| Accessory / molding scene | `/home/ubuntu/upload/search_images/DSqqUeccQfTU.jpeg` | Pexels-style free stock result | Good fallback showing crown/detail trim and cabinetry in one composition. |
| Base/drawer close-up | `/home/ubuntu/upload/search_images/hYWLjsc86PmU.jpeg` | Pexels-style free stock result | Strong base-cabinet drawer visual; can support the Base category if a more room-like free image is not chosen. |

Open gap: a clearly license-free ADA-specific scene is still weak. If needed for this delivery, use the existing generic kitchen fallback for ADA tile styling and continue sourcing a better explicit free-use ADA image afterward.

## FINAL chosen set for category-first catalog (to upload)

| Slot | Local source path | Rationale |
|---|---|---|
| Hero (top of catalog) | `/home/ubuntu/upload/search_images/B3gZxmtscdll.jpg` | Bright, wide, premium full-kitchen scene — strong landing impression. |
| Base category | `/home/ubuntu/upload/search_images/hYWLjsc86PmU.jpeg` | Base-cabinet drawers/doors clearly visible. |
| Wall category | `/home/ubuntu/upload/search_images/rZhxUlGJtgAl.jpg` | Upper wall cabinets are the visual focus. |
| Tall category | `/home/ubuntu/upload/search_images/TNCZcnpnKwzM.jpg` | Includes a tall cabinet column. |
| ADA category | `/home/ubuntu/upload/search_images/iHntkMqODssR.jpeg` | Accessible kitchen with wheelchair user at lowered counter (free stock). |
| Vanity category | `/home/ubuntu/upload/search_images/jQ5wsu3izrSK.jpeg` | Clean floating bathroom vanity (free stock). |
| Accessory category | `/home/ubuntu/upload/search_images/DSqqUeccQfTU.jpeg` | Cabinetry with crown/trim detail (free stock). |

Next: copy these into /home/ubuntu/webdev-static-assets/ and upload with `manus-upload-file --webdev`.

## Uploaded storage paths (use in code)

| Slot | Storage path |
|---|---|
| Hero | /manus-storage/cat-hero-kitchen_bfa47868.jpg |
| Base | /manus-storage/cat-base_9a298dfc.jpg |
| Wall | /manus-storage/cat-wall_d5380ec2.jpg |
| Tall | /manus-storage/cat-tall_7523a9b7.jpg |
| ADA | /manus-storage/cat-ada_885a507c.jpg |
| Vanity | /manus-storage/cat-vanity_b8e3457c.jpg |
| Accessory | /manus-storage/cat-accessory_c93204c0.jpg |
