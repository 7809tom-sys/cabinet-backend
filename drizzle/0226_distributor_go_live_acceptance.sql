-- Go live: record who accepted a supplier's terms, when, which terms version, and what was shown.
-- NOT APPLIED by the PR. Tom runs migrations by hand.
ALTER TABLE `distributors` ADD `goLiveAcceptedByUserId` int;
ALTER TABLE `distributors` ADD `goLiveAcceptedAt` timestamp;
ALTER TABLE `distributors` ADD `goLiveTermsVersion` varchar(32);
ALTER TABLE `distributors` ADD `goLiveTermsSnapshot` json;
