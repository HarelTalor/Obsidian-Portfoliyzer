-- ============================================
-- Obsidian Portfoliyzer — Database Schema
-- ============================================

-- 1. Users (extends Supabase Auth)
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    monthly_dca_budget NUMERIC DEFAULT 0.0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Portfolio Targets (the strategy / recipe)
CREATE TABLE portfolio_targets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_ticker TEXT NOT NULL,
    target_percentage NUMERIC NOT NULL CHECK (target_percentage >= 0 AND target_percentage <= 100),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, asset_ticker)
);

-- 3. Transactions (the ledger)
CREATE TYPE transaction_type AS ENUM ('Buy', 'Sell', 'Deposit', 'Withdrawal', 'Dividend');

CREATE TABLE transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    type transaction_type NOT NULL,
    asset_ticker TEXT,           -- nullable for cash operations (Deposit, Withdrawal)
    quantity NUMERIC,
    price NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Daily Snapshots (for the equity curve chart)
CREATE TABLE daily_snapshots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_portfolio_value NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, date)
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users can only see/modify their own data
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can manage own targets" ON portfolio_targets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own transactions" ON transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own snapshots" ON daily_snapshots FOR ALL USING (auth.uid() = user_id);
