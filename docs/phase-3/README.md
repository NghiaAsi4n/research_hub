# Giai đoạn 3 — Deep research

**Kết luận về scope:** lớn. Plan mục 9 gồm 6 hạng mục cho 1–2 tuần, tách thành 6 việc độc lập. Mỗi việc có một file checklist trong thư mục này và một ticket trong project Jira `RH`, dưới epic [RH-29](https://nghiaasi4n-1.atlassian.net/browse/RH-29).

| # | Việc | Ticket | Ước lượng | Phụ thuộc |
|---|---|---|---|---|
| T1 | Orchestrator máy trạng thái plan/search/read/reflect/synthesize | [RH-30](https://nghiaasi4n-1.atlassian.net/browse/RH-30) | 2 ngày | Giai đoạn 2 |
| T2 | Cursor và ngân sách 240 giây, chạy tiếp sau khi bị cắt | [RH-31](https://nghiaasi4n-1.atlassian.net/browse/RH-31) | 1,5 ngày | T1 |
| T3 | Lease và idempotency cho `runs` | [RH-32](https://nghiaasi4n-1.atlassian.net/browse/RH-32) | 1,5 ngày | T2 |
| T4 | Tuần tự hoá lời gọi Ollama qua một slot chung | [RH-33](https://nghiaasi4n-1.atlassian.net/browse/RH-33) | 1 ngày | T1 |
| T5 | Báo cáo Markdown có mục nguồn và câu từ chối kết luận | [RH-34](https://nghiaasi4n-1.atlassian.net/browse/RH-34) | 1,5 ngày | T1 |
| T6 | Bảng tiêu thụ hạn mức theo run và cảnh báo | [RH-35](https://nghiaasi4n-1.atlassian.net/browse/RH-35) | 1 ngày | T1 |

## Thứ tự làm

1. T1 dựng máy trạng thái và hợp đồng từng bước; mọi việc sau bám vào đó.
2. T2 và T3 lo phần chạy tiếp và chống trùng khi lượt gọi bị cắt hoặc lặp.
3. T4 đặt hàng đợi một slot cho mọi lời gọi ra Ollama (chat dùng chung).
4. T5 sinh báo cáo từ các bước đã chạy; T6 đếm và cảnh báo hạn mức.

## Nghiệm thu của giai đoạn (plan mục 9)

- [ ] Một câu hỏi phức tạp cho ra báo cáo từ 5 nguồn trở lên — đã có test tự động với 6 nguồn; chưa chạy live vì chưa có endpoint model khả dụng.
- [x] Hoàn tất trong ngân sách phiên đã khai báo, không giới hạn số lượt gọi function.
- [x] Chạy tiếp đúng chỗ sau khi bị cắt ở giây 300.
- [x] Chạm trần ngân sách thì dừng cứng, trả báo cáo một phần kèm lý do.
- [ ] Không phát sinh chi phí (chỉ dùng hạn mức miễn phí) — thiết kế chỉ dùng nhà cung cấp miễn phí hiện có; chưa đo bằng lượt chạy live.

## Nhánh

Giai đoạn 3 làm trên nhánh `phase-3`, tách từ `phase-2` sau khi Giai đoạn 2 đóng ở commit `70e783d`.
