-- Add category column to portfolio_targets
ALTER TABLE portfolio_targets
ADD COLUMN category TEXT NOT NULL DEFAULT 'Core';
