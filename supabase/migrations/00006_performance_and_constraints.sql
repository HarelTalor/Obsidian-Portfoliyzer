-- ============================================
-- Migration 6: Performance Indexes & Data Integrity
-- ============================================

-- 1. Performance Indexes for foreign keys
-- These prevent full table scans when querying by user_id
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_targets_user_id ON portfolio_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_user_id ON daily_snapshots(user_id);

-- 2. Data Integrity Constraints
-- Ensure that Buy, Sell, and Dividend transactions have an asset_ticker.
-- Deposit and Withdrawal are cash operations and can have a NULL asset_ticker.
ALTER TABLE transactions 
ADD CONSTRAINT check_ticker_required 
CHECK (
  type IN ('Deposit', 'Withdrawal') OR asset_ticker IS NOT NULL
);
