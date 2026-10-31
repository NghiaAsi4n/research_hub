# Trạng thái bàn giao

Cập nhật file này sau mỗi mục checklist đã hoàn tất và kiểm chứng, hoặc sau mỗi task hoàn tất nếu không có checklist. Giữ nội dung ngắn gọn, phản ánh trạng thái thực tế và cho phiên tiếp theo biết bước được phép làm kế tiếp.

## Trạng thái hiện tại

- Phase 1, Phase 2, Phase 3 đã nằm trên `main`; Phase 3 đóng ở `73860fb`.
- Phase 4 làm trên nhánh `phase-4`, epic Jira RH-36 với 5 ticket RH-37…RH-41; checklist trong `docs/phase-4/`.
- T1/RH-37 đã xong (commit `1e34734`): migration `0009_phase4_notes_watchlist` (notes.tags, notes.updated_at, notifications.payload/read_at, watchlist_snapshots) áp lên Neon staging; store ghi chú, API `/api/notes`, trang `/notes`, nút lưu trích dẫn trong chat.
- T2/RH-38 đã xong (commit `dcd5806`): watchlist store, cron so diff, chuông trong app + Telegram (tuỳ chọn), trang `/watchlist`. Live với trang luật trên luatvietnam.vn phát hiện thay đổi và ghi `changes` + thông báo.
- T3/RH-39 đã xong (commit `b395368`): export 19 bảng nghiệp vụ (bỏ settings, quotes, bảng hàng đợi, vector nhúng), gzip lên `backups/<ngày>.json.gz`, cron `/api/cron/backup`, lệnh `backup:export`/`backup:restore`. Đã export staging, tạo branch Neon thử, restore đủ 10 bản ghi mẫu rồi xoá branch và object thử.
- T4/RH-40 đã xong (commit `fd75d5d`): xuất Markdown/PDF/DOCX từ ghi chú và báo cáo research, route `/api/export/[kind]/[id]`, trang chỉ-đọc `/read/[kind]/[id]`. PDF nhúng Noto Sans; build production đạt.
- T5/RH-41 đã xong (commit `0b7c583`): tìm kiếm toàn cục ba loại, API `/api/search`, trang `/search`; đồ thị quan hệ tài liệu, API `/api/graph`, trang `/graph`. Live trên staging trả đủ 3 loại kết quả và đồ thị 3 nút/2 cạnh.
- Phase 4 hoàn tất: epic RH-36 và RH-37…RH-41 đều `Done`; hai tiêu chí nghiệm thu giai đoạn đã đạt (watchlist phát hiện thay đổi; file export mở lại và khôi phục vào branch mới).
- Kiểm chứng cuối: core 198 đạt/13 bỏ qua, web 49 đạt/1 bỏ qua, pipeline 33 đạt/4 bỏ qua; typecheck ba workspace sạch; `pnpm build` đạt.
- Lưu ý lint: `pnpm lint` toàn repo còn báo lỗi có sẵn ở `apps/web/src/lib/research-deps.ts` (useOptionalChain) và `research-deps.test.ts` (format), không thuộc Phase 4.
- Phase 5 làm trên nhánh `phase-5`, epic RH-42 với RH-43…RH-47, checklist trong `docs/phase-5/`. Đã xong mã T1–T4 và phần Object Storage của T5; 2FA bị chặn vì Managed Better Auth không có plugin two-factor (bằng chứng trong `t5-storage-va-2fa.md`).
- Kiểm chứng Phase 5: capacity thật 9.543.680 byte DB/0 byte storage (1,78% hạn mức), drill khôi phục 2,971 giây trên branch mới, allowlist bổ sung `@cf/baai/bge-m3`, chặn khoá ở export và run_steps, bucket kín (`publicPolicy=false`, chặn đọc ẩn danh).
- Đã commit và push: Next.js 16.4.1 ở `2325634`, Phase 5 ở `eae5f65`; `origin/phase-5` và `main` đều ở `eae5f65` (đã merge nhanh).
- Bước tiếp theo: người dùng duyệt commit; phần 2FA chờ quyết định bật 2FA tài khoản Neon trong Console hay chuyển self-managed Better Auth.
