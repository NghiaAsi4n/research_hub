# Giai đoạn 5 — Cứng hoá

**Kết luận về scope:** vừa, 3–5 ngày theo plan mục 9. Chia thành 5 việc, mỗi việc một ticket trong project Jira `RH`, dưới epic [RH-42](https://nghiaasi4n-1.atlassian.net/browse/RH-42).

| # | Việc | Ticket | Ước lượng | Phụ thuộc |
|---|---|---|---|---|
| T1 | Đo dung lượng DB/Object Storage, cảnh báo 70% hạn mức | [RH-43](https://nghiaasi4n-1.atlassian.net/browse/RH-43) | 1 ngày | Giai đoạn 0–1 |
| T2 | Diễn tập khôi phục một lệnh, đo thời gian dưới 15 phút | [RH-44](https://nghiaasi4n-1.atlassian.net/browse/RH-44) | 1 ngày | T3 Giai đoạn 4 |
| T3 | Rà và siết guard: rate limit, allowlist model/nguồn | [RH-45](https://nghiaasi4n-1.atlassian.net/browse/RH-45) | 0,5 ngày | Giai đoạn 1 |
| T4 | Chặn khoá bí mật trong settings, export, log và run_steps | [RH-46](https://nghiaasi4n-1.atlassian.net/browse/RH-46) | 1 ngày | Giai đoạn 4 |
| T5 | Kiểm tra quyền Object Storage và trạng thái 2FA | [RH-47](https://nghiaasi4n-1.atlassian.net/browse/RH-47) | 1 ngày | Giai đoạn 0 |

## Thứ tự làm

1. T1 và T5 đo đúng hiện trạng trước khi siết.
2. T3 siết guard và allowlist; T4 chặn bí mật ở các đường ghi.
3. T2 đo lại khôi phục sau khi các thay đổi đã ổn định.

## Nghiệm thu của giai đoạn (plan mục 9)

- [x] Xoá branch dev và khôi phục dữ liệu trong 15 phút bằng một lệnh.
- [x] Không có khoá bí mật nào xuất hiện trong log.

## Bằng chứng nghiệm thu

- Khôi phục: `backup:drill` chạy trên branch `phase5-drill` mới, tổng 2,971 giây (export 1.407 ms, restore 487 ms, đối chiếu 1.067 ms), không lệch bảng nào; branch thử đã xoá.
- Bí mật: bộ quét khoá chặn export và `run_steps` trước khi ghi; test xác nhận thông báo lỗi không chứa giá trị khoá, `settings` không nằm trong export, log guard chỉ có route/reason.
- 2FA: chưa bật được vì Managed Better Auth không có plugin two-factor; xem `t5-storage-va-2fa.md` — đây là phần bị chặn, không tính là đạt.

## Nhánh

Giai đoạn 5 làm trên nhánh `phase-5`, tách từ `main` sau khi Giai đoạn 4 đóng ở commit `0072d6c`.
