import { describe, expect, it } from 'vitest';
import {
  deterministicUuid,
  documentHash,
  fileSourceValue,
  type IngestTarget,
  ingestIdemKey,
  normalizeSourceUrl,
  parseIngestRequest,
  sourceId,
  sourceObjectName,
} from './ingest';

const fileTarget: IngestTarget = {
  kind: 'file',
  value: fileSourceValue('Hop dong.pdf'),
  filename: 'Hop dong.pdf',
  contentType: 'application/pdf',
};

describe('normalizeSourceUrl', () => {
  it('bỏ tham số đo đếm, fragment và dấu gạch chéo cuối', () => {
    expect(
      normalizeSourceUrl('https://Example.com/bai-viet/?utm_source=fb&utm_medium=x#phan-2'),
    ).toEqual({ value: 'https://example.com/bai-viet', domain: 'example.com' });
  });

  it('giữ tham số thật vì nhiều trang đặt nội dung trong query', () => {
    expect(normalizeSourceUrl('https://example.com/doc?id=42')?.value).toBe(
      'https://example.com/doc?id=42',
    );
  });

  it('từ chối giao thức không phải http(s)', () => {
    expect(normalizeSourceUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeSourceUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeSourceUrl('khong-phai-url')).toBeNull();
  });
});

describe('parseIngestRequest', () => {
  it('nhận nguồn là URL và chuẩn hoá luôn', () => {
    const parsed = parseIngestRequest({ sourceUrl: 'https://example.com/a/?utm_campaign=x' });
    expect(parsed).toEqual({
      ok: true,
      target: { kind: 'url', value: 'https://example.com/a', domain: 'example.com' },
    });
  });

  it('nhận nguồn là file kèm content type', () => {
    const parsed = parseIngestRequest({ filename: 'Hop dong.pdf', contentType: 'application/pdf' });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.target).toMatchObject({
        kind: 'file',
        value: 'file://Hop dong.pdf',
        filename: 'Hop dong.pdf',
      });
    }
  });

  it('từ chối khi thiếu cả URL lẫn tên file', () => {
    expect(parseIngestRequest({})).toMatchObject({ ok: false, error: 'invalid_filename' });
    expect(parseIngestRequest({ filename: 'x.pdf' })).toMatchObject({
      ok: false,
      error: 'invalid_content_type',
    });
  });

  it('từ chối tên file quá dài và hash sai định dạng', () => {
    const longName = `${'a'.repeat(201)}.pdf`;
    expect(
      parseIngestRequest({ filename: longName, contentType: 'application/pdf' }),
    ).toMatchObject({ ok: false, error: 'invalid_filename' });
    expect(
      parseIngestRequest({ filename: 'x.pdf', contentType: 'application/pdf', contentHash: 'abc' }),
    ).toMatchObject({ ok: false, error: 'invalid_content_hash' });
  });

  it('dùng contentHash của client để phân biệt hai file trùng tên', () => {
    const hash = 'a'.repeat(64);
    const parsed = parseIngestRequest({
      filename: 'scan.pdf',
      contentType: 'application/pdf',
      contentHash: hash,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.target.value).toBe(`file://scan.pdf#sha256:${hash}`);
      expect(sourceId(parsed.target)).not.toBe(sourceId(fileTarget));
    }
  });
});

describe('danh tính nguồn', () => {
  it('gọi lại cùng một file cho ra cùng source id, hash và idem key', () => {
    const again: IngestTarget = { ...fileTarget };
    expect(sourceId(again)).toBe(sourceId(fileTarget));
    expect(documentHash(again)).toBe(documentHash(fileTarget));
    expect(ingestIdemKey(again)).toBe(ingestIdemKey(fileTarget));
  });

  it('hai nguồn khác nhau cho ra idem key khác nhau', () => {
    const other: IngestTarget = {
      kind: 'file',
      value: fileSourceValue('Hop dong 2.pdf'),
      filename: 'Hop dong 2.pdf',
      contentType: 'application/pdf',
    };
    expect(ingestIdemKey(other)).not.toBe(ingestIdemKey(fileTarget));
  });

  it('nguồn cùng nội dung khác đường dẫn vẫn là hai nguồn ở T3, gộp lại ở T9', () => {
    const a = parseIngestRequest({ sourceUrl: 'https://a.example/bai' });
    const b = parseIngestRequest({ sourceUrl: 'https://b.example/bai' });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(documentHash(a.target)).not.toBe(documentHash(b.target));
    }
  });

  it('idem key nhúng hash nội dung để đối chiếu với jobs.idem_key', () => {
    expect(ingestIdemKey(fileTarget)).toBe(`ingest:${documentHash(fileTarget)}`);
  });
});

describe('deterministicUuid', () => {
  it('trả về UUID hợp lệ, ổn định và khác nhau theo đầu vào', () => {
    const value = deterministicUuid('file|file://Hop dong.pdf');
    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(deterministicUuid('file|file://Hop dong.pdf')).toBe(value);
    expect(deterministicUuid('file|file://Hop dong 2.pdf')).not.toBe(value);
  });
});

describe('sourceObjectName', () => {
  it('lấy đoạn cuối đường dẫn của URL làm tên object', () => {
    expect(
      sourceObjectName({
        kind: 'url',
        value: 'https://example.com/a/bai-viet',
        domain: 'example.com',
      }),
    ).toBe('bai-viet');
  });

  it('dùng tên file gốc khi nguồn là file', () => {
    expect(sourceObjectName(fileTarget)).toBe('Hop dong.pdf');
  });
});
