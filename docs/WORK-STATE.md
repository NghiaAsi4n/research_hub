# Trạng thái bàn giao

Cập nhật file này sau mỗi mục checklist đã hoàn tất và kiểm chứng, hoặc sau mỗi task hoàn tất nếu không có checklist. Giữ nội dung ngắn gọn, phản ánh trạng thái thực tế và cho phiên tiếp theo biết bước được phép làm kế tiếp.

## Trạng thái hiện tại

- Phase 1 đã đóng: 9 ticket `RH-2` … `RH-10` ở `Done`; epic `RH-1` còn `In Progress` vì công cụ đổi trạng thái Jira không có trong phiên. Nhánh `phase-1` ở `547ef2d`, chưa merge vào `main`.
- Phase 2 (epic `RH-22`, ticket `RH-23` … `RH-28`) làm trên nhánh `phase-2`. T1 (chunking) đã commit `ee790f1` và push lên `origin/phase-2`.
- T2–T6 đã xong phần mã và test trong working copy, **chưa commit/push**:
  - T2: `packages/core/src/embed.ts` (gọi Ollama theo lô, kiểm số chiều), `embed-store.ts` (cache theo nội dung chunk, ghi vector bằng một câu lệnh), 10 test.
  - T3: `packages/core/src/search.ts` (full-text `simple` trên `rh_unaccent`, vector cosine, hợp nhất RRF), migration `0005_search_indexes.sql` (hàm bỏ dấu + chỉ mục GIN và HNSW), 6 test.
  - T4: `packages/core/src/chat.ts` (prompt buộc marker `[n]`, đọc marker), `apps/web/src/lib/chat-handler.ts` (SSE), route `/api/chat`, route `/api/chunks/[id]`, UI `apps/web/src/components/chat/chat.tsx`, 13 test.
  - T5: `packages/core/src/eval-citations.ts` (chấm điểm + harness) và `gold-questions.ts` (30 câu, 6 tài liệu), 9 test.
  - T6: `packages/core/src/reindex.ts` (job `reindex:<model>`, lease 240 giây, chạy theo lô), 4 test PGlite.
- Kiểm chứng tại working copy: `packages/core` 117 test đạt/7 bỏ qua, `apps/web` 37 đạt, `packages/pipeline` 33 đạt/4 bỏ qua; `tsc --noEmit` core và web sạch; Biome sạch.
- Đã áp migration `0005` lên Neon staging (database `neondb`, project `research-hub-phase1-staging`, cấu hình trong `apps/web/.env.local`): hàm `rh_unaccent` chạy đúng, chỉ mục GIN và HNSW đã có. Test live `packages/core/src/search.live.test.ts` đạt 3/3 trên staging (khớp không dấu, xếp hạng cosine, hợp nhất RRF) — chạy khi đặt `SEARCH_LIVE=1` cùng `DATABASE_URL`.
- Bộ câu hỏi vàng nay có đủ dữ liệu để chạy: 6 tài liệu mẫu trong `packages/core/src/gold-corpus.ts`, `seedGoldCorpus` + route `POST /api/maintenance/gold-seed`, đường trả lời trọn vẹn `answerQuestion`, route `POST /api/maintenance/gold-eval` (guard `CRON_SECRET`, hỗ trợ `?limit=`). Test live `gold-seed.live.test.ts` đạt 2/2 trên staging (nạp idempotent + tìm đúng đoạn cho 3 câu mẫu), dữ liệu thử đã xoá (staging về 0 tài liệu, 0 chunk).
- Lượt chạy live phát hiện truy vấn full-text dùng AND nên câu hỏi tự nhiên không khớp; đã đổi sang OR có xếp hạng (`toOrQuery`) kèm test.
- Nghiệm thu Phase 2 đã đo được trên staging: 30/30 câu hỏi vàng có trích dẫn đúng (ngưỡng 80%), cả bộ 36,7 giây; token đầu tiên khi model ấm 686–1.263 ms (dưới 5 giây). Nguyên nhân trước đó không chạy được: tài khoản Ollama không mở `/api/embed` (401 với mọi model nhúng) dù `/api/chat` vẫn 200, nên đường nhúng chuyển sang Cloudflare Workers AI `@cf/baai/bge-m3` (1024 chiều), chọn bằng `EMBED_PROVIDER`.
- Việc còn lại của Phase 2: trạng thái "Đang chờ model trả lời…" trên UI mới kiểm bằng đọc mã, chưa có test giao diện; và các ticket Jira chưa chuyển `Done` vì công cụ đổi trạng thái không có trong phiên.
- Jira: `RH-23` đã có bình luận hoàn tất; `RH-1`, `RH-23` và các ticket T2–T6 chưa chuyển `Done` vì chưa commit/push hoặc thiếu công cụ đổi trạng thái.
- Bước tiếp theo: chờ duyệt commit/push cho T2–T6; sau đó chạy thử live trên staging (áp `0005`, ingest 6 tài liệu mẫu, đo bộ câu hỏi vàng).
