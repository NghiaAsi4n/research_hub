# Giai đoạn 6 — Bản tin hằng ngày

**Kết luận về scope:** vừa, khoảng 1 tuần theo plan mục 8 và mục 13. Epic Jira [RH-48](https://nghiaasi4n-1.atlassian.net/browse/RH-48) với 5 ticket.

| # | Việc | Ticket | Trạng thái |
|---|---|---|---|
| T1 | SSI FastConnect và bảng `quotes` | [RH-49](https://nghiaasi4n-1.atlassian.net/browse/RH-49) | Mã + test xong; live chờ khoá SSI |
| T2 | Nguồn tin Hacker News và RSS | [RH-50](https://nghiaasi4n-1.atlassian.net/browse/RH-50) | Xong; live Hacker News 10 mục |
| T3 | Mẫu bản tin Slack và email | [RH-51](https://nghiaasi4n-1.atlassian.net/browse/RH-51) | Xong |
| T4 | Gửi Slack/Resend, khử trùng, nối cron | [RH-52](https://nghiaasi4n-1.atlassian.net/browse/RH-52) | Mã + test xong; live chờ webhook/khoá |
| T5 | Chạy thử đầu-cuối | [RH-53](https://nghiaasi4n-1.atlassian.net/browse/RH-53) | Một phần; xem phần bị chặn |

## Nghiệm thu của giai đoạn

- [ ] Cron chạy đúng một lần mỗi ngày và gửi bản tin có cả tin công nghệ lẫn chứng khoán VN.
- [x] Bản tin có nguồn và dòng miễn trừ; không tái phân phối dữ liệu thị trường.

## Phần bị chặn

Thiếu ba bộ thông tin đăng nhập nên chưa thể chạy nghiệm thu thật:

- `SSI_CONSUMER_ID`/`SSI_CONSUMER_SECRET`: chưa có tài khoản SSI đăng ký FastConnect, nên chưa lấy được chỉ số/rổ mã.
- `SLACK_WEBHOOK_URL`: chưa có webhook nên kênh Slack bỏ qua.
- `RESEND_API_KEY` + `BRIEFING_EMAIL_TO`: chưa có khoá nên kênh email bỏ qua.

Khi có đủ, chạy `GET /api/cron/briefing` với header `Authorization: Bearer <CRON_SECRET>` để kiểm tra một lượt thật.

## Nhánh

Làm trên nhánh `phase-6`, tách từ `main` tại `70761ca` (sau khi Phase 5 đóng).
