# Account Favorite Sync Verification

Account-backed favorites are stored in `customer_favorites`, scoped by `userId`, `storefrontSlug`, and `styleId`. The protected `favorites.list`, `favorites.sync`, `favorites.add`, and `favorites.remove` procedures enforce the signed-in user scope. The storefront merges device-local favorites with account favorites on authenticated load and writes the merged set back to the account; individual heart changes use add/remove mutations.

Guest favorites remain device-local and scoped by storefront slug. Signed-in customers see guidance that favorites sync across devices, while guests see a sign-in link explaining how to enable syncing.

Desktop and mobile full-page captures of `/store/reaves-way-cabinet-shop` rendered successfully after the changes. Focused validation passed: 3 test files and 8 tests, and TypeScript validation passed.
