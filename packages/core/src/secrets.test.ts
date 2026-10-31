import { describe, expect, it } from 'vitest';
import { assertNoSecrets, containsSecret, findSecretKinds, redactSecrets } from './secrets';

describe('nhận diện khoá bí mật', () => {
  it('nhận đúng loại khoá mẫu', () => {
    expect(findSecretKinds('sk-abcdefghijklmnopqrstuvwxyz0123456789')).toEqual(['openai_key']);
    expect(findSecretKinds('AIzaSyA1234567890abcdefghijklmnopqrstu')).toEqual(['google_api_key']);
    expect(findSecretKinds(`ghp_${'a'.repeat(36)}`)).toEqual(['github_token']);
    expect(findSecretKinds('xoxb-1234567890-abcdefghijk')).toEqual(['slack_token']);
    expect(findSecretKinds(`123456789:${'A'.repeat(35)}`)).toEqual(['telegram_bot_token']);
    expect(findSecretKinds('AKIAABCDEFGHIJKLMNOP')).toEqual(['aws_access_key']);
    expect(findSecretKinds('postgresql://user:matkhau@db.example.com/neondb')).toEqual([
      'database_url_with_password',
    ]);
  });

  it('không báo nhầm văn bản thường', () => {
    expect(
      containsSecret('Điều 183 Luật Doanh nghiệp 2020 quy định về doanh nghiệp tư nhân.'),
    ).toBe(false);
    expect(containsSecret('https://vbpl.vn/van-ban/chi-tiet?id=123')).toBe(false);
    expect(containsSecret('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('chặn ghi và che giá trị khi cần log', () => {
    const text = `token sk-abcdefghijklmnopqrstuvwxyz0123456789 hết`;

    expect(() => assertNoSecrets(text, 'run_steps')).toThrow(/run_steps.*openai_key/);
    try {
      assertNoSecrets(text, 'run_steps');
    } catch (error) {
      expect(String(error)).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
    }

    const redacted = redactSecrets(text);
    expect(redacted).toContain('[redacted:openai_key]');
    expect(redacted).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
  });
});
