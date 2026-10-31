# Trạng thái bàn giao

Cập nhật file này sau mỗi mục checklist đã hoàn tất và kiểm chứng, hoặc sau mỗi task hoàn tất nếu không có checklist. Giữ nội dung ngắn gọn, phản ánh trạng thái thực tế và cho phiên tiếp theo biết bước được phép làm kế tiếp.

## Trạng thái hiện tại

- Phase 1, Phase 2, Phase 3 đã nằm trên `main`; Phase 3 đóng ở `73860fb`.
- Phase 4 làm trên nhánh `phase-4`, epic Jira RH-36 với 5 ticket RH-37…RH-41; checklist trong `docs/phase-4/`.
- T1/RH-37 đã xong: migration `0009_phase4_notes_watchlist` (notes.tags, notes.updated_at, notifications.payload/read_at, watchlist_snapshots) áp lên Neon staging; store ghi chú, API `/api/notes`, trang `/notes`, nút lưu trích dẫn trong chat.
- Kiểm chứng T1: core 179 đạt/13 bỏ qua, web 45 đạt, typecheck ba workspace sạch, Biome sạch trên file của T1.
- Lưu ý lint: `pnpm lint` toàn repo còn báo lỗi có sẵn ở `apps/web/src/lib/research-deps.ts` (useOptionalChain) và `research-deps.test.ts` (format), không thuộc Phase 4.
- Bước tiếp theo: T2/RH-38 — watchlist, cron so diff, thông báo trong app và Telegram.
- Lưu ý bảo mật: Next.js 16.4.0 báo phiên bản có lỗ hổng đã biết; cân nhắc `next upgrade --agent=security` trong worktree riêng khi người dùng đồng ý.
