# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: staging-checkout.spec.ts >> deployed checkout validates the address and cannot submit in staging mode
- Location: e2e/staging-checkout.spec.ts:3:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('status').filter({ hasText: /Staging test mode/i })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('status').filter({ hasText: /Staging test mode/i }) with timeout 10000ms
  - waiting for getByRole('status').filter({ hasText: /Staging test mode/i })

```

```yaml
- banner:
  - link "CD CabinetDealz":
    - /url: /
  - navigation:
    - link "Kitchen Packages":
      - /url: /kitchens
    - link "Shop by Style":
      - /url: /styles
    - link "All Cabinets":
      - /url: /catalog
    - link "Countertops":
      - /url: /countertops
    - link "Surfaces & Fixtures":
      - /url: /surfaces
    - link "StoneCreek":
      - /url: /stonecreek
    - link "Plumber's Choice":
      - /url: /plumbers-choice
    - link "3D Designer":
      - /url: /design
    - button "More":
      - text: More
      - img
  - img
  - button "EN"
  - text: "|"
  - button "ES"
  - text: "|"
  - button "中文"
  - link "Cart":
    - /url: /cart
    - img
  - link "Sign In":
    - /url: /signin
    - button "Sign In"
- main:
  - heading "Build an Order" [level=1]
  - paragraph: Snap a photo of an existing quote or spec sheet, import a CSV, or type your cabinet codes. We'll match them to the catalog, price them for your door style, and route the order to the supply line.
  - text: 1 lines 1 pieces 1 matched
  - button "Clear & start over"
  - text: Door style
  - paragraph: Aero Blanc (Preston)
  - text: Pricing tier
  - paragraph: Contractor
  - paragraph: Pricing is applied automatically from your account.
  - table:
    - rowgroup:
      - row "Code Description Status Qty Unit Line":
        - columnheader "Code"
        - columnheader "Description"
        - columnheader "Status"
        - columnheader "Qty"
        - columnheader "Unit"
        - columnheader "Line"
        - columnheader
    - rowgroup:
      - 'row "12\" Single Door Single Drawer Base Cabinet with Adjustable Shelf Looks like: 1 door and 1 drawer (B12) — accessory / trim B12 12\" Single Door Single Drawer Base Cabinet with Adjustable Shelf Looks like: 1 door and 1 drawer; door style and edge profile per selected line. Matched swap 1 $164.35 $164.35"':
        - 'cell "12\" Single Door Single Drawer Base Cabinet with Adjustable Shelf Looks like: 1 door and 1 drawer (B12) — accessory / trim B12"':
          - 'img "12\" Single Door Single Drawer Base Cabinet with Adjustable Shelf Looks like: 1 door and 1 drawer (B12) — accessory / trim"'
          - text: B12
        - 'cell "12\" Single Door Single Drawer Base Cabinet with Adjustable Shelf Looks like: 1 door and 1 drawer; door style and edge profile per selected line."'
        - cell "Matched swap":
          - img
          - text: Matched
          - button "swap"
        - cell "1":
          - button:
            - img
          - spinbutton: "1"
          - button:
            - img
        - cell "$164.35"
        - cell "$164.35"
        - cell:
          - button "Remove":
            - img
  - paragraph: Estimated total
  - paragraph: Aero Blanc (Preston) · Contractor
  - paragraph: $164.35
  - text: Sales Tax State (optional — for estimate)
  - combobox "Sales Tax State (optional — for estimate)": Florida (7.01%)
  - button "Clear"
  - text: Florida Sales Tax (7.01%)(est. incl. local) $11.52
  - paragraph: Estimated Total (with tax)
  - paragraph: $436.54
  - heading "Submit this order" [level=3]
  - paragraph: We'll review your request and route it to the supply line. All orders are confirmed with the originator before fulfillment.
  - text: Referral code (optional)
  - textbox "Referral code (optional)":
    - /placeholder: e.g. FIRSTCLASS
  - button "Apply" [disabled]
  - text: Name
  - textbox "Name":
    - /placeholder: Your name
    - text: Playwright Staging Test
  - text: Email *
  - textbox "Email *":
    - /placeholder: you@company.com
    - text: playwright-staging@example.com
  - text: Phone *
  - textbox "Phone *":
    - /placeholder: (optional)
    - text: "9415550199"
  - text: Delivery address *
  - textbox "Delivery address *":
    - /placeholder: Street address
    - text: 123 Test Avenue
  - text: Apartment, suite, or unit
  - textbox "Apartment, suite, or unit":
    - /placeholder: Optional
  - text: City *
  - textbox "City *":
    - /placeholder: City
    - text: Osprey
  - text: State *
  - combobox "State *": Florida
  - text: Delivery ZIP *
  - textbox "Delivery ZIP *":
    - /placeholder: (optional)
    - text: "34229"
  - paragraph: Delivery location
  - paragraph: Select the actual location type. A ZIP alone cannot reliably identify a residential address.
  - button "business Commercial receiving location; confirm equipment below."
  - button "residential Lift gate selected by default; you can change it below."
  - checkbox "Lift gate required Select this when the delivery location does not have a loading dock or forklift for unloading."
  - text: Lift gate required Select this when the delivery location does not have a loading dock or forklift for unloading. Verified shipping total $260.67 Plan A live · Skyline Cabinetry · origin 32824 · SOUTHEASTERN FREIGHT LINES · 1 pallet $226.67
  - paragraph: Each origin is packed and quoted separately using final pallet dimensions and loaded weight.
  - text: Notes
  - textbox "Notes":
    - /placeholder: Anything the team should know — finishes, hardware, deadlines…
  - button "Submit order request · $436.54"
- contentinfo:
  - text: CD CabinetDealz
  - paragraph: The trade platform connecting the cabinet supply network with member dealers and affiliates.
  - list:
    - listitem:
      - img
      - text: 470 N Tamiami Trail Osprey, FL 34229
    - listitem:
      - img
      - link "(941) 899-3288":
        - /url: tel:+19418993288
    - listitem:
      - img
      - link "sales@cabinetdealz.com":
        - /url: mailto:sales@cabinetdealz.com
  - text: Tools
  - list:
    - listitem:
      - link "Shop Cabinets":
        - /url: /catalog
    - listitem:
      - link "Shop by Style":
        - /url: /styles
    - listitem:
      - link "Cabinet Education":
        - /url: /styles#profile-guide
    - listitem:
      - link "Kitchen Planning Guide":
        - /url: /kitchen-planning
    - listitem:
      - link "3D Designer":
        - /url: /design
    - listitem:
      - link "Build an Order":
        - /url: /bulk-order
    - listitem:
      - link "Photo to Cart":
        - /url: /photo-to-cart
    - listitem:
      - link "Fixture Photo Match":
        - /url: /fixture-photo
    - listitem:
      - link "Surfaces & Fixtures":
        - /url: /surfaces
    - listitem:
      - link "Plumber's Choice":
        - /url: /plumbers-choice
    - listitem:
      - link "StoneCreek":
        - /url: /stonecreek
  - text: Portals
  - list:
    - listitem:
      - link "Supplier Portal":
        - /url: /distributor
    - listitem:
      - link "Become a Vendor / Supplier":
        - /url: /become-a-vendor
    - listitem:
      - link "Affiliate Program":
        - /url: /affiliate
    - listitem:
      - link "Admin":
        - /url: /admin
    - listitem:
      - link "About Cabinet Dealz":
        - /url: /about
    - listitem:
      - link "Contact Us":
        - /url: /contact
  - text: Legal
  - list:
    - listitem:
      - link "Shipping Policy":
        - /url: /shipping-policy
    - listitem:
      - link "Return Policy":
        - /url: /return-policy
    - listitem:
      - link "Privacy Policy":
        - /url: /privacy-policy
    - listitem:
      - link "Terms & Conditions":
        - /url: /terms
  - text: © 2026 Cabinet Dealz. All rights reserved. A members-only trade platform.
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test("deployed checkout validates the address and cannot submit in staging mode", async ({ page }) => {
  4  |   await page.goto("/order/new");
  5  |   await expect(page.getByRole("heading", { name: /Build an Order/i })).toBeVisible();
  6  | 
  7  |   await page.getByRole("tab", { name: /Type Codes/i }).click();
  8  | 
  9  |   const codeInput = page.locator("textarea").first();
  10 |   await codeInput.fill("B12");
  11 |   const matchButton = page.getByRole("button", { name: /match/i }).first();
  12 |   if (await matchButton.isVisible().catch(() => false)) await matchButton.click();
  13 |   await expect(page.getByText(/B12/i).first()).toBeVisible();
  14 | 
  15 |   await page.getByLabel("Name").fill("Playwright Staging Test");
  16 |   await page.getByLabel("Email *").fill("playwright-staging@example.com");
  17 |   await page.getByLabel("Phone *").fill("9415550199");
  18 |   await page.getByLabel("Delivery address *").fill("123 Test Avenue");
  19 |   await page.getByLabel("City *").fill("Osprey");
  20 |   await page.getByLabel("Delivery ZIP *").fill("34229");
  21 | 
  22 |   const state = page.locator("#ord-state");
  23 |   await state.click();
  24 |   await page.getByRole("option", { name: "Florida" }).click();
  25 | 
> 26 |   await expect(page.getByRole("status").filter({ hasText: /Staging test mode/i })).toBeVisible();
     |                                                                                    ^ Error: expect(locator).toBeVisible() failed
  27 |   const submit = page.getByRole("button", { name: /Submit order request/i });
  28 |   await expect(submit).toBeDisabled();
  29 |   await expect(page.getByText(/submission is disabled/i).first()).toBeVisible();
  30 | });
  31 | 
```