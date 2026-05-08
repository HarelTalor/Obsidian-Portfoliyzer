import { NextRequest, NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

export async function GET(req: NextRequest) {
  const tickers = req.nextUrl.searchParams.get("tickers");
  if (!tickers) {
    return NextResponse.json({ error: "Missing ?tickers= parameter" }, { status: 400 });
  }

  const symbols = tickers.split(",").map((s) => s.trim()).filter(Boolean);
  const prices: Record<string, number> = {};

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const result = await yahooFinance.quote(symbol);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prices[symbol] = (result as any).regularMarketPrice ?? 0;
      } catch {
        // Try with .TA suffix for Tel Aviv stocks
        try {
          const result = await yahooFinance.quote(`${symbol}.TA`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          prices[symbol] = (result as any).regularMarketPrice ?? 0;
        } catch {
          prices[symbol] = 0;
        }
      }
    })
  );

  return NextResponse.json(prices, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
