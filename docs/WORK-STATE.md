# Trạng thái bàn giao

Cập nhật file này sau mỗi mục checklist đã hoàn tất và kiểm chứng, hoặc sau mỗi task hoàn tất nếu không có checklist. Giữ nội dung ngắn gọn, phản ánh trạng thái thực tế và cho phiên tiếp theo biết bước được phép làm kế tiếp.

## Trạng thái hiện tại

- Phase 1 đã đóng: 9 ticket `RH-2` … `RH-10` chuyển `Done` ngày 2026-10-30 kèm bình luận tổng kết (commit, kiểm chứng, dọn dữ liệu thử). Epic `RH-1` chưa chuyển được `Done` vì công cụ cập nhật trạng thái Jira không còn trong phiên; chỉ cần chuyển trạng thái, không cần sửa nội dung.
- Nhánh `phase-1` giữ nguyên ở commit `547ef2d` (remote `origin/phase-1` cùng commit). Phase 1 chưa merge vào `main` vì người dùng chưa yêu cầu.
- Phase 2 đã dựng khung: epic [RH-22](https://nghiaasi4n-1.atlassian.net/browse/RH-22) và 6 ticket `RH-23` … `RH-28`; checklist từng việc nằm trong `docs/phase-2/`, nhánh làm việc `phase-2` tách từ `phase-1`.
- T1/RH-23 (chunking) đã xong phần mã và test trong working copy, **chưa commit/push**: `packages/core/src/chunk.ts`, `packages/core/src/chunk-store.ts` và hai file test; export `./chunk`, `./chunk-store` đã thêm vào `packages/core/package.json`. Kiểm chứng: 9 test chunk + 4 test PGlite cho store đạt, `tsc --noEmit` của `packages/core` không lỗi.
- Nghiệm thu Phase 1 (giữ nguyên bằng chứng, staging `br-spring-night-azxg5whj`): URL ingest 2,25 giây; PDF 3.424 byte xong sau 2,06 giây; 50 tài liệu liên tiếp 110,8 giây, không lỗi; request thứ 31 trả `429`; thiếu phiên trả `401`.
- Production không bị ghi trong suốt Phase 1; `.env.local` ở root vẫn trỏ branch `br-curly-glade-azjguhv7` (project `plain-bird-91045931`).
- Bước tiếp theo: chờ duyệt commit/push cho T1; sau đó làm T2 (embedding) trên cùng nhánh `phase-2`. Epic `RH-1` cần chuyển `Done` khi công cụ Jira cho phép.
