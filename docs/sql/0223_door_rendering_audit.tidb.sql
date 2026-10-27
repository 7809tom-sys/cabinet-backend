-- TiDB SQL editor version of drizzle/0223_door_rendering_audit.sql.
-- Journal idx 222. Paste each numbered block on its own.
-- One statement per block. No statement-breakpoint markers.
-- Safe to re-run: IF NOT EXISTS, tables qualified as cabinet_dealz.<table>.
-- Render versions are append-only. Do not add a cleanup DELETE for them.

-- 1
CREATE TABLE IF NOT EXISTS cabinet_dealz.door_rendering_audit_runs (
  id INT NOT NULL AUTO_INCREMENT,
  scope ENUM('all','changed','selected') NOT NULL,
  status ENUM('awaiting_renders','scoring','completed','failed','cancelled') NOT NULL DEFAULT 'awaiting_renders',
  requestedBy INT NOT NULL,
  requestedByName VARCHAR(255) NULL,
  renderingCommit VARCHAR(128) NULL,
  styleCap INT NOT NULL DEFAULT 40,
  selectedCount INT NOT NULL DEFAULT 0,
  pendingCount INT NOT NULL DEFAULT 0,
  scoredCount INT NOT NULL DEFAULT 0,
  failedCount INT NOT NULL DEFAULT 0,
  flaggedCount INT NOT NULL DEFAULT 0,
  skippedUnchangedCount INT NOT NULL DEFAULT 0,
  skippedMissingSampleCount INT NOT NULL DEFAULT 0,
  errorMessage VARCHAR(512) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completedAt TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id)
);

-- 2
CREATE INDEX IF NOT EXISTS door_rendering_audit_runs_created_idx ON cabinet_dealz.door_rendering_audit_runs (createdAt);

-- 3
CREATE INDEX IF NOT EXISTS door_rendering_audit_runs_status_idx ON cabinet_dealz.door_rendering_audit_runs (status, createdAt);

-- 4
CREATE TABLE IF NOT EXISTS cabinet_dealz.door_rendering_audit_results (
  id INT NOT NULL AUTO_INCREMENT,
  runId INT NOT NULL,
  styleId INT NOT NULL,
  status ENUM('pending_render','scoring','scored','failed') NOT NULL DEFAULT 'pending_render',
  renderingCommit VARCHAR(128) NULL,
  samplePhotoUrl VARCHAR(512) NOT NULL,
  renderImageUrl VARCHAR(512) NULL,
  versionId INT NULL,
  woodGrainScore INT NULL,
  colorScore INT NULL,
  textureSheenScore INT NULL,
  profileEdgesScore INT NULL,
  overallScore INT NULL,
  acceptedOverallScore INT NULL,
  scoreDelta INT NULL,
  verdict ENUM('pending','flagged','not_flagged','no_baseline','failed') NOT NULL DEFAULT 'pending',
  notes VARCHAR(512) NULL,
  errorMessage VARCHAR(512) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  scoredAt TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id)
);

-- 5
CREATE UNIQUE INDEX IF NOT EXISTS door_rendering_audit_results_run_style_uq ON cabinet_dealz.door_rendering_audit_results (runId, styleId);

-- 6
CREATE INDEX IF NOT EXISTS door_rendering_audit_results_style_idx ON cabinet_dealz.door_rendering_audit_results (styleId, createdAt);

-- 7
CREATE TABLE IF NOT EXISTS cabinet_dealz.door_rendering_versions (
  id INT NOT NULL AUTO_INCREMENT,
  styleId INT NOT NULL,
  runId INT NULL,
  renderingCommit VARCHAR(128) NULL,
  samplePhotoUrl VARCHAR(512) NOT NULL,
  renderImageUrl VARCHAR(512) NOT NULL,
  renderImageKey VARCHAR(512) NULL,
  woodGrainScore INT NOT NULL,
  colorScore INT NOT NULL,
  textureSheenScore INT NOT NULL,
  profileEdgesScore INT NOT NULL,
  overallScore INT NOT NULL,
  acceptedOverallScore INT NULL,
  scoreDelta INT NULL,
  verdict ENUM('flagged','not_flagged','no_baseline') NOT NULL,
  notes VARCHAR(512) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

-- 8
CREATE INDEX IF NOT EXISTS door_rendering_versions_style_created_idx ON cabinet_dealz.door_rendering_versions (styleId, createdAt);

-- 9
CREATE INDEX IF NOT EXISTS door_rendering_versions_run_idx ON cabinet_dealz.door_rendering_versions (runId);

-- 10
CREATE TABLE IF NOT EXISTS cabinet_dealz.door_rendering_version_events (
  id INT NOT NULL AUTO_INCREMENT,
  styleId INT NOT NULL,
  versionId INT NOT NULL,
  action ENUM('accepted','rejected','reverted') NOT NULL,
  actorUserId INT NOT NULL,
  note VARCHAR(512) NULL,
  previousAcceptedVersionId INT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

-- 11
CREATE INDEX IF NOT EXISTS door_rendering_version_events_style_idx ON cabinet_dealz.door_rendering_version_events (styleId, createdAt);

-- 12
CREATE INDEX IF NOT EXISTS door_rendering_version_events_version_idx ON cabinet_dealz.door_rendering_version_events (versionId, createdAt);

-- 13 read-only check. Expect every column below to be 1.
SELECT
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = 'cabinet_dealz'
      AND TABLE_NAME = 'door_rendering_audit_runs') AS runs_table,
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = 'cabinet_dealz'
      AND TABLE_NAME = 'door_rendering_audit_results') AS results_table,
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = 'cabinet_dealz'
      AND TABLE_NAME = 'door_rendering_versions') AS versions_table,
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = 'cabinet_dealz'
      AND TABLE_NAME = 'door_rendering_version_events') AS events_table,
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = 'cabinet_dealz'
      AND TABLE_NAME = 'door_rendering_audit_results'
      AND INDEX_NAME = 'door_rendering_audit_results_run_style_uq') AS results_run_style_index,
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = 'cabinet_dealz'
      AND TABLE_NAME = 'door_rendering_versions'
      AND INDEX_NAME = 'door_rendering_versions_style_created_idx') AS versions_style_index,
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = 'cabinet_dealz'
      AND TABLE_NAME = 'door_rendering_version_events'
      AND INDEX_NAME = 'door_rendering_version_events_style_idx') AS events_style_index;
