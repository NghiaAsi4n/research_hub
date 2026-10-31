import { afterEach, describe, expect, it, vi } from 'vitest';
import { OllamaQueue } from './ollama-queue';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('OllamaQueue', () => {
  afterEach(() => vi.useRealTimers());

  it('serializes calls and alternates fairly between chat and research', async () => {
    const queue = new OllamaQueue();
    const gate = deferred();
    const calls: string[] = [];
    let active = 0;
    let maxActive = 0;
    const task =
      (name: string, block = false) =>
      async () => {
        calls.push(name);
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (block) await gate.promise;
        active -= 1;
        return name;
      };

    const first = queue.run('chat', task('chat-1', true));
    await vi.waitFor(() => expect(calls).toEqual(['chat-1']));
    const second = queue.run('chat', task('chat-2'));
    const research = queue.run('research', task('research-1'));
    gate.resolve();

    await expect(Promise.all([first, second, research])).resolves.toEqual([
      'chat-1',
      'chat-2',
      'research-1',
    ]);
    expect(calls).toEqual(['chat-1', 'research-1', 'chat-2']);
    expect(maxActive).toBe(1);
  });

  it('releases the slot after a request throws', async () => {
    const queue = new OllamaQueue();
    const failing = queue.run('research', async () => {
      throw new Error('provider failed');
    });

    await expect(failing).rejects.toThrow('provider failed');
    await expect(queue.run('chat', async () => 'next')).resolves.toBe('next');
  });

  it('times out a waiting call without blocking the next request', async () => {
    vi.useFakeTimers();
    const queue = new OllamaQueue();
    const gate = deferred();
    const first = queue.run('chat', async () => {
      await gate.promise;
      return 'first';
    });
    const waiting = queue.run('research', async () => 'expired', { timeoutMs: 20 });
    const assertion = expect(waiting).rejects.toMatchObject({ name: 'TimeoutError' });

    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    gate.resolve();
    await expect(first).resolves.toBe('first');
    await expect(queue.run('research', async () => 'next')).resolves.toBe('next');
    vi.useRealTimers();
  });
});
