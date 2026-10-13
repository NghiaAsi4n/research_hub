# Research Hub

Kho nghiên cứu cá nhân chạy trên các gói miễn phí. Kế hoạch đầy đủ nằm ở [research-hub-plan.md](./research-hub-plan.md).

Trạng thái hiện tại: **Giai đoạn 0 đã xong** — bản production chạy được, CI xanh, và Giai đoạn 1 đang được chia thành chín việc trong Jira.

- Nhánh: mỗi giai đoạn một nhánh `phase-<số>`, `main` giữ bản đang chạy production. Giai đoạn 0 nằm ở nhánh `phase-0`.

## Bản chạy

- Production, alias theo nhánh `main`: <https://researchhub-git-main-tran-trong-nghias-projects.vercel.app>
- URL dạng `research-<hash>-…vercel.app` chỉ gắn với một bản build duy nhất, không dùng để chia sẻ hay khai vào cấu hình.
- Đã tắt "Vercel Authentication" cho môi trường Production, nên URL trên mở được từ ngoài: request không kèm phiên đăng nhập Vercel vẫn nhận trang chủ.

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
pnpm test                    # Vitest
pnpm test:e2e                # Playwright, tự dựng dev server
```

Playwright chỉ chạy trên trang công khai (`/`, `/sign-in`) vì mọi trang trong matcher của
`proxy.ts` đều cần phiên đăng nhập thật. Cài trình duyệt một lần bằng
`pnpm exec playwright install chromium`.

`env.ts` bắt buộc sáu biến và sẽ dừng ngay nếu thiếu. Ba biến `SLACK_WEBHOOK_URL`,
`RESEND_API_KEY`, `SSI_API_KEY` chỉ cần từ Giai đoạn 6 nên để trống vẫn chạy được. Nhóm tuỳ chọn
(ba biến đó cùng `AWS_*`, `OLLAMA_BASE_URL`, `EMBED_DIM`) để trống hoặc ghi chuỗi rỗng đều coi như chưa khai.

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
| `POST /api/embed` | session + rate limit | kiểm tra vector đúng `EMBED_DIM` (mặc định 1024 chiều) |
| `GET /api/cron/{job}` | `CRON_SECRET` | khung, chưa nối việc |
| `POST /api/ingest` | session + rate limit | phát URL ký sẵn (`presignUpload`) để upload thẳng lên Object Storage |
| `/api/auth/*` | Managed Better Auth | chặn luồng đăng ký |

## Cron

Khai báo ở `apps/web/vercel.json` (Root Directory của project Vercel là `apps/web`), chạy theo giờ UTC, tối đa một lần mỗi ngày trên gói Hobby:

| Đường dẫn | Giờ UTC | Việc |
|---|---|---|
| `/api/cron/watchlist` | 01:00 | quét watchlist và chạy reaper của lease |
| `/api/cron/briefing` | 09:00 | bản tin hằng ngày (Giai đoạn 6) |
| `/api/cron/backup` | 18:00 | export sao lưu |


