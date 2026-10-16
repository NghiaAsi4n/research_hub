import { contentHash } from '@research-hub/core/content-hash';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  register: vi.fn(),
  sources: vi.fn(),
  complete: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(),
  source: vi.fn(),
  job: vi.fn(),
  ready: vi.fn(),
  write: vi.fn(),
  read: vi.fn(),
}));
vi.mock('@research-hub/core/content-store', () => ({
  createContentStore: () => ({
    findBySource: mocks.find,
    register: mocks.register,
    sources: mocks.sources,
    completeHtmlJob: mocks.complete,
    claimHtmlJob: mocks.claim,
    releaseHtmlJob: mocks.release,
  }),
}));
vi.mock('@research-hub/core/ingest-store', () => ({
  createIngestStore: () => ({ upsertSource: mocks.source, upsertJob: mocks.job }),
}));
vi.mock('@research-hub/core/document-store', () => ({
  createDocumentStore: () => ({ markReady: mocks.ready }),
}));
vi.mock('@research-hub/core/storage', async (original) => ({
  ...(await original<typeof import('@research-hub/core/storage')>()),
  putObject: mocks.write,
}));
vi.mock('@research-hub/pipeline/read-html', () => ({ readHtml: mocks.read }));

import { ingestUrl } from './url-ingest';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockResolvedValue(null);
  mocks.source.mockImplementation(async (row: { id: string }) => ({ id: row.id }));
  mocks.register.mockResolvedValue({ id: 'doc-1', storageKey: 'doc-1', status: 'pending' });
  mocks.sources.mockResolvedValue([{ id: 'source-1', kind: 'url', url: 'https://example.com/a' }]);
  mocks.job.mockResolvedValue({ id: 'job-1' });
  mocks.claim.mockResolvedValue('lease-1');
  mocks.read.mockResolvedValue({
    kind: 'ok',
    title: 'Article',
    markdown: 'Identical clean article.',
    textLength: 24,
  });
});
const target = (path: string) => ({
  kind: 'url' as const,
  value: `https://example.com/${path}`,
  domain: 'example.com',
});

describe('URL content ingestion', () => {
  it('hashes clean content, merges another URL and skips new jobs and object writes for the duplicate', async () => {
    const first = await ingestUrl(target('a'), 'user-a');
    expect(first.status).toBe(200);
    mocks.register.mockResolvedValue({ id: 'doc-1', storageKey: 'doc-1', status: 'ready' });
    const second = await ingestUrl(target('b'), 'user-a');
    expect(await second.json()).toMatchObject({
      documentId: 'doc-1',
      duplicate: true,
      sources: expect.any(Array),
    });
    expect(mocks.register.mock.calls.map(([input]) => input.hash)).toEqual([
      contentHash('Identical clean article.'),
      contentHash('Identical clean article.'),
    ]);
    expect(mocks.job).toHaveBeenCalledTimes(1);
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(mocks.source.mock.calls[0]?.[0].id).not.toBe(mocks.source.mock.calls[1]?.[0].id);
  });
  it('reuses a known source without fetching it again', async () => {
    mocks.find.mockResolvedValue({ id: 'doc-1', storageKey: 'doc-1', status: 'ready' });
    expect((await ingestUrl(target('a'), 'user-a')).status).toBe(200);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.job).not.toHaveBeenCalled();
  });
  it('does not register documents for unreadable content', async () => {
    mocks.read.mockResolvedValue({ kind: 'unreadable', reason: 'content_requires_javascript' });
    const response = await ingestUrl(target('a'), 'user-a');
    expect(response.status).toBe(422);
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it('allows one publisher when two requests race for the same content job', async () => {
    mocks.claim.mockResolvedValueOnce('lease-1').mockResolvedValueOnce(null);
    const first = await ingestUrl(target('a'), 'user-a');
    const second = await ingestUrl(target('b'), 'user-a');
    expect(first.status).toBe(200);
    expect(second.status).toBe(202);
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(mocks.complete).toHaveBeenCalledTimes(1);
  });
  it('does not mark a document ready when its object cannot be written', async () => {
    mocks.write.mockRejectedValue(new Error('storage failure'));
    expect((await ingestUrl(target('a'), 'user-a')).status).toBe(503);
    expect(mocks.ready).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
