-- ============================================
-- Migration 4: Add last_alert_sent to prevent duplicate monthly emails
-- Run this in Supabase SQL Editor
-- ============================================

-- Stores "YYYY-MM" of the last month an alert was sent.
-- The cron checks this to avoid sending twice in the same month.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_alert_sent TEXT DEFAULT NULL;
