# Giai đoạn 1 — Thu thập và đọc

**Kết luận về scope:** lớn. Plan mục 9 gồm 7 hạng mục cho 1–2 tuần, nên tách thành 9 việc độc lập. Mỗi việc có một file checklist trong thư mục này và một ticket trong project Jira `RH`, tất cả nằm dưới epic [RH-1](https://nghiaasi4n-1.atlassian.net/browse/RH-1).

| # | Việc | Ticket | Ước lượng | Phụ thuộc |
|---|---|---|---|---|
| T1 | Bảng `sources`, `documents`, `jobs` kèm `idem_key` và lease | [RH-2](https://nghiaasi4n-1.atlassian.net/browse/RH-2) | 1 ngày | — |
| T2 | Guard dùng chung cho mọi route đốt hạn mức | [RH-3](https://nghiaasi4n-1.atlassian.net/browse/RH-3) | 0,5 ngày | T1 |
| T3 | Nối `/api/ingest`: tạo `documents` và `jobs` sau khi ký URL | [RH-4](https://nghiaasi4n-1.atlassian.net/browse/RH-4) | 1 ngày | T1, T2 |
| T4 | Fetcher HTML tĩnh bằng HTTP + Readability | [RH-5](https://nghiaasi4n-1.atlassian.net/browse/RH-5) | 2 ngày | T3 |
| T5 | Fetcher PDF bằng pdf.js | [RH-6](https://nghiaasi4n-1.atlassian.net/browse/RH-6) | 2 ngày | T3 |
| T6 | Upload file lớn: multipart và chia nhiều job dưới 300 giây | [RH-7](https://nghiaasi4n-1.atlassian.net/browse/RH-7) | 1,5 ngày | T3 |
| T7 | Đọc file từ Object Storage bằng luồng | [RH-8](https://nghiaasi4n-1.atlassian.net/browse/RH-8) | 1 ngày | T4, T5 |
| T8 | Viewer tài liệu: Markdown sạch, highlight, mục lục, lưu vị trí | [RH-9](https://nghiaasi4n-1.atlassian.net/browse/RH-9) | 2 ngày | T4, T5 |
| T9 | Chống trùng bằng hash nội dung và gộp nguồn trùng | [RH-10](https://nghiaasi4n-1.atlassian.net/browse/RH-10) | 1 ngày | T3 |

## Thứ tự làm

1. T1 và T2 trước: mọi việc sau đều ghi vào ba bảng và đi qua guard.
2. T3 để có đường ingest thật, rồi T4 và T5 song song vì hai loại nguồn khác nhau.
3. T6, T7, T9 làm sau khi T4/T5 chạy được trên file nhỏ.
4. T8 làm cuối vì cần Markdown sạch từ T4/T5 mới kiểm được.

## Nghiệm thu của giai đoạn (plan mục 9)

- [ ] Dán một URL và một PDF dưới 4.5 MB, đọc được bản sạch.
- [ ] Ingest một tài liệu không vượt 300 giây.
- [ ] Ingest 50 tài liệu liên tiếp không lỗi.
- [x] PDF lớn hơn 4.5 MB upload bằng multipart rồi ingest xong qua nhiều job.
- [ ] Request thiếu session hợp lệ hoặc vượt rate limit bị từ chối và không gọi model.

## Nhánh

Giai đoạn 1 làm trên nhánh `phase-1`, tách từ `main` sau khi Giai đoạn 0 đóng ở commit `8a1e0d7`.
