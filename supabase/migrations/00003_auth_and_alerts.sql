-- ============================================
-- Migration 3: Alert settings + RLS + auto-create user on signup
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Add alert columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_day INTEGER DEFAULT 1 CHECK (alert_day >= 1 AND alert_day <= 28);
ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_time TEXT DEFAULT '09:00';

-- 2. Re-enable RLS with proper auth policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_snapshots ENABLE ROW LEVEL SECURITY;

-- Drop any old policies first
DROP POLICY IF EXISTS "Users full access own" ON users;
DROP POLICY IF EXISTS "Targets full access own" ON portfolio_targets;
DROP POLICY IF EXISTS "Transactions full access own" ON transactions;
DROP POLICY IF EXISTS "Snapshots full access own" ON daily_snapshots;

-- Create new policies
CREATE POLICY "Users full access own" ON users FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Targets full access own" ON portfolio_targets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Transactions full access own" ON transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Snapshots full access own" ON daily_snapshots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Auto-create a users row when someone signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, monthly_dca_budget)
  VALUES (NEW.id, NEW.email, 1000)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
