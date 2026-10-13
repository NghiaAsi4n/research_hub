import { describe, expect, it, vi } from 'vitest';
import {
  ALLOWED_EMBED_MODELS,
  ALLOWED_SOURCE_KINDS,
  GUARD_LIMITS,
  guardQuotaRoute,
  isModelAllowed,
  isSourceKindAllowed,
  type RateLimitOutcome,
  REFUSAL_STATUS,
} from './guard';

const allowed: RateLimitOutcome = { allowed: true };

describe('guardQuotaRoute', () => {
  it('từ chối khi thiếu phiên và không tiêu tốn hạn mức', () => {
    const consume = vi.fn(() => allowed);

    const outcome = guardQuotaRoute({
      route: 'embed',
      subject: null,
      model: 'bge-m3',
      consumeRateLimit: consume,
    });

    expect(outcome).toEqual({ allowed: false, reason: 'unauthorized', status: 401 });
    expect(consume).not.toHaveBeenCalled();
  });

  it('từ chối model ngoài allowlist trước khi chạm rate limit', () => {
    const consume = vi.fn(() => allowed);

    const outcome = guardQuotaRoute({
      route: 'embed',
      subject: 'user-1',
      model: 'gpt-5',
      consumeRateLimit: consume,
    });

    expect(outcome).toEqual({ allowed: false, reason: 'model_not_allowed', status: 400 });
    expect(consume).not.toHaveBeenCalled();
  });

  it('từ chối nguồn ngoài allowlist trước khi chạm rate limit', () => {
    const consume = vi.fn(() => allowed);

    const outcome = guardQuotaRoute({
      route: 'ingest',
      subject: 'user-1',
      sourceKind: 'archives',
      consumeRateLimit: consume,
    });

    expect(outcome).toEqual({ allowed: false, reason: 'source_not_allowed', status: 400 });
    expect(consume).not.toHaveBeenCalled();
  });

  it('trả 429 kèm số giây chờ khi vượt hạn mức', () => {
    const outcome = guardQuotaRoute({
      route: 'embed',
      subject: 'user-1',
      consumeRateLimit: () => ({ allowed: false, retryAfterSeconds: 7 }),
    });

    expect(outcome).toEqual({
      allowed: false,
      reason: 'rate_limited',
      status: 429,
      retryAfterSeconds: 7,
    });
  });

  it('đếm hạn mức theo từng người dùng và theo từng route', () => {
    const consume = vi.fn(() => allowed);

    guardQuotaRoute({ route: 'ingest', subject: 'user-9', consumeRateLimit: consume });

    expect(consume).toHaveBeenCalledWith(
      'ingest:user-9',
      GUARD_LIMITS.ingest.limit,
      GUARD_LIMITS.ingest.windowMs,
    );
  });

  it('cho qua khi phiên hợp lệ, model và nguồn đều trong allowlist', () => {
    const outcome = guardQuotaRoute({
      route: 'embed',
      subject: 'user-1',
      model: 'bge-m3',
      consumeRateLimit: () => allowed,
    });

    expect(outcome).toEqual({
      allowed: true,
      subject: 'user-1',
      key: 'embed:user-1',
      limit: GUARD_LIMITS.embed,
    });
  });

  it('không kiểm allowlist khi route không khai model hoặc nguồn', () => {
    const outcome = guardQuotaRoute({
      route: 'ingest',
      subject: 'user-1',
      consumeRateLimit: () => allowed,
    });

    expect(outcome.allowed).toBe(true);
  });
});

describe('allowlist', () => {
  it('chỉ cho model nhúng đã pull ở Giai đoạn 0', () => {
    expect(ALLOWED_EMBED_MODELS).toEqual(['bge-m3']);
    expect(isModelAllowed('bge-m3')).toBe(true);
    expect(isModelAllowed('gemma4:31b')).toBe(false);
  });

  it('chỉ cho documents và media làm loại nguồn', () => {
    expect(ALLOWED_SOURCE_KINDS).toEqual(['documents', 'media']);
    expect(isSourceKindAllowed('media')).toBe(true);
    expect(isSourceKindAllowed('tmp')).toBe(false);
  });
});

describe('cấu hình dùng chung', () => {
  it('ngưỡng hạn mức khai một chỗ cho cả hai route', () => {
    expect(GUARD_LIMITS).toEqual({
      embed: { limit: 20, windowMs: 60_000 },
      ingest: { limit: 30, windowMs: 60_000 },
    });
  });

  it('mỗi lý do từ chối đi kèm một mã trạng thái', () => {
    expect(REFUSAL_STATUS).toEqual({
      unauthorized: 401,
      rate_limited: 429,
      model_not_allowed: 400,
      source_not_allowed: 400,
    });
  });
});
