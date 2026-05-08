-- 1. Users
CREATE TABLE Users (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    email TEXT NOT NULL UNIQUE,
    monthly_dca_budget NUMERIC DEFAULT 0.0
);

-- 2. Portfolio_Targets
CREATE TABLE Portfolio_Targets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES Users(id) ON DELETE CASCADE,
    asset_ticker TEXT NOT NULL,
    target_percentage NUMERIC NOT NULL CHECK (target_percentage >= 0 AND target_percentage <= 100)
);

-- 3. Transactions
CREATE TYPE transaction_type AS ENUM ('Buy', 'Sell', 'Deposit', 'Withdrawal', 'Dividend');

CREATE TABLE Transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES Users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    type transaction_type NOT NULL,
    asset_ticker TEXT, -- nullable for cash operations like Deposit/Withdrawal
    quantity NUMERIC,
    price NUMERIC
);

-- 4. Daily_Snapshots
CREATE TABLE Daily_Snapshots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES Users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_portfolio_value NUMERIC NOT NULL,
    UNIQUE(user_id, date)
);
