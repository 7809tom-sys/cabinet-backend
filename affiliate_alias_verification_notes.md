# Reeves Way Affiliate Alias Verification

## Controlled alias

The affiliate-only override for door-style ID `330007` was set to **Rustic Hickory** on `reaves-way-cabinet-shop`. The master `door_styles` record remains unchanged: `ourName = Hickory Shaker` and `aliasName = Silva Shaker (Ashford)`.

## Verified storefront result

The Reeves Way storefront returned `name = Rustic Hickory` for style `330007`. Browser verification showed the family card heading **Rustic Hickory** and the image alt text **Rustic Hickory kitchen**, proving the custom label is applied to the visible image card for this affiliate.

## Designer route result

The Reeves Way design route correctly used the affiliate store shell and design gate. A controlled test email was used to open the live designer without using personal contact data. The live workspace displayed **Rustic Hickory** in its door-style pricing heading, catalog availability text, selected door-style label, and cabinet finish image labels. The compact door-sample swatch initially exposed the central name through its internally generated image alt text; that remaining label was corrected to use the same scoped alias resolver.

After the correction, a second live designer session confirmed the compact image alt text now reads **Rustic Hickory door sample**. The catalog finish-image alt text and title also read **Rustic Hickory**, matching the family card and pricing heading.

## Isolation evidence

The Reeves Way branding endpoint returned only `styleNames[330007] = Rustic Hickory`. The shared main door-style endpoint still returned `ourName = Hickory Shaker` and central `aliasName = Silva Shaker (Ashford)`. This confirms the Reeves override is stored separately from the central record.

The First Class storefront was opened in the browser and visibly listed style `330007` as **Hickory Shaker**, not Rustic Hickory. Its saved page text confirms that label on the customer-facing family card. The Sales Demo storefront was then allowed to finish loading and visibly listed the same style as **Hickory Shaker** in its card label and image alt text. The main Cabinet Dealz catalog was also opened; it showed its standard catalog content and did not display the Reeves Way-only alias. Both non-Reeves storefront responses and the main catalog response have no `Rustic Hickory` display-name override for style `330007`.

## Unique alias verification in progress

The controlled Reeves Way alias was changed to the unique value **Reeves Alias Test 2026 Hickory**. The live Reeves Way storefront displayed that exact label in the family-card title and the room-scene image alt text, confirming the alias resolves on the correct storefront. The direct designer route was then opened for the same style and was awaiting its gated workspace load at the time of this note.

The gated designer was loaded again with the controlled non-personal verification email so the visible selected-style control and image labels can be checked against the unique alias.

The live Reeves Way designer then showed **Reeves Alias Test 2026 Hickory** in the selected-style control, pricing heading, door-sample image alt text, and color-slot image label. The database returned exactly one row using this unique alias, scoped to `reaves-way-cabinet-shop` and style `330007`. Fresh public storefront responses for both other active affiliates (`firstclass` and `sales-demo`) contained zero occurrences of the unique alias, and the main `doorStyles.list` response also contained zero. The refreshed Reeves Way storefront response contained the unique alias exactly once for the intended family.

The unique alias was reapplied for downstream commerce verification. The live Reeves Way storefront again showed **Reeves Alias Test 2026 Hickory** in its room-scene image alt text and family-card title before entering the catalog and cart flow.

The selected family entered the locked catalog with the same unique alias in the shopping heading and room-scene image label. This confirms the alias persists from the family card into the product-browsing context before cart insertion.

One controlled cabinet item was added from that locked family. The live Reeves Way cart displayed **Reeves Alias Test 2026 Hickory** on the cart row, confirming the storefront cart preserves the affiliate alias and its marked-up price together.

The cart was opened into the live order-review screen without submitting the customer request. The checkout showed **Reeves Alias Test 2026 Hickory** as the selected door style and again in the estimated-total summary, while retaining the Reeves Way referral attribution and the same homeowner price from the cart.

The order-review state was cleared without submitting a customer request. The cart was then reopened to remove the controlled test item; it still showed the verified unique alias before cleanup.

For server-side order-record validation, a controlled **draft** request deliberately submitted the central name `Hickory Shaker` with the Reeves Way referral code. The saved request and its saved line item were both rewritten by the server to **Reeves Alias Test 2026 Hickory**, proving the order record does not trust a stale central browser label. The draft was deleted immediately after verification, the local cart was cleared, and the Reeves Way test alias was reset to inherit the central name. A refreshed storefront response confirmed zero occurrences of the test alias and restored `name = Hickory Shaker`.

The submitted-order path was verified separately with the same unique alias. A controlled `submit: true` request carrying the central name created a `submitted` order whose stored `styleName` and stored line-item `doorStyle` were both **Reeves Alias Test 2026 Hickory**. Its persisted `order_submitted` CRM event payload also contained that alias in `data.styleName`, with Reeves Way attribution. The controlled submitted order and CRM event were then removed, and a final database check confirmed both test rows were gone and the Reeves Way alias had returned to `NULL` (central-name fallback).

Regression coverage now directly executes `orders.createRequest` with `submit: true` and verifies the persisted order style name, saved line-item door style, and emitted CRM payload use the affiliate alias. A server-rendered `OrderReview` test also verifies the affiliate alias appears in the checkout door-style header and total summary. The focused suite passes 10 tests across the router, checkout rendering, and alias adapters.

After the verification, the controlled test name was cleared from Reeves Way. Its cabinet line now again inherits the central name until the affiliate saves its own production alias. All other settings on that style-branding record were left intact.
