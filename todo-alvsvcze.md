# Project TODO

- [x] Add Administration link in top-right nav for affiliate users (desktop + mobile)
- [x] Make Administration link visible for admin users who are also affiliates
- [x] Link admin user (id=1) to affiliate record so they can access affiliate dashboard
- [x] Affiliate dashboard is already fully editable (pricing, catalog, customize, marketing, etc.)
- [ ] Fix SKU count (531) for Shaker White (Preston) - remove unpriced items
- [x] Add admin "View as Affiliate" button on AffiliatesAdmin so admin can open any affiliate's dashboard
- [x] Verify all affiliate dashboard tabs are fully editable end-to-end (confirmed: pricing, catalog, customize, marketing all have save/mutate)
- [x] Fix CRM data isolation: affiliates no longer see master CRM contacts (board query now filters by affiliateId)
- [x] CRM create mutation tags new deals to the correct affiliate when created from affiliate dashboard
- [ ] Show affiliate name/attribution on CRM deals so admin can see which affiliate each deal belongs to
- [x] Show affiliate name/attribution on CRM deals so admin can see which affiliate each deal belongs to
- [x] Add affiliate team management (add salesperson/designer by email) to affiliate admin panel
- [x] Route affiliate-hired staff to their affiliate's CRM when they log in (not house CRM)
- [ ] Enforce accessCrm/accessDesigner permissions in backend and update affiliate dashboard to recognize team members
