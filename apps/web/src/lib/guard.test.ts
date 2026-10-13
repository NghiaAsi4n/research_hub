import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock('./auth/server', () => ({ getSession: getSessionMock }));

import { guardRequest } from './guard';
import { resetRateLimits } from './rate-limit';

const signedIn = { user: { id: 'user-1', email: 'user@example.com' } };

beforeEach(() => {
  resetRateLimits();
  getSessionMock.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('guardRequest', () => {
  it('từ chối khi thiếu phiên và không làm cạn hạn mức của lượt hợp lệ sau đó', async () => {
    getSessionMock.mockResolvedValue(null);

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const result = await guardRequest({ route: 'embed', model: 'bge-m3' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(401);
        await expect(result.response.json()).resolves.toMatchObject({ error: 'unauthorized' });
      }
    }

    getSessionMock.mockResolvedValue(signedIn);
    await expect(guardRequest({ route: 'embed', model: 'bge-m3' })).resolves.toEqual({
      ok: true,
      subject: 'user-1',
    });
  });

  it('chặn lượt thứ 21 trong cửa sổ 60 giây của route embed', async () => {
    getSessionMock.mockResolvedValue(signedIn);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await guardRequest({ route: 'embed', model: 'bge-m3' });
      expect(result.ok).toBe(true);
    }

    const blocked = await guardRequest({ route: 'embed', model: 'bge-m3' });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.response.status).toBe(429);
      expect(blocked.response.headers.get('retry-after')).toBeTruthy();
      await expect(blocked.response.json()).resolves.toMatchObject({ error: 'rate_limited' });
    }
  });

  it('từ chối model ngoài allowlist bằng 400 và không tiêu tốn hạn mức', async () => {
    getSessionMock.mockResolvedValue(signedIn);

    const refused = await guardRequest({ route: 'embed', model: 'gpt-5' });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.response.status).toBe(400);
      await expect(refused.response.json()).resolves.toMatchObject({ error: 'model_not_allowed' });
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect((await guardRequest({ route: 'embed', model: 'bge-m3' })).ok).toBe(true);
    }
  });

  it('từ chối loại nguồn ngoài allowlist bằng 400', async () => {
    getSessionMock.mockResolvedValue(signedIn);

    const refused = await guardRequest({ route: 'ingest', sourceKind: 'archives' });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.response.status).toBe(400);
      await expect(refused.response.json()).resolves.toMatchObject({ error: 'source_not_allowed' });
    }
  });

  it('đếm hạn mức riêng theo từng người dùng', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'user-1' } });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await guardRequest({ route: 'ingest' });
    }
    expect((await guardRequest({ route: 'ingest' })).ok).toBe(false);

    getSessionMock.mockResolvedValue({ user: { id: 'user-2' } });
    expect((await guardRequest({ route: 'ingest' })).ok).toBe(true);
  });

  it('ghi lại lý do từ chối để đối chiếu sau này', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getSessionMock.mockResolvedValue(signedIn);

    await guardRequest({ route: 'embed', model: 'gpt-5' });

    expect(warn).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(warn.mock.calls[0]?.[0])) as {
      event: string;
      route: string;
      reason: string;
    };
    expect(payload).toMatchObject({
      event: 'guard_refusal',
      route: 'embed',
      reason: 'model_not_allowed',
    });
  });
});
