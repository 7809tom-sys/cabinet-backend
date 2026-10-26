# Cart Freight Test Setup

The managed authenticated browser cart was initially empty. For the user-requested customer-flow freight verification, one real Aspen White `3-DB12` 12-inch three-drawer base cabinet was added to the cart at a displayed homeowner price of $431. No order, payment, customer quote, or shipment has been created.

Next step: open the cart and follow its delivery and freight-quote controls only.

With a non-personal test destination ZIP of `75201`, the cart identified the real cabinet as available through long-haul freight. It continued to show **Shipping: Quoted live on your order**, confirming that the cart's ZIP check performs availability classification only and does not request a WWEX price. The next safe stage is the order-request screen; no order has been submitted.

At the order-request freight stage, entering `75201` triggered the live quote path without submitting the order. It stopped before any WWEX quote because the real cart style, Aspen White, has no **Shipping Origin ZIP** configured in Featured Door Styles. The screen accurately reported this missing required data. No order, payment, quote, or shipment was created.

The temporary Aspen White test item was removed from the cart after this diagnosis. A separate test will use an active style that already has a verified warehouse ZIP, so live WWEX credential and rate routing can be assessed without inventing an origin location.

One real Shaker Navy `2-DB30` cabinet, a 30-inch two-drawer base cabinet, has now been added to the otherwise empty test cart. This cart style has a configured verified warehouse ZIP. No order, payment, quote, or shipment has been created.
