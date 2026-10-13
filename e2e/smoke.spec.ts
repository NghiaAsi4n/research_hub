import { expect, test } from '@playwright/test';

// Khói kiểm thử cho Giai đoạn 0: chỉ chạm trang công khai nên không cần phiên đăng nhập.
test('trang chủ trả về khung năm mục chính', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Research Hub' })).toBeVisible();

  for (const href of ['/library', '/chat', '/research', '/notes', '/watchlist']) {
    await expect(page.locator(`code:text-is("${href}")`)).toBeVisible();
  }
});

test('trang đăng nhập có form email và mật khẩu', async ({ page }) => {
  await page.goto('/sign-in');

  await expect(page.getByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Mật khẩu')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeEnabled();
});
