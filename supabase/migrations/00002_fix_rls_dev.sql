-- ============================================
-- Fix RLS: Allow all operations for development
-- Run this in the Supabase SQL Editor
-- ============================================

-- Drop the old restrictive policies
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can manage own targets" ON portfolio_targets;
DROP POLICY IF EXISTS "Users can manage own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can manage own snapshots" ON daily_snapshots;

-- Option A: Disable RLS entirely for dev (simplest)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_targets DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_snapshots DISABLE ROW LEVEL SECURITY;

-- Ensure dev user exists
INSERT INTO users (id, email, monthly_dca_budget)
VALUES ('00000000-0000-0000-0000-000000000001', 'dev@portfoliyzer.local', 1000)
ON CONFLICT (id) DO NOTHING;
