ALTER TABLE `design_image_requests` ADD `manualHandoffBoardUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `design_image_requests` ADD `manualHandoffPrompt` text;--> statement-breakpoint
ALTER TABLE `design_image_requests` ADD `manualHandoffPreparedAt` timestamp;--> statement-breakpoint
ALTER TABLE `design_image_requests` ADD `manualHandoffEmailSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `design_image_requests` ADD `manualHandoffCrmEventId` int;--> statement-breakpoint
ALTER TABLE `design_image_requests` ADD `manualResultAttachedAt` timestamp;--> statement-breakpoint
ALTER TABLE `design_image_requests` ADD `manualResultAttachedBy` int;