import { getEnv } from '@research-hub/core/env';

// Gửi bản tin qua Slack Incoming Webhook (Giai đoạn 6, T4). Thiếu webhook thì trả false để
// runner ghi trạng thái "bỏ qua", không làm hỏng cron.

export async function sendSlackText(text: string): Promise<boolean> {
  const url = getEnv().SLACK_WEBHOOK_URL;
  if (!url) return false;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
