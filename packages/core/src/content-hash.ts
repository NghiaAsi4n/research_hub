import { createHash } from 'node:crypto';

// Identity is the exact clean Markdown, including links and code whitespace.
// Hash bytes rather than decoded chunks so UTF-8 split across reads stays intact.
export function contentHash(markdown: string): string {
  return createHash('sha256').update(markdown, 'utf8').digest('hex');
}

export async function hashContentChunks(chunks: AsyncIterable<Uint8Array>): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of chunks) hash.update(chunk);
  return hash.digest('hex');
}
