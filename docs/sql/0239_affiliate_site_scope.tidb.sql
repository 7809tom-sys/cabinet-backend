-- Scope contractors and customer accounts to the affiliate store that created them.
-- Numbered 0239. Run after 0238 and before deploying the affiliate site-scope release.
-- Paste each numbered block on its own in the TiDB SQL editor.
-- One statement per block. Do not paste this into an automatic migration.
-- Every table is cabinet_dealz.<table>. No reserved-word aliases.
-- Safe to re-run where IF NOT EXISTS or IS NULL guards are used.
--
-- contractor_access_requests.affiliateId is the store. Null stays Cabinet Dealz (direct)
-- or a row whose submitter does not own exactly one store (see the read-only list).
-- users.signupAffiliateId is set once at account creation and is never overwritten by later sign-ins.
-- affiliate_contractor_markups is keyed by store so one login that owns two stores
-- can price contractors differently. affiliateUserId only records who saved the row.
-- A missing markup row still means the site-wide contractor multiplier on Cabinet Dealz cost.
-- A saved markup is applied over that store's affiliate cost.

-- 1
ALTER TABLE cabinet_dealz.contractor_access_requests
  ADD COLUMN IF NOT EXISTS affiliateId INT NULL;

-- 2
CREATE INDEX IF NOT EXISTS contractor_access_requests_affiliate_idx
  ON cabinet_dealz.contractor_access_requests (affiliateId);

-- 3
UPDATE cabinet_dealz.contractor_access_requests
INNER JOIN (
  SELECT store_row.userId AS ownerUserId, MIN(store_row.id) AS onlyAffiliateId
  FROM cabinet_dealz.affiliates AS store_row
  INNER JOIN (
    SELECT affiliates.userId AS singleUserId
    FROM cabinet_dealz.affiliates
    WHERE affiliates.userId IS NOT NULL
    GROUP BY affiliates.userId
    HAVING COUNT(*) = 1
  ) AS single_owner ON single_owner.singleUserId = store_row.userId
  GROUP BY store_row.userId
) AS single_store ON single_store.ownerUserId = cabinet_dealz.contractor_access_requests.submittedByUserId
SET cabinet_dealz.contractor_access_requests.affiliateId = single_store.onlyAffiliateId
WHERE cabinet_dealz.contractor_access_requests.affiliateId IS NULL
  AND cabinet_dealz.contractor_access_requests.submittedByUserId IS NOT NULL;

-- 4
SELECT
  contractor_access_requests.id,
  contractor_access_requests.submittedByUserId,
  contractor_access_requests.contractorName,
  contractor_access_requests.contractorEmail,
  contractor_access_requests.businessName,
  contractor_access_requests.status,
  contractor_access_requests.createdAt
FROM cabinet_dealz.contractor_access_requests
WHERE contractor_access_requests.affiliateId IS NULL
  AND contractor_access_requests.submittedByUserId IS NOT NULL
ORDER BY contractor_access_requests.id;

-- 5
ALTER TABLE cabinet_dealz.users
  ADD COLUMN IF NOT EXISTS signupAffiliateId INT NULL;

-- 6
CREATE INDEX IF NOT EXISTS users_signup_affiliate_idx
  ON cabinet_dealz.users (signupAffiliateId);

-- 7
UPDATE cabinet_dealz.users
INNER JOIN (
  SELECT ranked.activityUserId, ranked.activityAffiliateId
  FROM (
    SELECT
      activity_row.activityUserId,
      activity_row.activityAffiliateId,
      ROW_NUMBER() OVER (
        PARTITION BY activity_row.activityUserId
        ORDER BY activity_row.activityAt ASC, activity_row.activityId ASC
      ) AS activityRank
    FROM (
      SELECT
        order_requests.userId AS activityUserId,
        order_requests.affiliateId AS activityAffiliateId,
        order_requests.createdAt AS activityAt,
        order_requests.id AS activityId
      FROM cabinet_dealz.order_requests
      WHERE order_requests.userId IS NOT NULL
        AND order_requests.affiliateId IS NOT NULL
      UNION ALL
      SELECT
        kitchen_designs.userId AS activityUserId,
        kitchen_designs.affiliateId AS activityAffiliateId,
        kitchen_designs.createdAt AS activityAt,
        kitchen_designs.id AS activityId
      FROM cabinet_dealz.kitchen_designs
      WHERE kitchen_designs.userId IS NOT NULL
        AND kitchen_designs.affiliateId IS NOT NULL
    ) AS activity_row
  ) AS ranked
  WHERE ranked.activityRank = 1
) AS first_store ON first_store.activityUserId = cabinet_dealz.users.id
SET cabinet_dealz.users.signupAffiliateId = first_store.activityAffiliateId
WHERE cabinet_dealz.users.signupAffiliateId IS NULL;

-- 8
SELECT
  users.id,
  users.email,
  users.role,
  users.createdAt
FROM cabinet_dealz.users
WHERE users.signupAffiliateId IS NULL
ORDER BY users.id;

-- 9
ALTER TABLE cabinet_dealz.affiliate_contractor_markups
  ADD COLUMN IF NOT EXISTS affiliateId INT NULL;

-- 10
UPDATE cabinet_dealz.affiliate_contractor_markups
INNER JOIN (
  SELECT store_row.userId AS ownerUserId, MIN(store_row.id) AS onlyAffiliateId
  FROM cabinet_dealz.affiliates AS store_row
  INNER JOIN (
    SELECT affiliates.userId AS singleUserId
    FROM cabinet_dealz.affiliates
    WHERE affiliates.userId IS NOT NULL
    GROUP BY affiliates.userId
    HAVING COUNT(*) = 1
  ) AS single_owner ON single_owner.singleUserId = store_row.userId
  GROUP BY store_row.userId
) AS single_store ON single_store.ownerUserId = cabinet_dealz.affiliate_contractor_markups.affiliateUserId
SET cabinet_dealz.affiliate_contractor_markups.affiliateId = single_store.onlyAffiliateId
WHERE cabinet_dealz.affiliate_contractor_markups.affiliateId IS NULL;

-- 11
ALTER TABLE cabinet_dealz.affiliate_contractor_markups
  ADD COLUMN IF NOT EXISTS id INT NULL;

-- 12
UPDATE cabinet_dealz.affiliate_contractor_markups
SET id = affiliateUserId
WHERE id IS NULL;

-- 13
ALTER TABLE cabinet_dealz.affiliate_contractor_markups
  DROP PRIMARY KEY;

-- 14
ALTER TABLE cabinet_dealz.affiliate_contractor_markups
  MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY;

-- 15
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_contractor_markups_affiliate_idx
  ON cabinet_dealz.affiliate_contractor_markups (affiliateId);

-- 16
CREATE INDEX IF NOT EXISTS affiliate_contractor_markups_user_idx
  ON cabinet_dealz.affiliate_contractor_markups (affiliateUserId);

-- 17
SELECT
  order_requests.requestNumber,
  order_requests.affiliateId,
  order_requests.referralCode,
  order_requests.source,
  order_requests.status,
  order_requests.createdAt,
  affiliates.slug
FROM cabinet_dealz.order_requests
LEFT JOIN cabinet_dealz.affiliates
  ON affiliates.id = order_requests.affiliateId
WHERE order_requests.requestNumber LIKE 'CD-20261022%'
ORDER BY order_requests.id;

-- 18
SELECT
  order_requests.affiliateId,
  COUNT(*) AS orderCount
FROM cabinet_dealz.order_requests
GROUP BY order_requests.affiliateId
ORDER BY order_requests.affiliateId;

-- 19
SELECT
  contractor_access_requests.affiliateId,
  COUNT(*) AS contractorCount
FROM cabinet_dealz.contractor_access_requests
GROUP BY contractor_access_requests.affiliateId
ORDER BY contractor_access_requests.affiliateId;

-- 20
SELECT
  users.signupAffiliateId,
  COUNT(*) AS userCount
FROM cabinet_dealz.users
GROUP BY users.signupAffiliateId
ORDER BY users.signupAffiliateId;
