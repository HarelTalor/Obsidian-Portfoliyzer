// ============================================
// Database Types — Obsidian Portfoliyzer
// ============================================

export type TransactionType = "Buy" | "Sell" | "Deposit" | "Withdrawal" | "Dividend";

export interface User {
  id: string;
  email: string;
  monthly_dca_budget: number;
  created_at: string;
}

export interface PortfolioTarget {
  id: string;
  user_id: string;
  asset_ticker: string;
  target_percentage: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  date: string;
  type: TransactionType;
  asset_ticker: string | null;
  quantity: number | null;
  price: number | null;
  created_at: string;
}

export interface DailySnapshot {
  id: string;
  user_id: string;
  date: string;
  total_portfolio_value: number;
  created_at: string;
}
