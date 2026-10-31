import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { getDb } from './db/client';
import { ollamaQueueRequests, ollamaSlots } from './db/schema';

export type OllamaQueueLane = 'chat' | 'research';
export type OllamaQueueOptions = { signal?: AbortSignal; timeoutMs?: number };
export type OllamaQueueRelease = () => void | Promise<void>;

export interface OllamaQueueClient {
  acquire(lane: OllamaQueueLane, options?: OllamaQueueOptions): Promise<OllamaQueueRelease>;
  run<T>(
    lane: OllamaQueueLane,
    task: (signal: AbortSignal) => Promise<T>,
    options?: OllamaQueueOptions,
  ): Promise<T>;
}

type WaitingRequest = {
  lane: OllamaQueueLane;
  resolve: (release: OllamaQueueRelease) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  timer?: ReturnType<typeof setTimeout>;
  abort?: () => void;
};

const DEFAULT_QUEUE_TIMEOUT_MS = 60_000;
const DEFAULT_CALL_TIMEOUT_MS = 180_000;
const DEFAULT_DISTRIBUTED_LEASE_MS = 240_000;
const DISTRIBUTED_POLL_MS = 100;

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

function abortError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : namedError('AbortError', 'Ollama request was aborted');
}

async function safeRelease(release: OllamaQueueRelease): Promise<void> {
  try {
    await release();
  } catch {
    console.warn(JSON.stringify({ event: 'ollama_queue_release_failed' }));
  }
}

async function runQueued<T>(
  queue: Pick<OllamaQueueClient, 'acquire'>,
  lane: OllamaQueueLane,
  task: (signal: AbortSignal) => Promise<T>,
  options: OllamaQueueOptions = {},
): Promise<T> {
  const release = await queue.acquire(lane, options);
  const controller = new AbortController();
  const signal = options.signal;
  if (signal?.aborted) {
    await safeRelease(release);
    throw abortError(signal);
  }
  const relayAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', relayAbort, { once: true });

  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectTimeout: ((error: Error) => void) | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    rejectTimeout = reject;
  });
  timer = setTimeout(
    () => {
      timedOut = true;
      controller.abort();
      rejectTimeout?.(namedError('TimeoutError', 'Ollama request timed out'));
    },
    Math.max(1, options.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS),
  );

  let abortListener: (() => void) | undefined;
  const aborted = signal
    ? new Promise<never>((_resolve, reject) => {
        if (signal.aborted) {
          controller.abort(signal.reason);
          reject(abortError(signal));
          return;
        }
        abortListener = () => reject(abortError(signal));
        signal.addEventListener('abort', abortListener, { once: true });
      })
    : new Promise<never>(() => {});

  const work = Promise.resolve().then(() => {
    if (controller.signal.aborted) throw abortError(signal);
    return task(controller.signal);
  });
  try {
    return await Promise.race([work, timeout, aborted]);
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', relayAbort);
    if (abortListener) signal?.removeEventListener('abort', abortListener);
    if (timedOut || signal?.aborted) {
      void work.then(
        () => safeRelease(release),
        () => safeRelease(release),
      );
    } else {
      try {
        await release();
      } catch {
        console.warn(JSON.stringify({ event: 'ollama_queue_release_failed' }));
      }
    }
  }
}

export class OllamaQueue implements OllamaQueueClient {
  private readonly waiting: Record<OllamaQueueLane, WaitingRequest[]> = {
    chat: [],
    research: [],
  };
  private active = false;
  private lastLane: OllamaQueueLane = 'research';

  acquire(lane: OllamaQueueLane, options: OllamaQueueOptions = {}): Promise<OllamaQueueRelease> {
    if (options.signal?.aborted) return Promise.reject(abortError(options.signal));

    return new Promise((resolve, reject) => {
      const request: WaitingRequest = { lane, resolve, reject, signal: options.signal };
      const queue = this.waiting[lane];
      const remove = (error: Error) => {
        const index = queue.indexOf(request);
        if (index < 0) return;
        queue.splice(index, 1);
        if (request.timer) clearTimeout(request.timer);
        if (request.abort) options.signal?.removeEventListener('abort', request.abort);
        reject(error);
        this.dispatch();
      };

      request.abort = () => remove(abortError(options.signal));
      options.signal?.addEventListener('abort', request.abort, { once: true });
      request.timer = setTimeout(
        () => remove(namedError('TimeoutError', 'Timed out waiting for an Ollama slot')),
        Math.max(1, options.timeoutMs ?? DEFAULT_QUEUE_TIMEOUT_MS),
      );
      queue.push(request);
      this.dispatch();
    });
  }

  run<T>(
    lane: OllamaQueueLane,
    task: (signal: AbortSignal) => Promise<T>,
    options: OllamaQueueOptions = {},
  ): Promise<T> {
    return runQueued(this, lane, task, options);
  }

  private dispatch(): void {
    if (this.active) return;
    const nextLane: OllamaQueueLane = this.lastLane === 'chat' ? 'research' : 'chat';
    const lane =
      this.waiting[nextLane].length > 0 ? nextLane : nextLane === 'chat' ? 'research' : 'chat';
    const request = this.waiting[lane].shift();
    if (!request) return;

    if (request.timer) clearTimeout(request.timer);
    if (request.abort) request.signal?.removeEventListener('abort', request.abort);
    if (request.signal?.aborted) {
      request.reject(abortError(request.signal));
      this.dispatch();
      return;
    }

    this.active = true;
    this.lastLane = lane;
    let released = false;
    request.resolve(() => {
      if (released) return;
      released = true;
      this.active = false;
      this.dispatch();
    });
  }
}

export class PostgresOllamaQueue implements OllamaQueueClient {
  private db?: Db;
  private readonly leaseMs: number;
  private readonly pollMs: number;

  constructor(options: { db?: Db; leaseMs?: number; pollMs?: number } = {}) {
    this.db = options.db;
    this.leaseMs = options.leaseMs ?? DEFAULT_DISTRIBUTED_LEASE_MS;
    this.pollMs = options.pollMs ?? DISTRIBUTED_POLL_MS;
  }

  async acquire(
    lane: OllamaQueueLane,
    options: OllamaQueueOptions = {},
  ): Promise<OllamaQueueRelease> {
    if (!this.db) this.db = getDb();
    const db = this.db;
    const signal = options.signal;
    if (signal?.aborted) throw abortError(signal);

    const requestId = crypto.randomUUID();
    const owner = crypto.randomUUID();
    const now = Date.now();
    const deadlineAt = new Date(now + Math.max(1, options.timeoutMs ?? DEFAULT_QUEUE_TIMEOUT_MS));
    await db.insert(ollamaQueueRequests).values({ id: requestId, lane, deadlineAt });

    try {
      while (Date.now() < deadlineAt.getTime()) {
        if (signal?.aborted) throw abortError(signal);
        const instant = new Date();
        await db
          .delete(ollamaQueueRequests)
          .where(
            or(
              and(
                eq(ollamaQueueRequests.status, 'waiting'),
                lte(ollamaQueueRequests.deadlineAt, instant),
              ),
              and(
                eq(ollamaQueueRequests.status, 'running'),
                lte(ollamaQueueRequests.leaseExpiresAt, instant),
              ),
            ),
          );
        const candidateResult = await db.execute(sql`
          SELECT request.id, request.lane
          FROM ${ollamaQueueRequests} AS request
          CROSS JOIN ${ollamaSlots} AS slot
          WHERE request.status = 'waiting' AND slot.slot_name = 'ollama'
          ORDER BY CASE WHEN request.lane <> slot.last_lane THEN 0 ELSE 1 END, request.seq
          LIMIT 1
        `);
        const candidate = candidateResult.rows[0] as
          | { id: string; lane: OllamaQueueLane }
          | undefined;
        if (candidate?.id !== requestId) {
          await pause(Math.min(this.pollMs, deadlineAt.getTime() - Date.now()), signal);
          continue;
        }

        const leaseExpiresAt = new Date(instant.getTime() + this.leaseMs);
        const [claimedSlot] = await db
          .update(ollamaSlots)
          .set({
            requestId,
            leaseOwner: owner,
            leaseExpiresAt,
            lastLane: lane,
          })
          .where(
            and(
              eq(ollamaSlots.slotName, 'ollama'),
              or(isNull(ollamaSlots.leaseExpiresAt), lte(ollamaSlots.leaseExpiresAt, instant)),
            ),
          )
          .returning({ slotName: ollamaSlots.slotName });
        if (!claimedSlot) {
          await pause(Math.min(this.pollMs, deadlineAt.getTime() - Date.now()), signal);
          continue;
        }

        const [claimedRequest] = await db
          .update(ollamaQueueRequests)
          .set({
            status: 'running',
            leaseOwner: owner,
            leaseExpiresAt,
          })
          .where(
            and(eq(ollamaQueueRequests.id, requestId), eq(ollamaQueueRequests.status, 'waiting')),
          )
          .returning({ id: ollamaQueueRequests.id });
        if (claimedRequest) {
          let released = false;
          return async () => {
            if (released) return;
            released = true;
            await db.execute(sql`
              WITH slot_release AS (
                UPDATE ${ollamaSlots}
                SET request_id = NULL, lease_owner = NULL, lease_expires_at = NULL
                WHERE slot_name = 'ollama' AND request_id = ${requestId} AND lease_owner = ${owner}
                RETURNING slot_name
              )
              DELETE FROM ${ollamaQueueRequests}
              WHERE id = ${requestId} AND lease_owner = ${owner}
            `);
          };
        }
        await db
          .update(ollamaSlots)
          .set({ requestId: null, leaseOwner: null, leaseExpiresAt: null })
          .where(
            and(
              eq(ollamaSlots.slotName, 'ollama'),
              eq(ollamaSlots.requestId, requestId),
              eq(ollamaSlots.leaseOwner, owner),
            ),
          );
        await pause(Math.min(this.pollMs, deadlineAt.getTime() - Date.now()), signal);
      }
      throw namedError('TimeoutError', 'Timed out waiting for an Ollama slot');
    } catch (error) {
      try {
        await db
          .delete(ollamaQueueRequests)
          .where(
            and(
              eq(ollamaQueueRequests.id, requestId),
              or(
                eq(ollamaQueueRequests.status, 'waiting'),
                eq(ollamaQueueRequests.leaseOwner, owner),
              ),
            ),
          );
      } catch {
        console.warn(JSON.stringify({ event: 'ollama_queue_cleanup_failed' }));
      }
      throw error;
    }
  }

  run<T>(
    lane: OllamaQueueLane,
    task: (signal: AbortSignal) => Promise<T>,
    options: OllamaQueueOptions = {},
  ): Promise<T> {
    return runQueued(this, lane, task, options);
  }
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      },
      Math.max(1, ms),
    );
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(abortError(signal));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export const processOllamaQueue = new OllamaQueue();
export const ollamaQueue = new PostgresOllamaQueue();

export function holdOllamaQueueForStream(
  stream: ReadableStream<Uint8Array>,
  release: OllamaQueueRelease,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  let released = false;
  const releaseOnce = () => {
    if (released) return;
    released = true;
    void safeRelease(release);
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          releaseOnce();
          controller.close();
        } else {
          controller.enqueue(chunk.value);
        }
      } catch (error) {
        releaseOnce();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        releaseOnce();
      }
    },
  });
}
