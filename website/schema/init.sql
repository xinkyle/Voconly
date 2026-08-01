-- Voconly Website D1 Database Initialization Script
-- Created: 2026-04-05
-- Description: Stores channel tracking and download events

-- Visit records table
CREATE TABLE IF NOT EXISTS page_visits (
  visit_id TEXT PRIMARY KEY,
  ref_source TEXT DEFAULT 'direct',
  visit_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_hash TEXT,
  user_agent TEXT,
  landing_page TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Download events table
CREATE TABLE IF NOT EXISTS download_events (
  download_id TEXT PRIMARY KEY,
  visit_id TEXT,
  ref_source TEXT,
  download_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  platform TEXT,
  installer_version TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Channel summary statistics table
CREATE TABLE IF NOT EXISTS channel_stats (
  channel TEXT PRIMARY KEY,
  total_visits INTEGER DEFAULT 0,
  total_downloads INTEGER DEFAULT 0,
  last_visit_time DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common query fields
CREATE INDEX IF NOT EXISTS idx_visits_ref ON page_visits(ref_source);
CREATE INDEX IF NOT EXISTS idx_visits_time ON page_visits(visit_time);
CREATE INDEX IF NOT EXISTS idx_downloads_ref ON download_events(ref_source);
CREATE INDEX IF NOT EXISTS idx_downloads_time ON download_events(download_time);

-- 关联查询索引
CREATE INDEX IF NOT EXISTS idx_downloads_visit ON download_events(visit_id);

-- Initialize channel statistics with predefined channels
INSERT OR IGNORE INTO channel_stats (channel, total_visits, total_downloads) VALUES
  ('producthunt', 0, 0),
  ('twitter', 0, 0),
  ('reddit', 0, 0),
  ('email', 0, 0),
  ('friend', 0, 0),
  ('search', 0, 0),
  ('direct', 0, 0);