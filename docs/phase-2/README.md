# Giai đoạn 2 — Chỉ mục và chat có trích dẫn

**Kết luận về scope:** vừa. Plan mục 9 gồm 6 hạng mục cho khoảng 1 tuần, tách thành 6 việc độc lập. Mỗi việc có một file checklist trong thư mục này và một ticket trong project Jira `RH`, tất cả nằm dưới epic [RH-22](https://nghiaasi4n-1.atlassian.net/browse/RH-22).

| # | Việc | Ticket | Ước lượng | Phụ thuộc |
|---|---|---|---|---|
| T1 | Chunking theo cấu trúc tài liệu, overlap có kiểm soát | [RH-23](https://nghiaasi4n-1.atlassian.net/browse/RH-23) | 1 ngày | Giai đoạn 1 |
| T2 | Sinh embedding `qwen3-embedding` theo batch, cache theo hash chunk | [RH-24](https://nghiaasi4n-1.atlassian.net/browse/RH-24) | 1,5 ngày | T1 |
| T3 | Tìm kiếm lai full-text `simple`+`unaccent` và vector HNSW, hợp nhất RRF | [RH-25](https://nghiaasi4n-1.atlassian.net/browse/RH-25) | 1,5 ngày | T2 |
| T4 | Chat streaming qua AI SDK với `citations[]` bấm được | [RH-26](https://nghiaasi4n-1.atlassian.net/browse/RH-26) | 1,5 ngày | T3 |
| T5 | Bộ 30 câu hỏi vàng đo độ chính xác trích dẫn | [RH-27](https://nghiaasi4n-1.atlassian.net/browse/RH-27) | 1 ngày | T4 |
| T6 | Reindex khi đổi model embedding qua `jobs` + lease | [RH-28](https://nghiaasi4n-1.atlassian.net/browse/RH-28) | 1 ngày | T2 |

## Thứ tự làm

1. T1 trước: chưa có chunk thì không có gì để nhúng hay tìm.
2. T2 sinh vector cho chunk, rồi T3 dựng đường tìm kiếm lai trên cả `tsv` và `embedding`.
3. T4 nối chat có trích dẫn trên nền T3; T5 đo độ chính xác sau khi T4 chạy được.
4. T6 làm cuối vì chỉ cần khi đổi model embedding.

## Nghiệm thu của giai đoạn (plan mục 9)

- [ ] Từ 80% câu trả lời trở lên có ít nhất một trích dẫn trỏ đúng đoạn nguồn.
- [ ] Khi hệ thống đã ấm, token đầu tiên về dưới 5 giây.
- [ ] Lần đầu sau thời gian rảnh: UI hiện trạng thái đang chờ trong lúc chờ đánh thức model.

## Nhánh

Giai đoạn 2 làm trên nhánh `phase-2`, tách từ `phase-1` sau khi Giai đoạn 1 đóng ở commit `547ef2d`.
