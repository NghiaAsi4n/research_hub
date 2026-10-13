import { describe, expect, it } from 'vitest';
import { envIssues, isLocalOllamaEndpoint, loadEnv, resolveOllamaBaseUrl } from './env';

// Cấu hình tối thiểu hợp lệ: sáu biến bắt buộc của Giai đoạn 0.
const base = {
  DATABASE_URL: 'postgresql://user:pass@host/db',
  OLLAMA_API_KEY: 'ollama-key',
  CLOUDFLARE_API_TOKEN: 'cf-token',
  NEON_AUTH_BASE_URL: 'https://auth.example.com',
  NEON_AUTH_COOKIE_SECRET: 'x'.repeat(32),
  CRON_SECRET: 'y'.repeat(16),
};

const withoutDatabaseUrl = {
  OLLAMA_API_KEY: base.OLLAMA_API_KEY,
  CLOUDFLARE_API_TOKEN: base.CLOUDFLARE_API_TOKEN,
  NEON_AUTH_BASE_URL: base.NEON_AUTH_BASE_URL,
  NEON_AUTH_COOKIE_SECRET: base.NEON_AUTH_COOKIE_SECRET,
  CRON_SECRET: base.CRON_SECRET,
};

describe('loadEnv', () => {
  it('nhận cấu hình tối thiểu và để trống các khoá Giai đoạn 6', () => {
    const env = loadEnv(base as NodeJS.ProcessEnv);
    expect(env.DATABASE_URL).toBe(base.DATABASE_URL);
    expect(env.SLACK_WEBHOOK_URL).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it('báo lỗi khi thiếu khoá bắt buộc', () => {
    expect(() => loadEnv(withoutDatabaseUrl as NodeJS.ProcessEnv)).toThrowError(/DATABASE_URL/);
  });

  it('từ chối cookie secret ngắn hơn 32 ký tự', () => {
    expect(() =>
      loadEnv({ ...base, NEON_AUTH_COOKIE_SECRET: 'qua-ngan' } as NodeJS.ProcessEnv),
    ).toThrowError(/NEON_AUTH_COOKIE_SECRET/);
  });

  it('đọc được credential Object Storage theo tên chuẩn AWS', () => {
    const env = loadEnv({
      ...base,
      AWS_ENDPOINT_URL_S3: 'https://s3.example.com',
      AWS_REGION: 'aws-ap-southeast-1',
      OBJECT_STORAGE_BUCKET: 'research-hub-media',
    } as NodeJS.ProcessEnv);
    expect(env.OBJECT_STORAGE_BUCKET).toBe('research-hub-media');
    expect(env.AWS_REGION).toBe('aws-ap-southeast-1');
  });
});

describe('envIssues', () => {
  it('rỗng khi cấu hình hợp lệ', () => {
    expect(envIssues(base as NodeJS.ProcessEnv)).toEqual([]);
  });

  it('nêu tên biến còn thiếu', () => {
    expect(envIssues(withoutDatabaseUrl as NodeJS.ProcessEnv)).toEqual(['DATABASE_URL']);
  });

  it('nêu tên biến sai định dạng', () => {
    expect(
      envIssues({ ...base, NEON_AUTH_COOKIE_SECRET: 'qua-ngan' } as NodeJS.ProcessEnv),
    ).toEqual(['NEON_AUTH_COOKIE_SECRET']);
  });
});

describe('resolveOllamaBaseUrl', () => {
  it('mặc định về Ollama cục bộ khi bỏ trống', () => {
    expect(resolveOllamaBaseUrl(undefined)).toBe('http://127.0.0.1:11434');
    expect(resolveOllamaBaseUrl('   ')).toBe('http://127.0.0.1:11434');
  });

  it('giữ endpoint cloud và bỏ dấu gạch chéo cuối', () => {
    expect(resolveOllamaBaseUrl('https://ollama.com/')).toBe('https://ollama.com');
    expect(resolveOllamaBaseUrl(' http://127.0.0.1:11434 ')).toBe('http://127.0.0.1:11434');
  });

  it('phân biệt endpoint cục bộ với cloud', () => {
    expect(isLocalOllamaEndpoint('http://127.0.0.1:11434')).toBe(true);
    expect(isLocalOllamaEndpoint('http://localhost:11434')).toBe(true);
    expect(isLocalOllamaEndpoint('https://ollama.com')).toBe(false);
  });
});
