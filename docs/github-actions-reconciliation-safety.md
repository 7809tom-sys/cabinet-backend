# GitHub Actions Integration for PostgreSQL Reconciliation Safety

## Scope

This guide integrates the dry-run validator into GitHub Actions without connecting to production or using live Stripe credentials.

The workflow is intentionally **gated** because the current CabinetDealz project is MySQL-oriented and the PostgreSQL migration is a reference design. The workflow becomes active only after the PostgreSQL fixture/schema path is reviewed and the repository variable below is enabled.

## 1. Recommended workflow behavior

Run the validator on:

- Pull requests that change reconciliation, payment, refund, payout, webhook, migration, or CI files
- Pushes to the protected default branch after those changes are merged
- Manual `workflow_dispatch` runs

The job should:

1. Check out the exact commit.
2. Start a disposable PostgreSQL service container.
3. Apply CI-only source-table fixtures and the reviewed reconciliation migration.
4. Create a disposable payout-ledger fixture row.
5. Run the rollback-only safety validator.
6. Confirm the validator exits successfully.
7. Destroy the database automatically when the job ends.

It must not:

- Use production `DATABASE_URL`
- Use `STRIPE_SECRET_KEY`
- Connect to a live Stripe account
- Issue payments, refunds, payouts, or transfers
- Commit validation fixture rows

## 2. Repository variable gate

Create this GitHub repository variable:

```text
POSTGRES_RECONCILIATION_CI_ENABLED=true
```

Until the PostgreSQL fixture schema and migration are reviewed, leave the variable unset or set it to `false`. A skipped job is safer than running a reference migration against an incomplete schema.

No production secret is needed for this dry-run job.

## 3. Workflow file

Save as:

```text
.github/workflows/reconciliation-safety.yml
```

```yaml
name: Reconciliation Safety Validation

on:
  pull_request:
    paths:
      - "docs/postgres-reconciliation-safety-migration.sql"
      - "docs/validate-postgres-reconciliation-safety.sh"
      - "docs/github-actions-reconciliation-safety.md"
      - "ci/postgres/**"
      - "server/**"
      - "drizzle/**"
      - ".github/workflows/reconciliation-safety.yml"
  push:
    branches:
      - main
    paths:
      - "docs/postgres-reconciliation-safety-migration.sql"
      - "docs/validate-postgres-reconciliation-safety.sh"
      - "ci/postgres/**"
      - "server/**"
      - "drizzle/**"
      - ".github/workflows/reconciliation-safety.yml"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: reconciliation-safety-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  postgres-reconciliation-safety:
    name: PostgreSQL read-only and ledger safety
    # This is deliberately disabled until the PostgreSQL fixture/schema path is
    # reviewed and the repository variable is enabled.
    if: vars.POSTGRES_RECONCILIATION_CI_ENABLED == 'true'
    runs-on: ubuntu-24.04
    timeout-minutes: 15

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: cabinet_dealz_ci
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres -d cabinet_dealz_ci"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 20

    env:
      ENVIRONMENT: ci
      ALLOW_STAGING_DRY_RUN: yes
      DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:5432/cabinet_dealz_ci
      PGHOST: 127.0.0.1
      PGPORT: 5432
      PGUSER: postgres
      PGPASSWORD: postgres
      PGDATABASE: cabinet_dealz_ci

    steps:
      - name: Check out source
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Enable pnpm
        run: corepack enable

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Verify CI-only PostgreSQL files exist
        run: |
          test -s docs/postgres-reconciliation-safety-migration.sql
          test -s docs/validate-postgres-reconciliation-safety.sh
          test -s ci/postgres/source-fixture.sql
          test -s ci/postgres/reconciliation-fixture.sql

      - name: Wait for PostgreSQL
        run: |
          for attempt in $(seq 1 30); do
            pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" && exit 0
            sleep 1
          done
          echo "PostgreSQL did not become ready" >&2
          exit 1

      - name: Apply disposable CI source schema
        run: psql -v ON_ERROR_STOP=1 -f ci/postgres/source-fixture.sql

      - name: Apply disposable reconciliation schema
        run: psql -v ON_ERROR_STOP=1 -f docs/postgres-reconciliation-safety-migration.sql

      - name: Seed disposable reconciliation fixture
        run: psql -v ON_ERROR_STOP=1 -f ci/postgres/reconciliation-fixture.sql

      - name: Run shell syntax check
        run: bash -n docs/validate-postgres-reconciliation-safety.sh

      - name: Run rollback-only permission and trigger validator
        env:
          # This fixture row exists only in the disposable CI database.
          PAYOUT_LEDGER_FIXTURE_ID: 900001
          # This role is created only by source-fixture.sql for trigger testing.
          LEDGER_OWNER_ROLE: cabinetdealz_ci_migration_owner
        run: bash docs/validate-postgres-reconciliation-safety.sh

      - name: Confirm no CI fixture was accidentally committed
        run: |
          psql -v ON_ERROR_STOP=1 <<'SQL'
          DO $$
          BEGIN
            IF EXISTS (SELECT 1 FROM reconciliation.mismatches WHERE evidence->>'dryRun' = 'true') THEN
              RAISE EXCEPTION 'Validator left dry-run rows committed';
            END IF;
          END
          $$;
          SQL
```

## 4. CI fixture requirements

Because the current project does not yet have a deployed PostgreSQL schema, the workflow references two CI-only files that must be created and reviewed separately:

```text
ci/postgres/source-fixture.sql
ci/postgres/reconciliation-fixture.sql
```

### `source-fixture.sql` must provide

- Disposable `public.order_requests`
- Disposable `public.payments`
- Disposable `public.order_payment_allocations`
- Disposable `public.distributor_sub_invoices`
- Disposable `public.distributor_payout_ledger`
- Any required referenced tables
- A non-login owner role named `cabinetdealz_ci_migration_owner`
- A fixture payout row with ID `900001`

Example owner setup:

```sql
CREATE ROLE cabinetdealz_ci_migration_owner
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

ALTER TABLE public.distributor_payout_ledger
  OWNER TO cabinetdealz_ci_migration_owner;
```

The fixture should contain synthetic values only. Do not copy production rows or production customer information into the repository.

### `reconciliation-fixture.sql` must provide

- Any test data needed by the validator
- No Stripe credentials
- No production IDs that could accidentally be used against another database
- No committed payment, refund, payout, or fulfillment effects after the validator finishes

The workflow’s validator inserts temporary reconciliation rows and rolls them back. The fixture files themselves should be idempotent or applied to a fresh database only.

## 5. Why the validator runs after migration

The order is important:

```text
PostgreSQL service
  → source fixtures
  → reconciliation migration
  → reconciliation fixture
  → shell syntax check
  → role/privilege checks
  → runtime permission tests
  → trigger tests
  → rollback verification
```

Running the validator before the migration would only prove that the test database is missing protections.

## 6. Pull-request protections

Add the workflow as a required status check after it has run successfully on the protected branch:

```text
PostgreSQL read-only and ledger safety
```

Recommended branch-protection rules:

- Require the check before merging migration or payment changes.
- Require one finance/admin reviewer for reconciliation or ledger changes.
- Require one engineering reviewer for role, trigger, or privilege changes.
- Prevent force-pushes to the protected branch.
- Keep `permissions: contents: read` unless another permission is strictly required.

## 7. Avoiding secret leakage

The workflow must not define:

```yaml
STRIPE_SECRET_KEY:
DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}
```

The dry-run uses only:

```text
Disposable PostgreSQL service
Synthetic fixtures
No Stripe API calls
No production credentials
```

If a later integration test must call Stripe test mode, use a separate job, a test-mode-only secret, and an explicit environment protection rule. Do not combine it with the read-only permission validator.

## 8. Scheduled nightly run

After the pull-request workflow is stable, add a nightly trigger if desired:

```yaml
on:
  schedule:
    - cron: "30 8 * * *" # 03:30 America/Chicago during CST; adjust for DST policy
```

GitHub Actions cron uses UTC and does not automatically express an America/Chicago schedule across daylight-saving transitions. For a strict local-time schedule, use an application-owned scheduler or update the UTC cron seasonally.

A nightly CI safety test is different from the production daily Stripe reconciliation job:

| Job | Purpose | Data |
|---|---|---|
| GitHub Actions safety validator | Test grants, triggers, and invariants | Disposable synthetic PostgreSQL |
| Application reconciliation job | Compare real Stripe payouts and internal ledgers | Production Stripe and production ledger, read-only |

Do not use GitHub Actions as the production financial reconciliation runtime unless its security, network, secret, retry, and audit requirements have been explicitly approved.

## 9. Failure interpretation

| Failure | Meaning | Action |
|---|---|---|
| Workflow skipped | Repository gate is disabled | Enable only after fixtures and migration review. |
| Missing fixture file | CI PostgreSQL environment is incomplete | Add/review fixture, do not bypass the check. |
| Reader can update payments | Critical privilege regression | Block merge immediately. |
| Immutable trigger did not fire | Historical ledger protection is broken | Block merge immediately. |
| Four-eyes test fails | Requester can self-approve | Block merge immediately. |
| Rollback check finds rows | Validator is committing test data | Block merge immediately. |
| PostgreSQL migration fails | Reference schema and fixture do not match | Repair migration/fixture compatibility. |
| Service health timeout | CI environment problem | Retry the job, then inspect runner/service logs. |

## 10. Local reproduction

Use a disposable local PostgreSQL instance:

```bash
export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/cabinet_dealz_ci'
export ENVIRONMENT=ci
export ALLOW_STAGING_DRY_RUN=yes
export PAYOUT_LEDGER_FIXTURE_ID=900001
export LEDGER_OWNER_ROLE=cabinetdealz_ci_migration_owner

psql -v ON_ERROR_STOP=1 -f ci/postgres/source-fixture.sql
psql -v ON_ERROR_STOP=1 -f docs/postgres-reconciliation-safety-migration.sql
psql -v ON_ERROR_STOP=1 -f ci/postgres/reconciliation-fixture.sql
bash docs/validate-postgres-reconciliation-safety.sh
```

## Implementation status

This is a **GitHub Actions integration example only**. It does not create a workflow in the repository, create PostgreSQL fixtures, enable a CI gate, connect to Stripe, or run against production data.
