# Scoped Designer Save Sign-In — Proof

**Date:** 2026-10-01

## Cause

On a branded CabinetDealz subdomain, the server correctly redirected `/signin` to the tenant-scoped address `/store/<slug>/signin`. The client router had no matching route, so a visitor clicking **Sign in to save** from the Designer reached the application 404 page instead of the sign-in form.

## Correction

The router now renders `SignIn` within the correct `AffiliateShell` for `/store/:slug/signin`. The normal post-authentication `returnTo` value is preserved, so a Sales Demo visitor returns to `/store/sales-demo/design` after sign-in instead of a generic page. Connected social sign-in also preserves that original Designer destination instead of returning to the intermediate sign-in route.

## Local browser proof

A browser loaded `/store/sales-demo/signin?returnTo=/store/sales-demo/design` and confirmed:

| Check | Result |
|---|---|
| Scoped sign-in form visible | Yes |
| 404 page visible | No |
| `returnTo` preserved | `/store/sales-demo/design` |

![Scoped Sales Demo sign-in form](/docs/proofs/designer-scoped-signin-local.png)

## Validation

- TypeScript: passed
- Tests: **18 passed** — app navigation, login URL, and saved-design authentication suites
- Production build: passed
- Diff integrity: passed
