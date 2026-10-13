# Research Hub

Kho nghiên cứu cá nhân chạy trên các gói miễn phí. Kế hoạch đầy đủ nằm ở [research-hub-plan.md](./research-hub-plan.md).

Trạng thái hiện tại: **đang ở Giai đoạn 0** — mới có khung mã nguồn, chưa nối Neon, chưa deploy.

## Cấu trúc

```text
apps/web            Next.js 16 (App Router) — UI, route handler, guard xác thực
packages/core       env, schema Drizzle, Object Storage, cấu hình auth
packages/pipeline   chế độ chạy máy (điểm vào CLI)
```

## Chạy ở máy

```bash
pnpm install
cp .env.example .env.local   # rồi điền giá trị thật
pnpm typecheck
pnpm lint
pnpm build
pnpm dev                     # http://localhost:3000
```

`env.ts` bắt buộc sáu biến và sẽ dừng ngay nếu thiếu. Ba biến `SLACK_WEBHOOK_URL`,
`RESEND_API_KEY`, `SSI_API_KEY` chỉ cần từ Giai đoạn 6 nên để trống vẫn chạy được.

## Cơ sở dữ liệu

```bash
pnpm db:generate   # sinh migration SQL từ packages/core/src/db/schema.ts
pnpm db:migrate    # cần DATABASE_URL trỏ tới project Neon
```

Project Neon phải tạo ở region **Singapore** (`aws-ap-southeast-1`) ngay từ đầu vì region không
đổi được sau khi tạo.

## Route hiện có

| Route | Bảo vệ | Trạng thái |
|---|---|---|
| `GET /api/health` | công khai | xác nhận cấu hình đã nạp |
| `POST /api/embed` | session + rate limit | kiểm tra vector đúng 1024 chiều |
| `GET /api/cron/{job}` | `CRON_SECRET` | khung, chưa nối việc |
| `POST /api/ingest` | session + rate limit | khung, chưa nối việc |
| `/api/auth/*` | Managed Better Auth | chặn luồng đăng ký |

## Cron

Khai báo ở `vercel.json`, chạy theo giờ UTC, tối đa một lần mỗi ngày trên gói Hobby:

| Đường dẫn | Giờ UTC | Việc |
|---|---|---|
| `/api/cron/watchlist` | 01:00 | quét watchlist và chạy reaper của lease |
| `/api/cron/briefing` | 09:00 | bản tin hằng ngày (Giai đoạn 6) |
| `/api/cron/backup` | 18:00 | export sao lưu |

## Việc cần credential, chưa làm được ở phiên này

1. Tạo project Neon ở Singapore, bật pgvector và Managed Better Auth.
2. Bật Object Storage và lấy credential vào `.env.local`.
3. Chạy `pnpm install` để sinh `pnpm-lock.yaml`, sau đó `pnpm typecheck`, `pnpm build`.
4. `vercel link` và `vercel deploy` cho project Hobby.
5. Đặt biến môi trường trên Vercel Dashboard và ghim region function là `sin1`.
