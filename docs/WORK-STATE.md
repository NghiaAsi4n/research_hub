# Trạng thái bàn giao

Cập nhật file này sau mỗi mục checklist đã hoàn tất và kiểm chứng, hoặc sau mỗi task hoàn tất nếu không có checklist. Giữ nội dung ngắn gọn, phản ánh trạng thái thực tế và cho phiên tiếp theo biết bước được phép làm kế tiếp.

## Trạng thái hiện tại

- Phase 1, Phase 2 và Phase 3 đã nằm trên `main`/`phase-3`; Phase 2 đóng ở `70e783d`, T1 Phase 3 là `cd5d43d` (merge `846a7fe`).
- Phase 3: mã RH-31–RH-35 ở `c4bdd50`, bản sửa từ nghiệm thu live ở `fe422c4`; cả hai đã push lên `origin/phase-3` và merge vào `main`.
- Migration `0006_research_run_owner`, `0007_shared_ollama_queue`, `0008_ollama_queue_fairness` đã áp lên Neon staging.
- Kiểm chứng tự động: core 173 đạt/13 bỏ qua, web 45 đạt, pipeline 33 đạt/4 bỏ qua; typecheck ba workspace và Biome sạch.
- Nghiệm thu live đạt với Ollama cục bộ `qwen2.5:3b`: câu hỏi về thành lập doanh nghiệp tư nhân trả `done` sau 12 bước, 8 nguồn (6 nguồn có trích đoạn), 13.247 token, 12 đơn vị, không cảnh báo hạn mức; báo cáo có đủ kết luận, bằng chứng và nguồn. Dữ liệu run thử đã xoá.
- Máy có Ollama tại `C:\Users\Nghia\AppData\Local\Programs\Ollama\ollama.exe`; cổng mặc định `11434` nằm trong dải Windows giữ `11370–11469`, nên chạy bằng `OLLAMA_HOST=127.0.0.1:11500` và đặt `OLLAMA_BASE_URL=http://127.0.0.1:11500`, `CHAT_MODEL=qwen2.5:3b`.
- Jira: RH-29 và RH-30–RH-35 đều `Done`.
- Lưu ý bảo mật: Next.js 16.4.0 báo phiên bản có lỗ hổng đã biết; cần cân nhắc chạy `next upgrade --agent=security` trong worktree riêng khi người dùng đồng ý.
