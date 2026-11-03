// Dữ liệu chứng khoán VN qua SSI FastConnect (Giai đoạn 6, T1).
//
// Luồng: POST /Market/AccessToken bằng consumerID/consumerSecret, rồi GET /Market/DailyIndex hoặc
// /Market/DailyStockPrice kèm Bearer token. Chỉ lưu chuỗi giá vào bảng `quotes`, không tạo chunk.

export const SSI_BASE_URL = 'https://fc-data.ssi.com.vn/api/v2';
export const SSI_SOURCE = 'ssi';

export type QuoteInput = {
  symbol: string;
  ts: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  source: string;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function parseSsiDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/,/g, '').trim();
  if (normalized === '') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function quoteFromIndex(row: Record<string, unknown>): QuoteInput | null {
  const ts = parseSsiDate(row.TradingDate);
  const close = toNumber(row.IndexValue);
  const symbol = typeof row.Indexcode === 'string' ? row.Indexcode : null;
  if (ts === null || close === null || symbol === null) return null;
  return {
    symbol,
    ts,
    open: null,
    high: null,
    low: null,
    close,
    volume: toNumber(row.Totalmatchvol),
    source: SSI_SOURCE,
  };
}

export function quoteFromStock(row: Record<string, unknown>): QuoteInput | null {
  const ts = parseSsiDate(row.Tradingdate);
  const close = toNumber(row.Closeprice);
  const symbol = typeof row.Symbol === 'string' ? row.Symbol : null;
  if (ts === null || close === null || symbol === null) return null;
  return {
    symbol,
    ts,
    open: toNumber(row.Openprice),
    high: toNumber(row.Highestprice),
    low: toNumber(row.Lowestprice),
    close,
    volume: toNumber(row.Totalmatchvol),
    source: SSI_SOURCE,
  };
}

export async function fetchSsiToken(input: {
  consumerId: string;
  consumerSecret: string;
  fetchImpl?: FetchLike;
}): Promise<string> {
  const response = await (input.fetchImpl ?? fetch)(`${SSI_BASE_URL}/Market/AccessToken`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ consumerID: input.consumerId, consumerSecret: input.consumerSecret }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`SSI token HTTP ${response.status}`);
  const body = (await response.json()) as {
    accessToken?: unknown;
    data?: { accessToken?: unknown };
  };
  const token = body.data?.accessToken ?? body.accessToken;
  if (typeof token !== 'string' || token === '') throw new Error('SSI token rỗng');
  return token;
}

async function getJson(url: string, token: string, fetchImpl?: FetchLike): Promise<unknown> {
  const response = await (fetchImpl ?? fetch)(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`SSI HTTP ${response.status}`);
  return response.json();
}

function rowsOf(body: unknown): Record<string, unknown>[] {
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  return data.filter(
    (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
  );
}

function ssiQuery(path: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return `${SSI_BASE_URL}${path}?${search.toString()}`;
}

export async function fetchSsiDailyIndex(input: {
  token: string;
  indexId: string;
  fromDate: Date;
  toDate: Date;
  fetchImpl?: FetchLike;
}): Promise<QuoteInput[]> {
  const body = await getJson(
    ssiQuery('/Market/DailyIndex', {
      indexId: input.indexId,
      fromDate: formatSsiDate(input.fromDate),
      toDate: formatSsiDate(input.toDate),
      pageIndex: '1',
      pageSize: '100',
      ascending: 'true',
    }),
    input.token,
    input.fetchImpl,
  );
  return rowsOf(body)
    .map(quoteFromIndex)
    .filter((quote): quote is QuoteInput => quote !== null);
}

export async function fetchSsiDailyStockPrice(input: {
  token: string;
  symbol: string;
  fromDate: Date;
  toDate: Date;
  fetchImpl?: FetchLike;
}): Promise<QuoteInput[]> {
  const body = await getJson(
    ssiQuery('/Market/DailyStockPrice', {
      symbol: input.symbol,
      fromDate: formatSsiDate(input.fromDate),
      toDate: formatSsiDate(input.toDate),
      pageIndex: '1',
      pageSize: '100',
      ascending: 'true',
    }),
    input.token,
    input.fetchImpl,
  );
  return rowsOf(body)
    .map(quoteFromStock)
    .filter((quote): quote is QuoteInput => quote !== null);
}

export function formatSsiDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}
