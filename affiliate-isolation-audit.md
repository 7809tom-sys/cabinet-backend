# Affiliate Isolation Audit

The First Class public storefront resolves to the First Class identity, referral code, contact details, and designer route. Its affiliate database record contains First Class-specific contact and storefront fields; the audit did not find Reaves Way text in First Class banners, gallery, style branding, or promotions.

The next cleanup check is the designer and administrative context, where a prior affiliate session could incorrectly retain another affiliate’s state.

The First Class designer entry route also renders the First Class title, First Class identity, and its own green affiliate color. No Reaves Way name, referral code, contact detail, brand text, or visible designer content appeared in the audited First Class storefront or designer entry route.

The separate Sales Demo storefront resolves at `/store/sales-demo`, displays the `SALESDEMO` referral code, and routes its designer and ordering links through the `sales-demo` affiliate context. Its visible identity is `Cabinet Dealz Sales Demo` with the training-specific tagline and notice.

The live First Class storefront resolves at `/store/firstclass`, displays the `FIRSTCLASS` referral code, and routes storefront, designer, cart, and order links through the `firstclass` affiliate context. Its visible identity remains `First Class Flooring & Cabinet Design`, distinct from Sales Demo and Reaves Way.
