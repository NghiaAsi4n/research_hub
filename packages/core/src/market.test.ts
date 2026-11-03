import { describe, expect, it, vi } from 'vitest';
import {
  fetchSsiDailyIndex,
  fetchSsiDailyStockPrice,
  fetchSsiToken,
  formatSsiDate,
  parseSsiDate,
  quoteFromIndex,
  quoteFromStock,
  toNumber,
} from './market';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('SSI FastConnect', () => {
  it('đọc ngày và số kiểu SSI', () => {
    expect(parseSsiDate('02/11/2026')?.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(parseSsiDate('2026-11-02')).toBeNull();
    expect(toNumber('1,234.5')).toBe(1234.5);
    expect(toNumber('')).toBeNull();
    expect(formatSsiDate(new Date('2026-11-02T00:00:00Z'))).toBe('02/11/2026');
  });

  it('chuẩn hoá dòng chỉ số và cổ phiếu', () => {
    expect(
      quoteFromIndex({
        Indexcode: 'VNINDEX',
        IndexValue: 1285.4,
        TradingDate: '02/11/2026',
        Totalmatchvol: 450000000,
      }),
    ).toMatchObject({ symbol: 'VNINDEX', close: 1285.4, volume: 450000000, source: 'ssi' });

    expect(
      quoteFromStock({
        Symbol: 'FPT',
        Tradingdate: '02/11/2026',
        Openprice: '70.0',
        Highestprice: '71.5',
        Lowestprice: '69.8',
        Closeprice: '71.0',
        Totalmatchvol: '1200000',
      }),
    ).toMatchObject({ symbol: 'FPT', open: 70, high: 71.5, low: 69.8, close: 71, volume: 1200000 });
  });

  it('lấy token bằng consumerID/consumerSecret', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ message: 'Success', status: 200, data: { accessToken: 'token-123' } }),
    );

    await expect(
      fetchSsiToken({ consumerId: 'id', consumerSecret: 'secret', fetchImpl }),
    ).resolves.toBe('token-123');
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ consumerID: 'id', consumerSecret: 'secret' });
  });

  it('báo lỗi khi token bị từ chối', async () => {
    await expect(
      fetchSsiToken({
        consumerId: 'id',
        consumerSecret: 'sai',
        fetchImpl: async () => json({}, 401),
      }),
    ).rejects.toThrow(/401/);
  });

  it('gọi DailyIndex và DailyStockPrice kèm Bearer token', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('fc-data.ssi.com.vn/api/v2/Market/');
      return json({
        status: 200,
        data: [
          {
            Indexcode: 'VNINDEX',
            IndexValue: 1285.4,
            TradingDate: '02/11/2026',
            Totalmatchvol: 1,
          },
          { Indexcode: 'BROKEN' },
        ],
      });
    });

    const rows = await fetchSsiDailyIndex({
      token: 't',
      indexId: 'VNINDEX',
      fromDate: new Date('2026-10-26T00:00:00Z'),
      toDate: new Date('2026-11-02T00:00:00Z'),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(rows).toHaveLength(1);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer t');

    await fetchSsiDailyStockPrice({
      token: 't',
      symbol: 'FPT',
      fromDate: new Date('2026-10-26T00:00:00Z'),
      toDate: new Date('2026-11-02T00:00:00Z'),
      fetchImpl: async () => json({ data: [] }),
    });
  });
});
