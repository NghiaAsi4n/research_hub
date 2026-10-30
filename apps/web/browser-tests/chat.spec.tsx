import { expect, test } from '@playwright/experimental-ct-react';
import { Chat } from '../src/components/chat/chat';

// Giao diện chat có trích dẫn (Giai đoạn 2, T4): trạng thái chờ trước token đầu tiên, câu trả lời
// hiện dần, và bấm trích dẫn mở đúng đoạn nguồn.

const citation = {
  index: 1,
  chunkId: '00000000-0000-4000-8000-000000000010',
  documentId: '00000000-0000-4000-8000-000000000001',
  documentTitle: 'Hợp đồng thuê nhà ở',
  ord: 0,
  quote: 'thời hạn thuê là 12 tháng',
};

const sse = [
  `data: ${JSON.stringify({ type: 'token', text: 'Thời hạn là ' })}`,
  '',
  `data: ${JSON.stringify({ type: 'token', text: 'mười hai tháng [1].' })}`,
  '',
  `data: ${JSON.stringify({ type: 'citations', citations: [citation] })}`,
  '',
  `data: ${JSON.stringify({ type: 'done' })}`,
  '',
].join('\n');

test('waits for the first token, then shows the cited answer', async ({ mount, page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.route('**/api/chat', async (route) => {
    // Giữ kết nối để UI phải hiện trạng thái chờ trước khi có token đầu tiên.
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
      body: sse,
    });
  });
  await page.route('**/api/chunks/**', (route) =>
    route.fulfill({
      json: {
        chunkId: citation.chunkId,
        documentId: citation.documentId,
        documentTitle: citation.documentTitle,
        ord: citation.ord,
        text: 'Các bên thỏa thuận thời hạn thuê là 12 tháng kể từ ngày bàn giao nhà.',
      },
    }),
  );

  const component = await mount(<Chat />);
  await component.getByLabel('Câu hỏi').fill('Thời hạn thuê là bao lâu?');
  await component.getByRole('button', { name: 'Hỏi' }).click();

  await expect(component.getByRole('status')).toContainText('Đang chờ model trả lời…');
  await expect(component.getByRole('button', { name: 'Hỏi' })).toContainText('Đang hỏi…');

  await expect(component.getByText('Thời hạn là mười hai tháng [1].')).toBeVisible();
  await expect(component.getByRole('status')).toHaveCount(0);

  await component.getByRole('button', { name: /Hợp đồng thuê nhà ở — đoạn 1/ }).click();
  await expect(component.getByRole('complementary', { name: 'Đoạn nguồn' })).toContainText(
    'thời hạn thuê là 12 tháng',
  );

  expect(errors).toEqual([]);
});
