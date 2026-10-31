import { getEnv } from '@research-hub/core/env';

// Gửi thông báo qua Telegram Bot API. Thiếu biến môi trường thì coi như chưa cấu hình kênh này,
// không làm hỏng lượt quét watchlist.
export async function sendTelegramMessage(
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const env = getEnv();
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;

  try {
    const response = await fetchImpl(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
          disable_web_page_preview: true,
        }),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}
