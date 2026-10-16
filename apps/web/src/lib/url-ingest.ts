import { contentHash } from '@research-hub/core/content-hash';
import { createContentStore } from '@research-hub/core/content-store';
import { createDocumentStore } from '@research-hub/core/document-store';
import { type IngestTarget, sourceId, sourceObjectName } from '@research-hub/core/ingest';
import { createIngestStore } from '@research-hub/core/ingest-store';
import { buildStorageKey, markdownKeyFor, putObject } from '@research-hub/core/storage';
import { readHtml } from '@research-hub/pipeline/read-html';

export async function ingestUrl(
  target: Extract<IngestTarget, { kind: 'url' }>,
  subject: string,
): Promise<Response> {
  const started = Date.now();
  const content = createContentStore();
  const store = createIngestStore();
  const source = await store.upsertSource({
    id: sourceId(target),
    kind: 'url',
    url: target.value,
    domain: target.domain,
  });
  const existing = await content.findBySource(source.id);
  if (existing?.status === 'ready') {
    return Response.json({
      documentId: existing.id,
      sourceId: source.id,
      state: 'done',
      duplicate: true,
      sources: await content.sources(existing.id),
    });
  }
  const article = await readHtml(target.value);
  if (article.kind !== 'ok') {
    return Response.json(
      { state: article.kind === 'unreadable' ? 'unreadable' : 'failed', reason: article.reason },
      { status: 422 },
    );
  }
  const hash = contentHash(article.markdown);
  const document = await content.register({
    sourceId: source.id,
    title: article.title,
    hash,
    storageKey: buildStorageKey('documents', sourceObjectName(target)),
  });
  if (document.status === 'ready') {
    return Response.json({
      sourceId: source.id,
      documentId: document.id,
      state: 'done',
      duplicate: true,
      sources: await content.sources(document.id),
    });
  }
  const job = await store.upsertJob({
    type: 'ingest',
    state: 'queued',
    idemKey: `ingest:content:${hash}`,
    payload: { documentId: document.id, sourceId: source.id, url: target.value, subject },
  });
  const leaseOwner = await content.claimHtmlJob(job.id);
  if (!leaseOwner) {
    return Response.json(
      {
        sourceId: source.id,
        documentId: document.id,
        jobId: job.id,
        state: 'pending',
        duplicate: true,
        sources: await content.sources(document.id),
      },
      { status: 202 },
    );
  }
  try {
    await putObject(
      markdownKeyFor(document.storageKey),
      article.markdown,
      'text/markdown; charset=utf-8',
    );
    await createDocumentStore().markReady({
      id: document.id,
      bytes: new TextEncoder().encode(article.markdown).byteLength,
      meta: { readMs: Date.now() - started, textLength: article.textLength },
    });
  } catch {
    await content.releaseHtmlJob(job.id, leaseOwner);
    return Response.json(
      { error: 'content_publish_failed', documentId: document.id },
      { status: 503 },
    );
  }
  await content.completeHtmlJob(job.id, leaseOwner);
  return Response.json({
    sourceId: source.id,
    documentId: document.id,
    jobId: job.id,
    state: 'done',
    duplicate: false,
    sources: await content.sources(document.id),
  });
}
