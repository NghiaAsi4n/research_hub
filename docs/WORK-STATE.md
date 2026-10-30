# Trạng thái bàn giao

Cập nhật file này sau mỗi mục checklist đã hoàn tất và kiểm chứng, hoặc sau mỗi task hoàn tất nếu không có checklist. Giữ nội dung ngắn gọn, phản ánh trạng thái thực tế và cho phiên tiếp theo biết bước được phép làm kế tiếp.

## Trạng thái hiện tại

- Phase 1 đã đóng và đã merge vào `main`; mã ở `547ef2d`. 9 ticket `RH-2` … `RH-10` ở `Done`; epic `RH-1` còn `In Progress` vì công cụ đổi trạng thái Jira không có trong phiên.
- Phase 2 đã đóng và đã merge vào `main`; mã ở `70e783d`. Nghiệm thu đo trên staging: 30/30 câu hỏi vàng có trích dẫn đúng (ngưỡng 80%), cả bộ 36,7 giây; token đầu tiên khi model ấm 686–1.263 ms. Đường nhúng dùng Cloudflare Workers AI `@cf/baai/bge-m3` (1024 chiều) vì tài khoản Ollama không mở `/api/embed`; chọn nhà cung cấp bằng `EMBED_PROVIDER`, ghi đè model bằng `EMBED_MODEL`.
- Phase 2 đã phủ test giao diện: `apps/web/browser-tests/chat.spec.tsx` kiểm trạng thái "Đang chờ model trả lời…", câu trả lời hiện dần và bấm trích dẫn mở đúng đoạn nguồn (Playwright CT, đạt 1/1).
- Phase 3 đang làm: epic `RH-29`, 6 ticket `RH-30` … `RH-35`, checklist trong `docs/phase-3/`, nhánh `phase-3`. T1/RH-30 (orchestrator năm bước `packages/core/src/research.ts`, 6 test) đã xong, đã merge vào `main`.
- Migration `0005` đã áp lên Neon staging (project `research-hub-phase1-staging`, cấu hình trong `apps/web/.env.local`): hàm `rh_unaccent` và hai chỉ mục GIN/HNSW chạy đúng; test live `search.live.test.ts` 3/3 và `gold-seed.live.test.ts` 2/2 đạt, dữ liệu thử đã xoá.
- Kiểm chứng gần nhất: `packages/core` 138 test đạt/13 bỏ qua, `apps/web` 37 đạt, `packages/pipeline` 33 đạt/4 bỏ qua; `tsc --noEmit` core và web sạch; Biome sạch.
- Jira: ticket chưa chuyển `Done` được vì thiếu công cụ đổi trạng thái trong phiên; bình luận hoàn tất đã có trên từng ticket đã xong.
- Quy trình: theo `AGENTS.md` — xong một ticket là tự commit, push lên nhánh `phase-<số>`, rồi merge ngay vào `main` và push.
- Bước tiếp theo: T2/RH-31 (cursor và ngân sách 240 giây) trên nhánh `phase-3`.
