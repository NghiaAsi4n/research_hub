import { expect, test } from '@playwright/experimental-ct-react';
import type { ReaderDocument, ReadingPosition, SavedHighlight } from '@research-hub/core/reader';
import { ReaderLoader } from '../src/components/reader/reader-loader';

const id = '00000000-0000-4000-8000-000000000001';
const markdown = `## Điều khoản\n\nMột đoạn **quan trọng** cần ghi nhớ.\n\n${Array.from({ length: 24 }, (_, i) => `## Mục ${i + 1}\n\n${'Nội dung nghiên cứu để đọc và đối chiếu. '.repeat(12)}`).join('\n\n')}`;

test('selects, persists and restores highlights and reading progress', async ({
  mount,
  page,
}, testInfo) => {
  const savedState: { progress: ReadingPosition | null } = { progress: null };
  let highlights: SavedHighlight[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/documents/**', async (route) => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      savedState.progress = request.postDataJSON() as ReadingPosition;
      return route.fulfill({ status: 204 });
    }
    if (request.method() === 'POST') {
      const highlight = { ...request.postDataJSON(), id: 'highlight-1' } as SavedHighlight;
      highlights = [highlight];
      return route.fulfill({ status: 201, json: highlight });
    }
    if (request.method() === 'DELETE') {
      highlights = [];
      return route.fulfill({ status: 204 });
    }
    if (request.url().includes('format=markdown'))
      return route.fulfill({ contentType: 'text/markdown', body: markdown });
    const document: ReaderDocument = {
      id,
      title: 'Tài liệu nghiên cứu',
      status: 'ready',
      pages: null,
      sources: [],
      progress: savedState.progress,
      highlights,
    };
    return route.fulfill({ json: document });
  });
  const component = await mount(<ReaderLoader id={id} />);
  await expect(page.getByRole('heading', { name: 'Tài liệu nghiên cứu' })).toBeVisible();
  await page
    .locator('.reader-content p')
    .first()
    .evaluate((paragraph) => {
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    });
  await page.getByRole('button', { name: 'Highlight đoạn đã chọn' }).click();
  await expect(page.locator('.reader-content mark')).toHaveCount(3);
  await page
    .getByRole('navigation', { name: 'Mục lục' })
    .getByRole('link', { name: 'Mục 12', exact: true })
    .click();
  await expect.poll(() => savedState.progress?.ratio ?? 0).toBeGreaterThan(0.2);
  const savedRatio = savedState.progress?.ratio ?? 0;
  await component.unmount();
  await page.evaluate(() => {
    history.replaceState(null, '', location.pathname);
    window.scrollTo(0, 0);
  });
  await mount(<ReaderLoader id={id} />);
  await expect(page.locator('.reader-content mark')).toHaveCount(3);
  await expect
    .poll(async () =>
      page.evaluate(
        () => window.scrollY / (document.documentElement.scrollHeight - window.innerHeight),
      ),
    )
    .toBeCloseTo(savedRatio, 2);
  await page.screenshot({ path: testInfo.outputPath('reader-desktop.png') });
  await page.getByRole('button', { name: 'Xoá highlight' }).click();
  await expect(page.locator('.reader-content mark')).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    )
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath('reader-mobile-dark.png') });
  expect(errors).toEqual([]);
});
