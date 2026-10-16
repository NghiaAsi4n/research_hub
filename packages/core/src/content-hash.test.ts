import { describe, expect, it } from 'vitest';
import { contentHash, hashContentChunks } from './content-hash';

describe('clean content identity', () => {
  it('hashes UTF-8 content independently of stream chunk boundaries', async () => {
    const markdown = '# Điều khoản\n\nNội dung hợp đồng.';
    const bytes = new TextEncoder().encode(markdown);
    async function* chunks() {
      for (const byte of bytes) yield new Uint8Array([byte]);
    }
    expect(await hashContentChunks(chunks())).toBe(contentHash(markdown));
    expect(contentHash(markdown)).toMatch(/^[a-f0-9]{64}$/);
    expect(contentHash(`${markdown} sửa đổi`)).not.toBe(contentHash(markdown));
  });
});
