-- Affiliate-submitted contractor access requests. Numbered 0237. Run after 0234.
-- Paste each numbered block on its own in the TiDB SQL editor.
-- One statement per block. Do not paste this into an automatic migration.
-- Every table is cabinet_dealz.<table>. No reserved-word aliases.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS and CREATE INDEX IF NOT EXISTS.
-- Block 1 restates userId as nullable. Running it again is safe.
--
-- userId stays null when an affiliate adds a contractor who has no account yet.
-- Sign-in links an approved row for that email and sets users.role to contractor
-- only when the account role is still user. See linkApprovedContractorAccess:
-- called from createEmailUser, upsertUser, and Supabase sign-in.

-- 1
ALTER TABLE cabinet_dealz.contractor_access_requests
  MODIFY COLUMN userId INT NULL;

-- 2
ALTER TABLE cabinet_dealz.contractor_access_requests
  ADD COLUMN IF NOT EXISTS submittedByUserId INT NULL;

-- 3
ALTER TABLE cabinet_dealz.contractor_access_requests
  ADD COLUMN IF NOT EXISTS contractorName VARCHAR(256) NULL;

-- 4
ALTER TABLE cabinet_dealz.contractor_access_requests
  ADD COLUMN IF NOT EXISTS contractorEmail VARCHAR(320) NULL;

-- 5
CREATE INDEX IF NOT EXISTS contractor_access_requests_email_status_idx
  ON cabinet_dealz.contractor_access_requests (contractorEmail, status);

-- 6
CREATE INDEX IF NOT EXISTS contractor_access_requests_submitter_idx
  ON cabinet_dealz.contractor_access_requests (submittedByUserId);
