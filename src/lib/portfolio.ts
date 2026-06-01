import type { TransactionType } from "@/lib/database.types";

export interface TransactionRow {
  id?: string;
  date: string;
  type: TransactionType | string;
  asset_ticker: string | null;
  quantity: number | null;
  price: number | null;
}

export interface PortfolioHoldings {
  assets: Record<string, { qty: number; totalCost: number; remainingBuys: { qty: number; cost: number; date: string }[] }>;
  cash: number;
  totalDeposits: number;
  totalWithdrawals: number;
  cashflows: { amount: number; date: string }[];
}

/**
 * Parses chronological transactions into current holdings, cash, and cost basis.
 * Fixes division by zero by checking qty > 0.
 *
 * @param transactions Array of transactions, must be sorted chronologically (oldest first).
 */
export function calculateHoldings(transactions: TransactionRow[]): PortfolioHoldings {
  const assets: PortfolioHoldings["assets"] = {};
  const cashflows: { amount: number; date: string }[] = [];
  let cash = 0, totalDeposits = 0, totalWithdrawals = 0;

  for (const tx of transactions) {
    const qty = tx.quantity || 0;
    const price = tx.price || 0;
    const ticker = tx.asset_ticker || "";

    switch (tx.type) {
      case "Deposit":
        cash += price;
        totalDeposits += price;
        cashflows.push({ amount: price, date: tx.date });
        break;
      case "Withdrawal":
        cash -= price;
        totalWithdrawals += price;
        cashflows.push({ amount: -price, date: tx.date });
        break;
      case "Dividend":
        cash += price;
        break;
      case "Buy":
        if (ticker) {
          if (!assets[ticker]) assets[ticker] = { qty: 0, totalCost: 0, remainingBuys: [] };
          assets[ticker].qty += qty;
          assets[ticker].totalCost += qty * price;
          assets[ticker].remainingBuys.push({ qty, cost: qty * price, date: tx.date });
        }
        
        const cost = qty * price;
        if (cash >= cost) {
          cash -= cost;
        } else {
          const implicitDeposit = cost - cash;
          totalDeposits += implicitDeposit;
          cashflows.push({ amount: implicitDeposit, date: tx.date });
          cash = 0;
        }
        break;
      case "Sell":
        if (ticker && assets[ticker]) {
          // Fix division by zero
          const avg = assets[ticker].qty > 0 ? assets[ticker].totalCost / assets[ticker].qty : 0;
          assets[ticker].qty -= qty;
          assets[ticker].totalCost = assets[ticker].qty * avg;

          // Process remainingBuys (FIFO) for personal CAGR calculation
          let qtyToSell = qty;
          const rb = assets[ticker].remainingBuys;
          while (qtyToSell > 0 && rb.length > 0) {
            if (rb[0].qty <= qtyToSell) {
              qtyToSell -= rb[0].qty;
              rb.shift();
            } else {
              const ratio = qtyToSell / rb[0].qty;
              rb[0].qty -= qtyToSell;
              rb[0].cost -= rb[0].cost * ratio;
              qtyToSell = 0;
            }
          }
        }
        cash += qty * price;
        break;
    }
  }

  return { assets, cash, totalDeposits, totalWithdrawals, cashflows };
}
