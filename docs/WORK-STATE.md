# Trạng thái bàn giao

Cập nhật file này sau mỗi mục checklist đã hoàn tất và kiểm chứng, hoặc sau mỗi task hoàn tất nếu không có checklist. Giữ nội dung ngắn gọn, phản ánh trạng thái thực tế và cho phiên tiếp theo biết bước được phép làm kế tiếp.

## Trạng thái hiện tại

- Phase 1, Phase 2 và code Phase 3 đã nằm trên `main`/`phase-3`; Phase 2 đóng ở `70e783d`, T1 Phase 3 là `cd5d43d` (merge `846a7fe`).
- Phase 3: mã và test cho RH-31–RH-35 đã commit `c4bdd50` và push lên `origin/phase-3`; chưa merge vào `main`. Các file chính: `research.ts`, `research-store.ts`, `research-report.ts`, `ollama-queue.ts`, `apps/web/src/lib/research-deps.ts`, `apps/web/src/app/api/research/`.
- Đã bổ sung migration `0006_research_run_owner`, `0007_shared_ollama_queue`, `0008_ollama_queue_fairness`; đã áp thành công lên Neon staging bằng `pnpm db:migrate`.
- Kiểm chứng tự động: core 169 đạt/13 bỏ qua, web 42 đạt, pipeline 33 đạt/4 bỏ qua; typecheck core + web sạch; Biome sạch; `next build` biên dịch và typecheck xong nhưng dừng ở cảnh báo bảo mật của Next.js.
- Nghiệm thu live chưa chạy: `OLLAMA_BASE_URL` trống, Ollama cục bộ không truy cập được, Ollama Cloud trả `401`; Cloudflare thiếu `CLOUDFLARE_ACCOUNT_ID`. DuckDuckGo trả `200` nên phần tìm kiếm web sẵn sàng.
- Jira: RH-31–RH-35 giữ `In Progress` vì chưa nghiệm thu live và chưa merge vào `main`; RH-30 và Phase 2 đã `Done`.
- Bước tiếp theo: cấu hình endpoint model còn hiệu lực, chạy thử `/api/research` với câu hỏi thật, xác nhận báo cáo 5+ nguồn và không phát sinh chi phí; sau đó chờ người dùng xác nhận merge.
- Lưu ý bảo mật: Next.js 16.4.0 báo phiên bản có lỗ hổng đã biết; cần cân nhắc chạy `next upgrade --agent=security` trong worktree riêng khi người dùng đồng ý.
