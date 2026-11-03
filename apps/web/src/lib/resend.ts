import { getEnv } from '@research-hub/core/env';

// Gửi bản tin qua Resend gói Free (Giai đoạn 6, T4). Thiếu khoá hoặc người nhận thì trả false.

export async function sendBriefingEmail(input: {
  subject: string;
  text: string;
}): Promise<boolean> {
  const env = getEnv();
  if (!env.RESEND_API_KEY || !env.BRIEFING_EMAIL_TO) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.BRIEFING_FROM_EMAIL ?? 'onboarding@resend.dev',
        to: [env.BRIEFING_EMAIL_TO],
        subject: input.subject,
        text: input.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
