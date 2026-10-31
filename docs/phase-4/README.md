# Giai đoạn 4 — Ghi chú, watchlist, xuất bản

**Kết luận về scope:** vừa, 1 tuần theo plan mục 9 (5 hạng mục). Chia thành 5 việc độc lập, mỗi việc một ticket trong project Jira `RH`, dưới epic [RH-36](https://nghiaasi4n-1.atlassian.net/browse/RH-36).

| # | Việc | Ticket | Ước lượng | Phụ thuộc |
|---|---|---|---|---|
| T1 | Note Markdown, liên kết hai chiều, tag, chèn trích dẫn từ chat | [RH-37](https://nghiaasi4n-1.atlassian.net/browse/RH-37) | 2 ngày | Giai đoạn 2 |
| T2 | Watchlist, cron so diff, thông báo chuông trong app và Telegram | [RH-38](https://nghiaasi4n-1.atlassian.net/browse/RH-38) | 2 ngày | Giai đoạn 1 |
| T3 | Cron export logic dữ liệu ra Object Storage | [RH-39](https://nghiaasi4n-1.atlassian.net/browse/RH-39) | 1 ngày | Giai đoạn 0, 1 |
| T4 | Xuất Markdown, PDF, DOCX và bản đọc chỉ-đọc | [RH-40](https://nghiaasi4n-1.atlassian.net/browse/RH-40) | 1,5 ngày | T1 |
| T5 | Tìm kiếm toàn cục và đồ thị quan hệ tài liệu | [RH-41](https://nghiaasi4n-1.atlassian.net/browse/RH-41) | 1,5 ngày | T1, Giai đoạn 2 |

## Thứ tự làm

1. T1 dựng bảng ghi chú và store dùng chung; T4 và T5 đọc lại ghi chú từ đó.
2. T2 nối cron hằng ngày, ghi `changes` và gửi thông báo; cả bốn kênh ở Giai đoạn 6 cùng đọc bảng này.
3. T3 export dữ liệu logic, độc lập với các việc còn lại.
4. T4 xuất bản và trang chỉ-đọc; T5 tìm kiếm và đồ thị đặt trên dữ liệu sẵn có.

## Nghiệm thu của giai đoạn (plan mục 9)

- [x] Watchlist phát hiện đúng thay đổi trên một trang văn bản luật trong vòng 24 giờ.
- [x] File export mở lại được và khôi phục được vào branch mới.

## Bằng chứng nghiệm thu

- Watchlist: cron hằng ngày chạy 01:00 UTC; chạy thật với trang `luatvietnam.vn/doanh-nghiep/luat-doanh-nghiep-2014-852-19301-article.html` trên Neon staging — lần đầu lưu mốc, lượt sau phát hiện thay đổi, ghi `changes` và thông báo `in_app`. Chưa chờ đủ 24 giờ thực; đường phát hiện được kiểm bằng nội dung mô phỏng trên trang thật.
- Export: `backups/2026-10-31.json.gz` từ staging; tạo branch Neon `phase4-restore-check`, áp migration, restore đủ 10 bản ghi mẫu; branch và object thử đã xoá.

## Nhánh

Giai đoạn 4 làm trên nhánh `phase-4`, tách từ `main` sau khi Giai đoạn 3 đóng ở commit `73860fb`.
