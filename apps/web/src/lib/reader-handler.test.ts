import type { ReaderStore } from '@research-hub/core/reader-store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { guard } = vi.hoisted(() => ({ guard: vi.fn() }));
vi.mock('./guard', () => ({ guardRequest: guard }));

import { createReaderHandler } from './reader-handler';

const id = '00000000-0000-4000-8000-000000000001';
const store = {
  get: vi.fn(),
  list: vi.fn(),
  saveProgress: vi.fn(),
  addHighlight: vi.fn(),
  removeHighlight: vi.fn(),
} satisfies ReaderStore;
beforeEach(() => {
  vi.clearAllMocks();
  guard.mockResolvedValue({ ok: true, subject: 'reader-a' });
  store.get.mockResolvedValue({
    id,
    title: 'Document',
    status: 'ready',
    storageKey: 'private/key',
    highlights: [],
    progress: null,
    sources: [],
    pages: null,
  });
});
const request = (method: string, body?: unknown) =>
  new Request(`http://localhost/api/documents/${id}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe('reader boundary', () => {
  it('rejects an unauthenticated request before database access', async () => {
    guard.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    expect((await createReaderHandler(store)(request('GET'), id)).status).toBe(401);
    expect(store.get).not.toHaveBeenCalled();
  });
  it('reads only the session user state and omits internal storage keys', async () => {
    const response = await createReaderHandler(store)(request('GET'), id);
    expect(store.get).toHaveBeenCalledWith(id, 'reader-a');
    expect(await response.json()).not.toHaveProperty('storageKey');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('rejects invalid offsets and forged user identity', async () => {
    const response = await createReaderHandler(store)(
      request('POST', { startOffset: 4, endOffset: 1, quote: 'x', userId: 'reader-b' }),
      id,
    );
    expect(response.status).toBe(400);
    expect(store.addHighlight).not.toHaveBeenCalled();
  });
  it('persists a position against the resolved canonical document and authenticated user', async () => {
    const response = await createReaderHandler(store)(
      request('PATCH', { section: 'section-40', ratio: 0.65 }),
      id,
    );
    expect(response.status).toBe(204);
    expect(store.saveProgress).toHaveBeenCalledWith(id, 'reader-a', {
      section: 'section-40',
      ratio: 0.65,
    });
  });
  it('rejects cross-origin mutation and unavailable documents', async () => {
    const foreign = new Request(`http://localhost/api/documents/${id}`, {
      method: 'PATCH',
      headers: { origin: 'https://example.net' },
      body: '{}',
    });
    expect((await createReaderHandler(store)(foreign, id)).status).toBe(403);
    store.get.mockResolvedValue(null);
    expect((await createReaderHandler(store)(request('GET'), id)).status).toBe(404);
  });
});
