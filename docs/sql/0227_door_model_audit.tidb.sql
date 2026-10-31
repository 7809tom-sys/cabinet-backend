-- TiDB SQL editor version of drizzle/0227_door_model_audit.sql.
-- Journal idx 226. Paste each numbered block on its own.
-- One statement per block. No statement-breakpoint markers.
-- Safe to re-run: IF NOT EXISTS, tables qualified as cabinet_dealz.<table>.
-- RUN BEFORE MERGING / DEPLOYING the automatic 3D door audit PR: the app reads
-- these tables as soon as a door sample photo is saved.
-- Nothing here publishes a model: every new job starts queued and only an
-- admin Approve makes a model live in the Designer.

-- 1
CREATE TABLE IF NOT EXISTS cabinet_dealz.door_model_audits (
  id INT NOT NULL AUTO_INCREMENT,
  styleId INT NOT NULL,
  status ENUM('queued','generating','checking','flagged','awaiting_tom','approved','rejected') NOT NULL DEFAULT 'queued',
  sourceFingerprint VARCHAR(512) NOT NULL,
  doorSampleUrl VARCHAR(512) NOT NULL,
  drawerSampleUrl VARCHAR(512) NULL,
  attemptCount INT NOT NULL DEFAULT 0,
  maxAttempts INT NOT NULL DEFAULT 3,
  claimToken VARCHAR(64) NULL,
  currentAttemptId INT NULL,
  approvedAttemptId INT NULL,
  approvedModelSpec TEXT NULL,
  tomFeedback VARCHAR(512) NULL,
  flaggedReasons TEXT NULL,
  errorMessage VARCHAR(512) NULL,
  queuedAt TIMESTAMP NULL DEFAULT NULL,
  generatingAt TIMESTAMP NULL DEFAULT NULL,
  checkingAt TIMESTAMP NULL DEFAULT NULL,
  flaggedAt TIMESTAMP NULL DEFAULT NULL,
  awaitingTomAt TIMESTAMP NULL DEFAULT NULL,
  decidedAt TIMESTAMP NULL DEFAULT NULL,
  decidedBy INT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

-- 2
CREATE TABLE IF NOT EXISTS cabinet_dealz.door_model_audit_attempts (
  id INT NOT NULL AUTO_INCREMENT,
  auditId INT NOT NULL,
  styleId INT NOT NULL,
  attemptNo INT NOT NULL,
  `trigger` ENUM('auto','auto_revision','tom_rejection') NOT NULL DEFAULT 'auto',
  modelSpec TEXT NULL,
  straightPreviewUrl VARCHAR(512) NULL,
  threeQuarterPreviewUrl VARCHAR(512) NULL,
  runPreviewUrl VARCHAR(512) NULL,
  colorScore INT NULL,
  grainScore INT NULL,
  profileScore INT NULL,
  proportionsScore INT NULL,
  drawerFrontScore INT NULL,
  checkNotes TEXT NULL,
  passed BOOLEAN NULL,
  reasons TEXT NULL,
  feedbackUsed VARCHAR(1024) NULL,
  checkerModel VARCHAR(128) NULL,
  errorMessage VARCHAR(512) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

-- 3
CREATE TABLE IF NOT EXISTS cabinet_dealz.door_model_audit_events (
  id INT NOT NULL AUTO_INCREMENT,
  auditId INT NOT NULL,
  styleId INT NOT NULL,
  fromStatus VARCHAR(32) NULL,
  toStatus VARCHAR(32) NOT NULL,
  attemptNo INT NULL,
  actorUserId INT NULL,
  note VARCHAR(1024) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

-- 4
CREATE UNIQUE INDEX IF NOT EXISTS door_model_audits_style_uidx ON cabinet_dealz.door_model_audits (styleId);

-- 5
CREATE INDEX IF NOT EXISTS door_model_audits_status_idx ON cabinet_dealz.door_model_audits (status, updatedAt);

-- 6
CREATE INDEX IF NOT EXISTS door_model_audit_attempts_audit_idx ON cabinet_dealz.door_model_audit_attempts (auditId, attemptNo);

-- 7
CREATE INDEX IF NOT EXISTS door_model_audit_attempts_style_idx ON cabinet_dealz.door_model_audit_attempts (styleId, createdAt);

-- 8
CREATE INDEX IF NOT EXISTS door_model_audit_events_audit_idx ON cabinet_dealz.door_model_audit_events (auditId, createdAt);

-- 9 read-only check. Expect tables_created = 3, index_columns = 5.
SELECT
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = 'cabinet_dealz'
      AND TABLE_NAME IN ('door_model_audits','door_model_audit_attempts','door_model_audit_events')) AS tables_created,
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = 'cabinet_dealz'
      AND INDEX_NAME IN ('door_model_audits_style_uidx','door_model_audits_status_idx','door_model_audit_attempts_audit_idx','door_model_audit_attempts_style_idx','door_model_audit_events_audit_idx')) AS index_columns;
