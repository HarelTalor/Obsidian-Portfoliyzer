import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export async function GET(req: NextRequest) {
  const tickers = req.nextUrl.searchParams.get("tickers");
  if (!tickers) return NextResponse.json({ error: "Missing ?tickers=" }, { status: 400 });

  const symbols = tickers.split(",").map((s) => s.trim()).filter(Boolean);
  const results: Record<string, { return1y: number | null; cagr: number | null; pe: number | null }> = {};

  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        // Try original symbol, then with .TA suffix
        let data;
        try {
          data = await yf.chart(symbol, { period1: "2000-01-01", interval: "1mo" });
        } catch {
          data = await yf.chart(`${symbol}.TA`, { period1: "2000-01-01", interval: "1mo" });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const quotes = (data as any)?.quotes;
        if (!quotes || quotes.length < 2) {
          results[symbol] = { return1y: null, cagr: null, pe: null };
          return;
        }

        const currentPrice = quotes[quotes.length - 1]?.close;
        if (!currentPrice) { results[symbol] = { return1y: null, cagr: null, pe: null }; return; }

        // 1-year return
        let return1y: number | null = null;
        const oneYearAgoTs = oneYearAgo.getTime();
        // Find the quote closest to 1 year ago
        let closest1y = quotes[0];
        for (const q of quotes) {
          if (q.date && new Date(q.date).getTime() <= oneYearAgoTs) {
            closest1y = q;
          }
        }
        if (closest1y?.close && closest1y.close > 0) {
          return1y = ((currentPrice - closest1y.close) / closest1y.close) * 100;
        }

        // CAGR (all-time avg yearly return)
        let cagr: number | null = null;
        const firstQuote = quotes.find((q: { close?: number }) => q.close && q.close > 0);
        if (firstQuote?.close && firstQuote.date) {
          const firstDate = new Date(firstQuote.date);
          const years = (now.getTime() - firstDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
          if (years >= 1) {
            cagr = (Math.pow(currentPrice / firstQuote.close, 1 / years) - 1) * 100;
          }
        }

        // PE Ratio
        let pe: number | null = null;
        try {
          const quoteResult = await yf.quote(symbol);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pe = (quoteResult as any)?.trailingPE || (quoteResult as any)?.forwardPE || null;
        } catch {
          try {
            const quoteResult = await yf.quote(`${symbol}.TA`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pe = (quoteResult as any)?.trailingPE || (quoteResult as any)?.forwardPE || null;
          } catch {
            // ignore
          }
        }

        results[symbol] = { return1y, cagr, pe };
      } catch {
        results[symbol] = { return1y: null, cagr: null, pe: null };
      }
    })
  );

  return NextResponse.json(results, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
