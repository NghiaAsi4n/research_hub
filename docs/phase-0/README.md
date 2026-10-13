# Giai đoạn 0 — Khung và deploy rỗng

Trạng thái: **đã xong**. Nhánh `phase-0`, commit `8a1e0d7`. Mười việc dưới đây đã ở trạng thái Done trong Jira, cùng nằm dưới epic [RH-11](https://nghiaasi4n-1.atlassian.net/browse/RH-11).

| # | Việc | Ticket | Trạng thái |
|---|---|---|---|
| T1 | Khung monorepo pnpm (apps/web, packages/core, packages/pipeline) | [RH-12](https://nghiaasi4n-1.atlassian.net/browse/RH-12) | Done |
| T2 | Project Neon Singapore: pgvector, Managed Better Auth, migration đầu tiên | [RH-13](https://nghiaasi4n-1.atlassian.net/browse/RH-13) | Done |
| T3 | Object Storage và hàm ký URL upload | [RH-14](https://nghiaasi4n-1.atlassian.net/browse/RH-14) | Done |
| T4 | Biome, Vitest, Playwright và CI | [RH-15](https://nghiaasi4n-1.atlassian.net/browse/RH-15) | Done |
| T5 | env.ts validate bằng Zod, fail-fast | [RH-16](https://nghiaasi4n-1.atlassian.net/browse/RH-16) | Done |
| T6 | Deploy Vercel Hobby, region sin1 và tắt Deployment Protection | [RH-17](https://nghiaasi4n-1.atlassian.net/browse/RH-17) | Done |
| T7 | Chốt 1024 chiều và đưa EMBED_DIM vào cấu hình dùng chung | [RH-18](https://nghiaasi4n-1.atlassian.net/browse/RH-18) | Done |
| T8 | Khung UI: layout, dark mode, design token, sáu trang | [RH-19](https://nghiaasi4n-1.atlassian.net/browse/RH-19) | Done |
| T9 | Guard requireUser kèm rate limit | [RH-20](https://nghiaasi4n-1.atlassian.net/browse/RH-20) | Done |
| T10 | Đóng đăng ký công khai | [RH-21](https://nghiaasi4n-1.atlassian.net/browse/RH-21) | Done |

## Nghiệm thu của giai đoạn (plan mục 8)

- [x] URL Vercel trả về trang chủ thật — HTTP 200 trên alias theo nhánh `main`.
- [x] Kết nối được Neon — `/api/health` trả `{"ok":true,"auth":true,"cron":true,"storage":true}`.
- [x] Upload thử một file qua URL ký sẵn thành công — PUT 200 rồi GET 200 đọc lại đúng nội dung, sau đó xoá đối tượng thử.
- [x] CI xanh — check `verify` `completed | success`.
- [ ] Còn lại, không chặn: kiểm ở Dashboard Vercel chỉ còn một project gắn repo `NghiaAsi4n/research_hub`.

## Nhánh

Giai đoạn 0 nằm ở nhánh `phase-0`, cùng commit `8a1e0d7` với `main`; quy ước mỗi giai đoạn một nhánh `phase-<số>`.
