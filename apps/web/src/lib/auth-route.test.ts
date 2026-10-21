import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  proxy: vi.fn(),
}));

vi.mock('./auth/server', () => ({ getAuth: mocks.getAuth }));

import { POST } from '../app/api/auth/[...all]/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuth.mockReturnValue({
    handler: () => ({ POST: mocks.proxy }),
  });
  mocks.proxy.mockResolvedValue(Response.json({ ok: true }));
});

describe('Neon Auth route proxy', () => {
  it('maps Next catch-all params to the path expected by Neon Auth', async () => {
    const response = await POST(
      new Request('http://localhost/api/auth/sign-in/email', { method: 'POST' }),
      { params: Promise.resolve({ all: ['sign-in', 'email'] }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.proxy).toHaveBeenCalledTimes(1);
    const [, context] = mocks.proxy.mock.calls[0] as [Request, { params: Promise<unknown> }];
    await expect(context.params).resolves.toEqual({ path: ['sign-in', 'email'] });
  });

  it('continues to reject sign-up requests without proxying them', async () => {
    const response = await POST(
      new Request('http://localhost/api/auth/sign-up/email', { method: 'POST' }),
      { params: Promise.resolve({ all: ['sign-up', 'email'] }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.proxy).not.toHaveBeenCalled();
  });
});
