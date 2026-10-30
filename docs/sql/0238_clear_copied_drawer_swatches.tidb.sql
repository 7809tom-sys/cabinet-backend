-- Clear door photos that were copied into the drawer slot. Numbered 0238.
-- Paste each numbered block on its own in the TiDB SQL editor.
-- One statement per block. Do not run this from an application.
-- Every table is cabinet_dealz.<table>. No reserved-word aliases.
-- Safe to re-run: a second pass matches no rows.
--
-- The Oct 29 AEF Syncron, Zenit, and Luxe swatch refresh wrote one crop into
-- doorSampleImageUrl, drawerSampleImageUrl, and thumbnailImageUrl. Slim Cava
-- crops such as SCN also run past the photo: a near-white top row and a light
-- band on the right edge. This file only removes the drawer stand-in.
-- It does not replace the door photo. Re-crop from a source image with
-- scripts/refresh-aef-syncron-clean-swatches.ts (and the Zenit and Luxe
-- scripts) after the content-aware check accepts the crop.
-- There is no new column, so IF NOT EXISTS does not apply.

-- 1
UPDATE cabinet_dealz.door_styles
SET drawerSampleImageUrl = NULL,
    drawerSampleVerified = 0
WHERE distributorId IN (SELECT id FROM cabinet_dealz.distributors WHERE code = 'AEF')
  AND styleCode IN (
    'SSM','SSO','SSH','SSR','SSV','SSJ','SSP','SSQ','SSN','SSA','SSD','SSZ','SSK','SSE','SSS','SSL','SSX',
    'SCM','SCR','SCN','SCQ','SCA','SCZ','SCL',
    'ZSA','ZSB','ZSC','ZSI','ZSK','ZSL','ZSM','ZSN','ZSO','ZSP','ZSU','ZSV','ZSW',
    'LSA','LSC','LSN','LSP','LSR'
  )
  AND drawerSampleImageUrl IS NOT NULL
  AND drawerSampleImageUrl <> ''
  AND doorSampleImageUrl IS NOT NULL
  AND doorSampleImageUrl <> ''
  AND drawerSampleImageUrl = doorSampleImageUrl;

-- 2 read-only check. Expect 0.
SELECT COUNT(*)
FROM cabinet_dealz.door_styles
WHERE distributorId IN (SELECT id FROM cabinet_dealz.distributors WHERE code = 'AEF')
  AND styleCode IN (
    'SSM','SSO','SSH','SSR','SSV','SSJ','SSP','SSQ','SSN','SSA','SSD','SSZ','SSK','SSE','SSS','SSL','SSX',
    'SCM','SCR','SCN','SCQ','SCA','SCZ','SCL',
    'ZSA','ZSB','ZSC','ZSI','ZSK','ZSL','ZSM','ZSN','ZSO','ZSP','ZSU','ZSV','ZSW',
    'LSA','LSC','LSN','LSP','LSR'
  )
  AND drawerSampleImageUrl IS NOT NULL
  AND drawerSampleImageUrl <> ''
  AND drawerSampleImageUrl = doorSampleImageUrl;
