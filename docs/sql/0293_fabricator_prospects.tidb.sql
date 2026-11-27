-- TiDB SQL editor version. Fabricator prospects for the CRM.
--
-- Makes the 573 Florida fabrication shops from 0291 into Sales CRM deals, so
-- they move through the same pipeline as Distributor and Cabinet Shop prospects:
-- New -> Contacted -> Qualified, with priority, notes and a customer page.
--
-- How the app recognises them (client/src/lib/crmFabricatorFilter.ts):
--   company starts with "Fabricator prospect"
--   notes contains "fabricator_list_"
--   notes carries a "State: FL" line so the view can group by state
--
-- Safe to re-run: a shop already represented is skipped by the NOT EXISTS check.
-- Run one statement at a time.

INSERT INTO cabinet_dealz.crm_deals
  (company, title, contactName, contactPhone, contactEmail, location,
   stage, priority, source, language, notes, createdAt, updatedAt)
SELECT
  CONCAT('Fabricator prospect - ', s.name) AS company,
  s.name AS title,
  s.name AS contactName,
  s.phone AS contactPhone,
  s.email AS contactEmail,
  CONCAT_WS(', ',
    NULLIF(s.city, ''),
    NULLIF(CONCAT_WS(' ', s.state, s.zip), '')
  ) AS location,
  'new' AS stage,
  'low' AS priority,
  'manual' AS source,
  'en' AS language,
  CONCAT_WS(' | ',
    'fabricator_list_2026-11-26',
    CONCAT('State: ', s.state),
    NULLIF(s.address, ''),
    NULLIF(s.website, '')
  ) AS notes,
  NOW() AS createdAt,
  NOW() AS updatedAt
FROM cabinet_dealz.fabrication_shops AS s
WHERE s.isActive = 1
  AND (s.state IS NOT NULL AND s.state <> '')
  AND NOT EXISTS (
    SELECT 1 FROM cabinet_dealz.crm_deals AS d
    WHERE d.company = CONCAT('Fabricator prospect - ', s.name)
  );
