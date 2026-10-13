import { getEnv } from '@research-hub/core/env';

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

  // Giai đoạn 0 dừng ở đây: xác thực đúng, còn phần việc thật thuộc Giai đoạn 4 (watchlist,
  // backup) và Giai đoạn 6 (briefing). Trả 501 để không ai tưởng việc đã chạy.
  return Response.json(
    { job, status: 'not_implemented', phase: job === 'briefing' ? 6 : 4 },
    { status: 501 },
  );
}
