CREATE TABLE `cabinet_brand_attributes` (
`id` int AUTO_INCREMENT NOT NULL,
`brand` varchar(64) NOT NULL,
`appliesTo` varchar(128) NOT NULL,
`attribute` varchar(64) NOT NULL,
`brandValue` text NOT NULL,
`masterValue` varchar(128),
`source` varchar(191),
`note` text,
`distributor` varchar(64),
`nativeCode` varchar(64),
`isActive` boolean NOT NULL DEFAULT true,
`createdAt` timestamp NOT NULL DEFAULT (now()),
CONSTRAINT `cabinet_brand_attributes_id` PRIMARY KEY(`id`)
);
