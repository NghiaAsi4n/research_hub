# Trạng thái bàn giao

Cập nhật file này sau mỗi mục checklist đã hoàn tất và kiểm chứng, hoặc sau mỗi task hoàn tất nếu không có checklist. Giữ nội dung ngắn gọn, phản ánh trạng thái thực tế và cho phiên tiếp theo biết bước được phép làm kế tiếp.

## Trạng thái hiện tại

- Phase 1: T7/RH-8 (`eb1d267`), T9/RH-10 (`9396074`) và T8/RH-9 (`3a1d36e`) đã push lên `origin/phase-1`. Các thay đổi của lượt nghiệm thu (backfill hash T9, sửa route auth, chứng cứ nghiệm thu phase) đã được người dùng duyệt và commit theo nhóm trong cùng lượt, rồi push lên `origin/phase-1`.
- Nghiệm thu cấp phase ngày 2026-10-20 trên staging `br-spring-night-azxg5whj` (project `research-hub-phase1-staging`, cấu hình trong `apps/web/.env.local` và `.env.phase1-auth-staging`):
  - URL `https://science.nasa.gov/earth/facts/`: `POST /api/ingest` trả `done` sau 2,25 giây; Markdown sạch 11.468 ký tự, tiêu đề "Facts About Earth".
  - PDF `contract-3-pages.pdf` 3.424 byte (dưới 4,5 MB): ký URL, PUT, `done`, xử lý xong sau 2,06 giây; 3 trang, `meta.readMs` 522 ms, Markdown 1.254 ký tự.
  - 50 URL khác nội dung: 50/50 `200`/`done`, không lỗi, 110,8 giây, nhịp 2,2 giây/request.
  - Burst 31 request cùng URL: 30 request `200`, request 31 trả `429` với `retry-after: 52`; tài liệu chỉ tăng 1, không sinh job/tài liệu cho request bị chặn.
  - Request thiếu session trả `401` (đã kiểm thử trước đó); guard chạy trước khi đọc nguồn nên không gọi model.
- Backfill hash T9: migration `0004_backfill_hash.sql` (hàm `rh_backfill_document_hash`), module `packages/core/src/backfill-hash.ts`, route `POST /api/maintenance/backfill-hash` (bảo vệ `CRON_SECRET`, chạy theo lô, có `dryRun`). Test PGlite 3/3 đạt; test live staging 1/1 đạt: đổi hash nguồn cũ sang hash nội dung, gộp bản trùng, giữ hai nguồn, alias cho ID cũ và payload job. Migration đã áp lên staging; dữ liệu thử và tài khoản thử đã dọn (0 tài liệu, 0 job).
- Production: `.env.local` ở root trỏ branch `br-curly-glade-azjguhv7` (project `plain-bird-91045931`). Lượt này không ghi gì vào production; tại thời điểm kiểm tra production có 0 dòng `documents` nên không có bản ghi cũ cần backfill.
- Bộ test đầy đủ tại revision hiện tại: core 64 passed/7 skipped, pipeline 33 passed/4 skipped, web 31 passed; `npm test` exit 0. Kiểm thử live chỉ chạy khi đặt `PHASE1_LIVE_TEST=1` cùng `PHASE1_LIVE_EXPECTED_BRANCH`.
- Jira RH-9 và RH-10 vẫn `In Progress`; đã thêm bình luận tiến độ/nghiệm thu, chưa chuyển `Done` vì chưa commit/push.
- Bước tiếp theo: chờ review thay đổi của lượt này; chỉ commit/push sau khi có phê duyệt rõ ràng. Sau khi push, cập nhật checklist remote và chuyển RH-9/RH-10 sang `Done` nếu được duyệt.
