import { PGlite } from '@electric-sql/pglite';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from './db/client';
import { ollamaQueueRequests, ollamaSlots } from './db/schema';
import { PostgresOllamaQueue } from './ollama-queue';

const pg = new PGlite();
const db = drizzle(pg) as unknown as Db;

beforeAll(async () => {
  await pg.exec(`
    create table ollama_queue_requests (
      seq bigserial primary key,
      id uuid not null unique,
      lane text not null,
      status text not null default 'waiting',
      deadline_at timestamptz not null,
      lease_owner text,
      lease_expires_at timestamptz
    );
    create table ollama_slots (
      slot_name text primary key,
      request_id uuid,
      lease_owner text,
      lease_expires_at timestamptz,
      last_lane text not null default 'research'
    );
    insert into ollama_slots (slot_name) values ('ollama');
  `);
});

afterAll(() => pg.close());

beforeEach(async () => {
  await pg.exec('truncate ollama_queue_requests restart identity cascade');
  await db
    .update(ollamaSlots)
    .set({ requestId: null, leaseOwner: null, leaseExpiresAt: null })
    .where(eq(ollamaSlots.slotName, 'ollama'));
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('PostgresOllamaQueue', () => {
  it('serializes requests across separate queue instances in FIFO order', async () => {
    const firstQueue = new PostgresOllamaQueue({ db, pollMs: 5 });
    const secondQueue = new PostgresOllamaQueue({ db, pollMs: 5 });
    const gate = deferred();
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;
    const task =
      (name: string, pause = false) =>
      async () => {
        order.push(name);
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (pause) await gate.promise;
        active -= 1;
        return name;
      };

    const first = firstQueue.run('chat', task('chat', true), { timeoutMs: 5_000 });
    await vi.waitFor(() => expect(order).toEqual(['chat']));
    const second = secondQueue.run('research', task('research'), { timeoutMs: 5_000 });
    await vi.waitFor(async () => {
      expect(await db.select().from(ollamaQueueRequests)).toHaveLength(2);
    });
    gate.resolve();

    await expect(Promise.all([first, second])).resolves.toEqual(['chat', 'research']);
    expect(order).toEqual(['chat', 'research']);
    expect(maxActive).toBe(1);
    expect(await db.select().from(ollamaQueueRequests)).toHaveLength(0);
  });

  it('reclaims the shared slot after a crashed request lease expires', async () => {
    const firstQueue = new PostgresOllamaQueue({ db, pollMs: 5, leaseMs: 100 });
    const secondQueue = new PostgresOllamaQueue({ db, pollMs: 5, leaseMs: 100 });
    const staleRelease = await firstQueue.acquire('chat', { timeoutMs: 1_000 });
    await db
      .update(ollamaSlots)
      .set({ leaseExpiresAt: new Date(Date.now() - 1) })
      .where(eq(ollamaSlots.slotName, 'ollama'));
    await db.update(ollamaQueueRequests).set({ leaseExpiresAt: new Date(Date.now() - 1) });

    await expect(
      secondQueue.run('research', async () => 'reclaimed', { timeoutMs: 1_000 }),
    ).resolves.toBe('reclaimed');
    await staleRelease();

    const [slot] = await db.select().from(ollamaSlots).where(eq(ollamaSlots.slotName, 'ollama'));
    expect(slot?.requestId).toBeNull();
    expect(await db.select().from(ollamaQueueRequests)).toHaveLength(0);
  });

  it('alternates between research and chat when both are waiting', async () => {
    const queue = new PostgresOllamaQueue({ db, pollMs: 5 });
    const gate = deferred();
    const order: string[] = [];
    const task =
      (name: string, pause = false) =>
      async () => {
        order.push(name);
        if (pause) await gate.promise;
        return name;
      };

    const first = queue.run('research', task('research-1', true), { timeoutMs: 5_000 });
    await vi.waitFor(() => expect(order).toEqual(['research-1']));
    const [heldSlot] = await db
      .select()
      .from(ollamaSlots)
      .where(eq(ollamaSlots.slotName, 'ollama'));
    expect(heldSlot?.lastLane).toBe('research');
    expect(heldSlot?.requestId).not.toBeNull();
    const research = queue.run('research', task('research-2'), { timeoutMs: 5_000 });
    const chat = queue.run('chat', task('chat-1'), { timeoutMs: 5_000 });
    await vi.waitFor(async () => {
      expect(await db.select().from(ollamaQueueRequests)).toHaveLength(3);
    });
    const [waitingSlot] = await db
      .select()
      .from(ollamaSlots)
      .where(eq(ollamaSlots.slotName, 'ollama'));
    expect(waitingSlot?.lastLane).toBe('research');
    const candidates = await db.execute(sql`
      SELECT request.lane
      FROM ollama_queue_requests AS request
      CROSS JOIN ollama_slots AS slot
      WHERE request.status = 'waiting' AND slot.slot_name = 'ollama'
      ORDER BY CASE WHEN request.lane <> slot.last_lane THEN 0 ELSE 1 END, request.seq
    `);
    expect((candidates.rows as { lane: string }[]).map((row) => row.lane)).toEqual([
      'chat',
      'research',
    ]);
    const allRequests = await db.select().from(ollamaQueueRequests);
    expect(allRequests.map((row) => row.lane).sort()).toEqual(['chat', 'research', 'research']);
    gate.resolve();

    await expect(Promise.all([first, research, chat])).resolves.toEqual([
      'research-1',
      'research-2',
      'chat-1',
    ]);
    expect(order).toEqual(['research-1', 'chat-1', 'research-2']);
  });
});
