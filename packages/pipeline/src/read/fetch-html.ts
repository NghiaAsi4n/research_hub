// Tải HTML bằng HTTP cho fetcher T4.
//
// Plan mục 8 yêu cầu: timeout rõ ràng, giới hạn dung lượng, User-Agent tự nhận diện và từ chối loại
// nội dung không phải HTML. `fetchImpl` là tham số để test được bằng Response giả, không cần mạng.

export const FETCH_TIMEOUT_MS = 20_000;
export const MAX_HTML_BYTES = 3 * 1024 * 1024;
// User-Agent phải thuần ASCII: HTTP header chỉ nhận ByteString (Latin-1), nên một ký tự tiếng Việt
// ở đây làm `fetch` từ chối ngay với lỗi "Cannot convert argument to a ByteString".
export const USER_AGENT =
  'ResearchHubBot/0.1 (+https://github.com/NghiaAsi4n/research_hub; personal archive)';

const HTML_CONTENT_TYPES = ['text/html', 'application/xhtml+xml'];

export type FetchHtmlResult =
  | { kind: 'ok'; html: string; contentType: string; status: number }
  | {
      kind: 'error';
      reason: 'http_error' | 'not_html' | 'too_large' | 'timeout' | 'network';
      detail: string;
      status?: number;
    };

function isHtmlContentType(value: string): boolean {
  const lowered = value.toLowerCase();
  return HTML_CONTENT_TYPES.some((allowed) => lowered.startsWith(allowed));
}

// Đọc có trần: dừng ngay khi vượt giới hạn thay vì nạp cả trang lớn vào bộ nhớ function.
async function readBounded(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string | null> {
  if (body === null) {
    return '';
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function fetchHtml(
  url: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number; maxBytes?: number } = {},
): Promise<FetchHtmlResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_HTML_BYTES;

  let response: Response;
  try {
    response = await doFetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
      },
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const detail = error instanceof Error ? error.message : String(error);
    if (name === 'TimeoutError' || name === 'AbortError') {
      return { kind: 'error', reason: 'timeout', detail: `quá ${timeoutMs}ms` };
    }
    return { kind: 'error', reason: 'network', detail };
  }

  if (!response.ok) {
    return {
      kind: 'error',
      reason: 'http_error',
      detail: `HTTP ${response.status}`,
      status: response.status,
    };
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!isHtmlContentType(contentType)) {
    return {
      kind: 'error',
      reason: 'not_html',
      detail: contentType === '' ? 'thiếu content-type' : contentType,
      status: response.status,
    };
  }

  const html = await readBounded(response.body, maxBytes);
  if (html === null) {
    return {
      kind: 'error',
      reason: 'too_large',
      detail: `vượt ${maxBytes} byte`,
      status: response.status,
    };
  }

  return { kind: 'ok', html, contentType, status: response.status };
}
