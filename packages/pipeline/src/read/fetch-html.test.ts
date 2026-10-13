import { describe, expect, it } from 'vitest';
import { fetchHtml, MAX_HTML_BYTES, USER_AGENT } from './fetch-html';

function htmlResponse(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });
}

describe('fetchHtml', () => {
  it('User-Agent chỉ chứa ký tự ASCII để fetch không từ chối header', () => {
    // HTTP header nhận ByteString (Latin-1): một ký tự ngoài ASCII làm fetch ném lỗi ngay, mà
    // fetch giả trong test thì không kiểm tra giúp.
    expect(USER_AGENT).toMatch(/^[\x20-\x7e]+$/);
  });

  it('trả HTML khi nguồn đúng loại nội dung', async () => {
    const result = await fetchHtml('https://example.com/bai', {
      fetchImpl: async () => htmlResponse('<p>xin chào</p>'),
    });
    expect(result).toMatchObject({ kind: 'ok', html: '<p>xin chào</p>', status: 200 });
  });

  it('gửi User-Agent tự nhận diện', async () => {
    const seen: Array<Record<string, unknown>> = [];
    await fetchHtml('https://example.com/bai', {
      fetchImpl: async (_url, init) => {
        seen.push({ headers: init?.headers ?? null, redirect: init?.redirect ?? null });
        return htmlResponse('<p>x</p>');
      },
    });
    expect(seen[0]).toMatchObject({
      headers: { 'user-agent': USER_AGENT },
      redirect: 'follow',
    });
  });

  it('từ chối loại nội dung không phải HTML', async () => {
    const result = await fetchHtml('https://example.com/tai-lieu.pdf', {
      fetchImpl: async () => htmlResponse('%PDF-1.7', { 'content-type': 'application/pdf' }),
    });
    expect(result).toMatchObject({ kind: 'error', reason: 'not_html' });
  });

  it('dừng khi vượt giới hạn dung lượng thay vì nạp cả trang', async () => {
    const result = await fetchHtml('https://example.com/lon', {
      fetchImpl: async () => htmlResponse('a'.repeat(MAX_HTML_BYTES)),
      maxBytes: 1024,
    });
    expect(result).toMatchObject({ kind: 'error', reason: 'too_large' });
  });

  it('tách lỗi HTTP khỏi lỗi mạng', async () => {
    const httpError = await fetchHtml('https://example.com/mat', {
      fetchImpl: async () => new Response('không có', { status: 404 }),
    });
    expect(httpError).toMatchObject({ kind: 'error', reason: 'http_error', status: 404 });

    const timedOut = await fetchHtml('https://example.com/cham', {
      fetchImpl: async () => {
        throw Object.assign(new Error('hết giờ'), { name: 'TimeoutError' });
      },
    });
    expect(timedOut).toMatchObject({ kind: 'error', reason: 'timeout' });
  });
});
