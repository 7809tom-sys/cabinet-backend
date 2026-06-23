CREATE TABLE `crm_deal_designs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dealId` int NOT NULL,
	`designId` int NOT NULL,
	`designName` varchar(256) NOT NULL,
	`linkedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crm_deal_designs_id` PRIMARY KEY(`id`)
);
