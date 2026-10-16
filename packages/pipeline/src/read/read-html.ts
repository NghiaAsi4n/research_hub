import { fetchHtml } from './fetch-html';
import { articleFromHtml } from './html-article';

export async function readHtml(url: string) {
  try {
    const fetched = await fetchHtml(url);
    if (fetched.kind === 'error') return fetched;
    return articleFromHtml(fetched.html, { url });
  } catch {
    // Includes failures while reading a timed-out response body.
    return { kind: 'error' as const, reason: 'network', detail: 'Không đọc được nội dung nguồn' };
  }
}
