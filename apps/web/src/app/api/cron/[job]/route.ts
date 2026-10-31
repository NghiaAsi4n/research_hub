import { getEnv } from '@research-hub/core/env';
import { createWatchlistStore } from '@research-hub/core/watchlist-store';
import { readHtml } from '@research-hub/pipeline/read-html';
import { createBackup } from '@/lib/backup-run';
import { sendTelegramMessage } from '@/lib/telegram';
import { runWatchlistCheck } from '@/lib/watchlist-run';

// Cron của Vercel chỉ chạy được một lần mỗi ngày trên gói Hobby, nên cả ba việc định kỳ dùng
// chung một họ route và phân biệt bằng đoạn đường dẫn (plan mục 4 và mục 13.1).
//
// Ghi chú: reaper của lease (plan mục 7.2) được gộp vào lượt `watchlist` — đây là chỗ vá lỗ hổng
// "reaper chưa được gán vào cron nào" trong bản plan.
const JOBS = ['watchlist', 'briefing', 'backup'] as const;
type JobName = (typeof JOBS)[number];

function isJobName(value: string): value is JobName {
  return (JOBS as readonly string[]).includes(value);
}

export async function GET(request: Request, { params }: { params: Promise<{ job: string }> }) {
  const env = getEnv();

  // Vercel Cron gửi kèm `Authorization: Bearer <CRON_SECRET>` khi biến này tồn tại.
  // Nhờ đó route không gọi được từ ngoài (plan mục 3, ranh giới 5).
  if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { job } = await params;
  if (!isJobName(job)) {
    return Response.json({ error: 'unknown_job', job }, { status: 404 });
  }

  if (job === 'watchlist') {
    const summary = await runWatchlistCheck({
      store: createWatchlistStore(),
      read: async (url) => {
        const article = await readHtml(url);
        if (article.kind !== 'ok') return { ok: false, reason: article.reason };
        return { ok: true, title: article.title, text: article.markdown };
      },
      notifyTelegram: sendTelegramMessage,
    });
    return Response.json({ job, status: 'ok', ...summary });
  }

  if (job === 'backup') {
    const result = await createBackup();
    return Response.json({ job, status: 'ok', ...result });
  }

  // Briefing thuộc Giai đoạn 6. Trả 501 để không ai tưởng việc đã chạy.
  return Response.json({ job, status: 'not_implemented', phase: 6 }, { status: 501 });
}
