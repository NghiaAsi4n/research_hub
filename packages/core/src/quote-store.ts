import { desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { type Db, getDb } from './db/client';
import { quotes } from './db/schema';
import type { QuoteInput } from './market';

// Lưu chuỗi giá vào bảng `quotes` (Giai đoạn 6, T1). Khoá duy nhất là (symbol, ts, source) nên
// chạy lại trong ngày chỉ cập nhật giá trị, không sinh bản ghi trùng.

export type StoredQuote = {
  symbol: string;
  ts: Date;
  close: number | null;
  source: string;
};

export function createQuotesStore(db?: Db) {
  const handle = () => (db ??= getDb());

  return {
    async upsertMany(rows: QuoteInput[]): Promise<number> {
      if (rows.length === 0) return 0;
      await handle()
        .insert(quotes)
        .values(
          rows.map((row) => ({
            symbol: row.symbol,
            ts: row.ts,
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: row.volume,
            source: row.source,
          })),
        )
        .onConflictDoUpdate({
          target: [quotes.symbol, quotes.ts, quotes.source],
          set: {
            open: sqlExcluded('open'),
            high: sqlExcluded('high'),
            low: sqlExcluded('low'),
            close: sqlExcluded('close'),
            volume: sqlExcluded('volume'),
          },
        });
      return rows.length;
    },

    async latestSeries(symbols: string[], perSymbol = 2): Promise<StoredQuote[]> {
      if (symbols.length === 0) return [];
      const rows = await handle()
        .select({
          symbol: quotes.symbol,
          ts: quotes.ts,
          close: quotes.close,
          source: quotes.source,
        })
        .from(quotes)
        .where(inArray(quotes.symbol, symbols))
        .orderBy(quotes.symbol, desc(quotes.ts));
      const counts = new Map<string, number>();
      const result: StoredQuote[] = [];
      for (const row of rows) {
        const seen = counts.get(row.symbol) ?? 0;
        if (seen >= perSymbol) continue;
        counts.set(row.symbol, seen + 1);
        result.push({ ...row, ts: new Date(row.ts) });
      }
      return result;
    },

    async deleteForSymbol(symbol: string): Promise<void> {
      await handle().delete(quotes).where(eq(quotes.symbol, symbol));
    },
  };
}

function sqlExcluded(column: 'open' | 'high' | 'low' | 'close' | 'volume') {
  // Drizzle không có helper `excluded` cho cột real trong phiên bản đang dùng, nên viết SQL thô.
  return sql.raw(`excluded."${column}"`) as SQL;
}
