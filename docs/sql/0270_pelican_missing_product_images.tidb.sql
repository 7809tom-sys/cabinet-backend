-- Pelican product photos for catalog rows that had no imageUrl. By-hand TiDB SQL. NOT RUN by this PR.
-- One statement per line, one line per row. Paste one line at a time in the TiDB SQL editor.
--
-- ORDER MATTERS: run `scripts/upload-pelican-product-images.ts` FIRST (it needs SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY). Until the files are in storage these paths resolve to nothing.
-- The script uploads exactly these keys; the keys are listed in data/pelican/product-images-manifest.json.
--
-- Sets cabinet_dealz.pelican_products.imageUrl only. Does not touch name, description, pelicanCode, slug,
-- category, subCategory, size, any price column, markupPercent, inventory, availability, visibility,
-- materialImageUrl or roomSceneImageUrl. No IF NOT EXISTS: there is no new column. Safe to re-run:
-- each statement writes the same value to the same row and matches at most one row.
--
-- Sources: Pelican International's official storefront, buildpelican.com (pelicanintl.com is not a catalog).
-- 44 official photos for 48 catalog rows, captured 2026-11-07.
-- Full SKU-to-source mapping, including the rows left without a photo and why, is in the PR description.

-- 48 statements follow, ordered by category then SKU.

-- Flooring
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/acornplanks-e8d39eb1-fc3b-4ffa-a1f5-9fd50f90e489_4771a784.webp' WHERE id = 39 AND pelicanCode = 'Acorn';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/avilesinstalled-c365b488-9fd7-4309-9c7f-0255d3551d08_25d99b0d.webp' WHERE id = 77 AND pelicanCode = 'Aviles';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/24_0681f7c4.webp' WHERE id = 112 AND pelicanCode = 'BM0096 Scotchgard Guardian Underlayment';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/bbl-914-006-1_e055c0b1.webp' WHERE id = 89 AND pelicanCode = 'Bahia Stair Nose';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/bourbonplanks_732c31b2.webp' WHERE id = 113 AND pelicanCode = 'Bourbon';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/broadwayplanks_ea19c71e.webp' WHERE id = 115 AND pelicanCode = 'Broadway';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/caldeninstalled-6ef2618d-8923-4c04-895b-084ae97c8c87_84ba4043.webp' WHERE id = 124 AND pelicanCode = 'Calden';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/bbl-911-11-1_da1cd3fb.webp' WHERE id = 140 AND pelicanCode = 'Captiva Stair Nose';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/bbl923-9-1_c0e93b4c.webp' WHERE id = 194 AND pelicanCode = 'Desoto Stair Nose';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/elfrethplanks_c7e55f1d.webp' WHERE id = 212 AND pelicanCode = 'Elfreth';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/freemontplanks_4a4fed97.webp' WHERE id = 235 AND pelicanCode = 'Freemont';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/kingplanks_68b5771a.webp' WHERE id = 290 AND pelicanCode = 'King';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/leydenplanks_6bcff11d.webp' WHERE id = 305 AND pelicanCode = 'Leyden';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/bbl-914-008-1_a16698b7.webp' WHERE id = 317 AND pelicanCode = 'Madeira Stair Nose';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/bbl2101l-5-1_354a79ba.webp' WHERE id = 376 AND pelicanCode = 'Navarre Stair Nose';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/orelleinstalled_6317b1ae.webp' WHERE id = 398 AND pelicanCode = 'Orelle';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/palisinstalled_46360cd4.webp' WHERE id = 420 AND pelicanCode = 'Palis';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/riverinstalled_72975e47.webp' WHERE id = 1165 AND pelicanCode = 'River';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/bbl-911-10-1_f1f217dd.webp' WHERE id = 1191 AND pelicanCode = 'Sanibel Stair Nose';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/sorainstalled_7e7c6e27.webp' WHERE id = 1238 AND pelicanCode = 'Sora';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/stoneplanks_e5d2e840.webp' WHERE id = 1264 AND pelicanCode = 'Stone';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/bbl984l-2-1_724ad619.webp' WHERE id = 1304 AND pelicanCode = 'Tigertail Stair Nose';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/tressainstalled_3b14f86c.webp' WHERE id = 1313 AND pelicanCode = 'Tressa';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/vaileninstalled_e34829b0.webp' WHERE id = 1331 AND pelicanCode = 'Vailen';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/33001-001-1_c381a020.webp' WHERE id = 1345 AND pelicanCode = 'Vanderbilt Stair Nose';
-- Marketing & Merchandise
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-fc3020wsblack-c56a13a8-c476-49aa-9819-0609a2509d08_4bcaacf0.webp' WHERE id = 887 AND pelicanCode = 'PL-FC3020WS Black';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-fc3020wsgrey_974a97e1.webp' WHERE id = 888 AND pelicanCode = 'PL-FC3020WS Grey';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-fc3020wswhite-9779d2ca-d492-4bbe-871b-a0abb4f8492c_4dc359a6.webp' WHERE id = 889 AND pelicanCode = 'PL-FC3020WS White';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-fc3320wsgrey_209737fe.webp' WHERE id = 910 AND pelicanCode = 'PL-FC3320WS Grey';
-- Sinks & Faucets
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-02849l-18e8a446-cb1a-4dfb-9cff-37a8f59439d6_e76e0a84.webp' WHERE id = 473 AND pelicanCode = 'PL-02849LNSO';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-02849r-f7e444ec-7605-4e32-8e9a-98d72853bfdb_ee699fe2.webp' WHERE id = 475 AND pelicanCode = 'PL-02849RNSO';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-02850l-bb7b611b-4985-4aca-860b-1b9e18b75c86_867f496a.webp' WHERE id = 477 AND pelicanCode = 'PL-02850LNSO';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-02850r-b135cdad-bb7b-4957-8786-f8dfef1fe63a_95b8b4ba.webp' WHERE id = 479 AND pelicanCode = 'PL-02850RNSO';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-02849l-18e8a446-cb1a-4dfb-9cff-37a8f59439d6_e76e0a84.webp' WHERE id = 481 AND pelicanCode = 'PL-02851LNSO';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-02849r-f7e444ec-7605-4e32-8e9a-98d72853bfdb_ee699fe2.webp' WHERE id = 483 AND pelicanCode = 'PL-02851RNSO';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-36-tub-drain-white_6eb10f57.webp' WHERE id = 670 AND pelicanCode = 'PL-36 Tub Drain White';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-fc3018sb-black_49368879.webp' WHERE id = 882 AND pelicanCode = 'PL-FC3018SB Black';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-fc3018sb-grey_2bbcb801.webp' WHERE id = 884 AND pelicanCode = 'PL-FC3018SB Grey';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-fc3018sb-white_2cfe33be.webp' WHERE id = 885 AND pelicanCode = 'PL-FC3018SB White';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-fc3219sb_55091c82.webp' WHERE id = 893 AND pelicanCode = 'PL-FC3219SB';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-fc3219sb_55091c82.webp' WHERE id = 895 AND pelicanCode = 'PL-FC3219SB White';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-fc3220sb_7677dc60.webp' WHERE id = 896 AND pelicanCode = 'PL-FC3220SB';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-fc3220sb_7677dc60.webp' WHERE id = 898 AND pelicanCode = 'PL-FC3220SB White';
-- Toilets & Bidets
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-12005-13_26930a41.webp' WHERE id = 557 AND pelicanCode = 'PL-12005';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-12005black-14_ecc408c5.webp' WHERE id = 558 AND pelicanCode = 'PL-12005 MB';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-12305_c9a2458a.webp' WHERE id = 571 AND pelicanCode = 'PL-12305';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/12305black-2_9d20875e.webp' WHERE id = 572 AND pelicanCode = 'PL-12305 MB';
UPDATE cabinet_dealz.pelican_products SET imageUrl = '/manus-storage/pelican/pl-a249-2f3f0a47-36c0-44b1-821d-e877da28097e_7c5337e6.webp' WHERE id = 840 AND pelicanCode = 'PL-A249 ADA';

-- Read-only verification. Expect 0 rows: every id below must now have a non-empty imageUrl.
SELECT id, pelicanCode, imageUrl FROM cabinet_dealz.pelican_products WHERE id IN (39, 77, 89, 112, 113, 115, 124, 140, 194, 212, 235, 290, 305, 317, 376, 398, 420, 473, 475, 477, 479, 481, 483, 557, 558, 571, 572, 670, 840, 882, 884, 885, 887, 888, 889, 893, 895, 896, 898, 910, 1165, 1191, 1238, 1264, 1304, 1313, 1331, 1345) AND (imageUrl IS NULL OR imageUrl = '');

-- Read-only verification. Expect exactly 48.
SELECT COUNT(*) FROM cabinet_dealz.pelican_products WHERE id IN (39, 77, 89, 112, 113, 115, 124, 140, 194, 212, 235, 290, 305, 317, 376, 398, 420, 473, 475, 477, 479, 481, 483, 557, 558, 571, 572, 670, 840, 882, 884, 885, 887, 888, 889, 893, 895, 896, 898, 910, 1165, 1191, 1238, 1264, 1304, 1313, 1331, 1345) AND imageUrl LIKE '/manus-storage/pelican/%';
