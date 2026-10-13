# Research Hub — Kế hoạch triển khai, bản chốt stack free

Ngày chốt: 09/10/2026
Phiên bản: v2. Bản này thay thế bản self-host ở lượt trước; phần nào bản cũ còn đúng thì giữ nguyên.

---

## 1. Tóm tắt

Research Hub là một ứng dụng web cá nhân để thu thập, chuẩn hoá, lập chỉ mục và truy vấn mọi nguồn thông tin, chạy hoàn toàn trên các gói miễn phí. Chi phí 0 USD không phải mục tiêu của giai đoạn đầu mà là ràng buộc cố định: kế hoạch không có đường trả tiền nào, kể cả khi chạm trần.

Nguyên tắc giữ nguyên từ v1:

- Dữ liệu thuộc về người dùng.
- Không có kết luận nào thiếu trích dẫn trỏ về đoạn nguồn.
- Không khoá vào một nhà cung cấp model hay một nhà cung cấp hạ tầng.
- Mỗi phiên nghiên cứu có trần hạn mức cứng, và trần đó luôn nằm trong phần miễn phí.

Thay đổi lớn so với v1: bỏ toàn bộ phần hạ tầng tự vận hành (VPS, Docker Compose production, MinIO, pg-boss, Langfuse self-host, SearXNG), thay bằng bốn nguồn miễn phí (Vercel, Neon, Ollama Cloud, Workers AI) cộng bốn kênh gửi miễn phí (Slack Incoming Webhook, Resend cho email, Telegram, chuông trong app), và một kiến trúc job không cần worker thường trực.

---

## 2. Quyết định đã chốt

| Hạng mục | Chốt | Căn cứ |
|---|---|---|
| Nền tảng web + API | Vercel Hobby | Miễn phí, function chạy tối đa 300 giây, không cần quản trị máy chủ |
| Nguyên tắc chi phí | 0 USD ở mọi tầng, không có đường trả tiền nào trong luồng chạy | Chạm trần thì chờ reset, chuyển nhà cung cấp, hoặc chuyển sang chế độ chạy máy; không mua thêm |
| Cơ sở dữ liệu | Neon Free (Postgres) | 1 GB/project, 100 CU-hrs/tháng, tự scale về 0 khi rảnh, có sẵn pgvector |
| Lưu file gốc | Neon Object Storage | 5 GB kèm gói free, cùng nhà cung cấp với DB nên giảm một mối phụ thuộc |
| Model ngôn ngữ | Khi chạy trên Vercel, chuỗi dự phòng có hai mắt xích: Ollama Cloud free, rồi Workers AI free. Ollama local là chế độ chạy riêng (mục 12.2), không nằm trong chuỗi này | Function Vercel không gọi được Ollama trên máy bạn. Cả ba nguồn vẫn không tốn tiền: Ollama có lượng dùng khởi điểm theo tháng cho nhóm starter models và reset hằng tháng; Workers AI cho 10.000 neurons mỗi ngày; model local không có trần và không gửi dữ liệu đi đâu, nhưng phải tự chạy pipeline trên máy |
| Tìm kiếm web cho agent | `web_search` + `web_fetch` của Ollama Cloud | Có sẵn trong tài khoản free, gọi được ngay từ agent, không phải chạy container |
| Tìm kiếm độc lập | Hoãn; đặt sau interface `SearchProvider` | SearXNG cần một máy luôn bật, chỉ đáng làm khi có VM |
| Xác thực | Neon Managed Better Auth | Kèm gói free tới 60k MAU, tự động hoá, chạy cùng region với DB. Đánh đổi: phụ thuộc Neon; đường lùi là tự chạy better-auth trong app vì đây cũng chính là thư viện nền |
| Đăng ký | Đóng; chỉ một tài khoản chủ | Hạn mức miễn phí là tài sản cần bảo vệ, mở đăng ký nghĩa là người lạ đốt hạn mức. Neon Auth chỉ dùng cho phiên đăng nhập của chủ tài khoản |
| Region | Vercel `sin1` và Neon `aws-ap-southeast-1`, cùng ở Singapore | Function đặt cùng thành phố với DB để giảm độ trễ mỗi truy vấn, và gần Việt Nam hơn mặc định `iad1` |
| Embedding | Gọi `qwen3-embedding` qua API embed của Ollama Cloud từ trong function, số chiều cố định 1024; Ollama local chỉ dùng ở chế độ chạy máy (mục 12.2) | Ingest và truy vấn đều chạy trong function nên không gọi được máy bạn. Vì ràng buộc dùng đúng một model cho cả lúc ghi chỉ mục lẫn lúc truy vấn, cả hai đầu dùng chung `qwen3-embedding`; đổi model là phải sinh lại toàn bộ chỉ mục |
| Chạy việc nền | Không có worker thường trực; bảng `jobs` được nhặt bởi Vercel Cron, client tick, hoặc tiến trình ở chế độ chạy máy | Cron Hobby chỉ chạy một lần mỗi ngày nên không thể là nhịp chạy của agent; ba actor này dùng chung lease ở mục 7.2 nên không nhặt trùng |
| Quan sát | Bảng `run_steps` + log có cấu trúc | Log Hobby giữ 1 giờ, không đủ để tra cứu lịch sử, nên chi phí và bước chạy phải nằm trong DB |
| Gửi thông báo | Bốn kênh: chuông trong app, Telegram, Slack Incoming Webhook, Resend email | Cả bốn đều miễn phí và chỉ là một HTTP POST ở tầng gửi. App và Telegram có sẵn từ Giai đoạn 4, Slack và Resend bật ở Giai đoạn 6. Webhook URL và khoá Resend để ở biến môi trường, không lưu trong DB |
| Môi trường phát triển | Branch của Neon, không cần Docker ở máy | 10 branch/project trên gói free, tách dữ liệu dev khỏi dữ liệu thật |

---

## 3. Kiến trúc

```text
Người dùng (trình duyệt)
        |
        v
Vercel Hobby — Next.js 16 (App Router)
  ├── UI: chat, đọc tài liệu, notes, watchlist, báo cáo
  ├── Route Handlers: /api/ingest, /api/research, /api/chat, /api/tick, /api/embed, /api/cron (kiểm `CRON_SECRET`)
  └── Orchestrator: planner -> searcher -> reader -> synthesizer
        |                    (AI SDK 7, ngân sách cứng, trần 240 giây mỗi lượt)
        |
        ├──> Tầng model miễn phí, dự phòng theo thứ tự:
        │      1. Ollama Cloud free: model + web_search + web_fetch (hạn mức tháng)
        │      2. Workers AI free: 10.000 neurons/ngày khi hạn mức trên cạn
        │      3. Ollama local: chỉ ở chế độ chạy máy (mục 12.2), function không gọi được
        |
        └──> Neon: Postgres + pgvector (metadata, chunk, vector)
                   Object Storage (PDF, ảnh, audio gốc)
                   Cron 1 lần/ngày (watchlist, bản tin, export sao lưu)
                   Kênh gửi: Slack Incoming Webhook, Resend email, Telegram, chuông trong app
```

Sáu ranh giới bắt buộc:

1. Nội dung lấy từ bên ngoài chỉ là dữ liệu, không bao giờ là chỉ thị.
2. Tool của agent nằm trong allowlist, không truy cập khoá bí mật.
3. Mọi phiên research có trần token, trần thời gian và trần số bước, dừng cứng khi vượt.
4. Mọi lời gọi model và tìm kiếm đi qua một interface duy nhất, đổi nhà cung cấp không phải sửa tầng domain.
5. Mọi route đốt hạn mức (model, tìm kiếm, ingest) bắt buộc xác thực và rate limit ngay từ route đầu tiên; riêng route cho cron phải kiểm `CRON_SECRET` nên không gọi được từ ngoài.
6. Đăng ký đóng: chỉ tài khoản chủ được tạo, không mở luồng đăng ký công khai.

---

## 4. Điều kiện biên của gói free và hệ quả thiết kế

| Ràng buộc | Số liệu | Hệ quả thiết kế |
|---|---|---|
| Cron Vercel Hobby | Tối thiểu một lần mỗi ngày; biểu thức chạy dày hơn sẽ lỗi khi deploy | Cron chỉ dùng cho ba việc nhịp ngày: watchlist, bản tin (mục 13) và export sao lưu. Tiến trình research do người dùng hoặc client thúc |
| Thời lượng function | Hobby tối đa 300 giây (mặc định 300 giây khi bật Fluid compute) | Mỗi lượt gọi function tự bó trong khoảng 240 giây; một phiên research chạy nhiều lượt, lưu trạng thái và chạy tiếp ở lượt sau, số lượt không bị giới hạn |
| Kích thước body | 4.5 MB cho request và response | Upload đi thẳng lên Object Storage bằng URL ký sẵn, không đẩy qua function. File hơn 4.5 MB dùng multipart upload (URL ký sẵn cho từng phần), object tối đa 5 GiB |
| Bộ nhớ function | Hobby 2 GB / 1 vCPU | Không nhúng model embedding hay Chromium vào function; mọi lời gọi model và embedding đi qua API, trừ chế độ chạy máy ở mục 12.2 |
| Vị trí chạy | Function Vercel ở Singapore, không có đường vào máy người dùng | Mọi phụ thuộc phải là dịch vụ công khai (Postgres, Object Storage, API model). Ollama local chỉ dùng được ở chế độ chạy máy ở mục 12.2 |
| Neon storage | 1 GB Postgres mỗi project, 20 GB tổng tài khoản | Khoảng 2.000 tài liệu cỡ 50 trang, phép tính ở mục 6.1. Đếm dung lượng khi người dùng bấm hoặc trong cron ngày, cảnh báo ở 70% |
| Neon compute | 100 CU-hrs/tháng (đủ 0,25 CU chạy 400 giờ), autoscale tới 2 CU, scale về 0 sau 5 phút rảnh | Phép tính ở mục 6.2. Chấp nhận độ trễ cho request đầu sau thời gian rảnh; giữ kết nối pool, cấm truy vấn nền theo timer |
| Neon sao lưu | Không có scheduled backup và không có instant restore trên gói Free; history window 6 giờ, tối đa 1 GB thay đổi; 1 snapshot thủ công | Cron hằng ngày phải tự export logic ra Object Storage, giữ nhiều bản theo ngày |
| Neon log | 1 ngày | Số liệu chi phí và vết chạy phải lưu trong DB, không dựa vào log nền tảng |
| Ollama free | 1 request đồng thời, chỉ mở starter models, có starter credits | Hàng đợi phải tuần tự hoá: một phiên research chạy tại một thời điểm |
| Ollama giá | Off-peak ngoài 12:00–18:00 UTC ngày thường và cả ngày cuối tuần | Khung giờ đắt theo giờ Việt Nam là 19:00–01:00. Việc nặng nên hẹn ban ngày hoặc cuối tuần |
| Ollama API | Chat tối đa theo model; `web_search` mặc định 5, tối đa 10 kết quả | Số vòng tìm kiếm phải tính theo trần 10 kết quả mỗi lần gọi |
| Vercel log runtime | 1 giờ trên Hobby | Gỡ lỗi phải dựa vào bảng `run_steps`, không dựa vào log |
| Resend Free | 100 email/ngày, 3 domain riêng, có REST API và SMTP relay, giữ log 30 ngày | Bản tin chỉ cần một email mỗi ngày nên dư hạn mức; vượt thì gộp lại hoặc chờ sang ngày |
| Slack Incoming Webhook | Miễn phí cho workspace thông thường, không có trần cứng theo tin | Kênh chính cho bản tin; nếu workspace đổi chính sách thì rơi về Telegram hoặc chuông trong app |
| Region của Neon | Postgres có ở mọi region; Object Storage và Functions có ở Singapore; AI Gateway cần gói trả phí | Chọn Singapore thì Object Storage dùng được mà không phải lên gói trả phí |
| Ghim region | Region ghim lúc tạo project và không đổi được | Phải tạo project Neon ở Singapore ngay từ đầu, không sửa lại được |
| Embedding | `/api/embed` trả vector đã chuẩn hoá L2; số chiều tuỳ model, thường 384–1024; `qwen3-embedding` cho tự đặt trong khoảng 32–4096 | Chốt `EMBED_DIM = 1024` ở giai đoạn 0 rồi không đổi; phải dùng cùng model cho cả lúc ghi chỉ mục lẫn lúc truy vấn, và model đó phải gọi được từ function nên mặc định đi qua API |
| Ollama hạn mức | Gói free có lượng dùng khởi điểm theo tháng cho nhóm starter models, dùng hết thì reset theo tháng; mức cụ thể không công bố | Phải đọc số thật ở trang usage và ghi lại; cả luồng nghiên cứu phải chịu được việc hết hạn mức giữa tháng |
| Ollama đơn giá model | Tính theo token: `gemma4` $0,14 mỗi triệu token vào, $0,05 nếu vào đã cache, $0,40 mỗi triệu token ra; bảng giá đầy đủ ở ollama.com/pricing | Chỉ đưa vào chuỗi những model gọi được trên gói Free: `gemma4:31b`, `gpt-oss:20b`, `nemotron-3-nano:30b`, `nemotron-3-super`. `glm-5.3-flash`, `deepseek-v4.1-flash` và `minimax-m2.7` trả `402` dù có tên trong danh sách model của tài khoản |
| Workers AI free | 10.000 neurons mỗi ngày, reset 00:00 UTC tức 07:00 giờ Việt Nam; một số model cao cấp bắt buộc trả tiền | Chỉ dùng nhóm model mở. Model 1B cho khoảng 4 triệu token đầu vào mỗi ngày, model 70B chỉ khoảng 0,37 triệu |
| Gemini API free | Miễn phí cho một số model, nhưng nội dung được dùng để cải thiện sản phẩm của Google | Không đưa vào mặc định. Nếu có dùng thì chỉ với nội dung công khai, tuyệt đối không dùng cho tài liệu nội bộ |

---

## 5. Tech stack

| Lớp | Lựa chọn | Phiên bản đã xác minh ngày 09/10/2026 |
|---|---|---|
| Runtime | Node.js 24 LTS | 24.21.0 |
| Ngôn ngữ | TypeScript | 7.0.2 |
| Framework | Next.js, App Router | 16.4.0 |
| UI | React | 19.3.0 |
| Styling | Tailwind CSS + shadcn/ui + Lucide | 4.3.3 |
| Build phụ trợ | Vite | 8.3.4 |
| AI | Vercel AI SDK (`ai`) | 7.0.136 |
| Validation | Zod | 4.6.5 |
| ORM | Drizzle ORM + drizzle-kit | 0.45.4 |
| DB | Neon Postgres + pgvector | dòng stable hiện hành |
| Xác thực | Neon Managed Better Auth, nền là thư viện better-auth | 1.7.7 |
| Test | Vitest / Playwright | 5.0.3 / 1.64.0 |
| Lint và format | Biome | bản ổn định hiện hành |
| Email giao dịch | Resend, gói Free | SDK Node hiện hành; chỉ gọi REST API, không cần SMTP |

Bỏ khỏi stack so với v1: pg-boss, MinIO, Redis, Langfuse self-host, VPS, Docker Compose production.

---

## 6. Mô hình dữ liệu

```sql
sources(id, kind, url, domain, lang, trust_score, created_at)
documents(id, source_id, title, author, published_at, storage_key, hash, status, bytes, meta jsonb)  -- bản Markdown sạch để ở Object Storage, không lưu trong DB
chunks(id, document_id, ord, text, token_count, embed_model, tsv tsvector, embedding vector(1024))  -- EMBED_DIM = 1024; embed_model ghi model đã sinh vector
collections(id, name) / collection_items(collection_id, document_id)
notes(id, title, body_md, doc_id, created_at) / note_links(from_note, to_note)
runs(id, kind, question, status, plan jsonb, cursor jsonb, budget_units, used_units, expires_at, started_at, ended_at, lease_owner, lease_expires_at, attempt)
run_steps(id, run_id, ord, type, state, idem_key, input jsonb, output jsonb, tokens, units, ms)
citations(id, run_id, chunk_id nullable, source_id nullable, quote, start_offset, end_offset, url)  -- check: chunk_id hoặc url phải có
quotes(symbol, ts, open, high, low, close, volume, source)  -- chuỗi giá theo ngày; chỉ số cũng là một mã; unique (symbol, ts, source) để crawl lại không chèn trùng
notifications(id, kind, channel, payload_digest, sent_at)  -- sổ gửi: mỗi bản tin một dòng để không gửi trùng
watchlist(id, query, sources jsonb, cadence, last_seen_at) / changes(id, watchlist_id, diff)  -- cadence chỉ nhận 'daily' hoặc 'weekly'; mỗi mục không có lịch riêng
jobs(id, type, payload jsonb, idem_key, state, run_at, attempt, lease_owner, lease_expires_at)   -- nhịp: cron ngày + client tick + chế độ chạy máy
settings(key, value jsonb)                               -- ngân sách (đơn vị hạn mức), model mặc định, đếm dung lượng; KHÔNG chứa khoá API

create extension if not exists unaccent;
-- chunks.tsv dùng to_tsvector('simple', unaccent(text)): config mặc định là tiếng Anh, tách từ sai với tiếng Việt
create index on chunks using hnsw (embedding vector_cosine_ops);
create index on chunks using gin (tsv);
create unique index on run_steps (idem_key);
create unique index on jobs (idem_key) where idem_key is not null;
```

Sáu điểm đáng chú ý so với v1:

- `runs.cursor` và `runs.expires_at`: cho phép một phiên research bị cắt ở giây thứ 300 vẫn chạy tiếp đúng chỗ ở lượt sau.
- `documents.storage_key`: file gốc nằm ở Object Storage, DB chỉ giữ khoá và metadata, tránh phình 1 GB.
- `chunks.embedding` ghim 1024 chiều theo `EMBED_DIM`. Đổi model embedding là phải sinh lại toàn bộ vector, nên đây là quyết định khó đảo ngược, phải chốt trước khi nạp dữ liệu thật.
- `runs.lease_owner`, `runs.lease_expires_at` và `runs.attempt`: mỗi lượt resume phải giành lease trước khi chạy, và `attempt` là fencing token để client cũ không ghi đè. Chi tiết ở mục 7.2.
- `notifications` là sổ gửi: mỗi bản tin một dòng theo `channel` và `payload_digest`, để lượt cron chạy lại không gửi trùng.
- `watchlist.cadence` chỉ nhận `daily` hoặc `weekly`, không nhận biểu thức cron tự do: Vercel Hobby chỉ cho cron chạy tối đa một lần mỗi ngày và biểu thức dày hơn sẽ lỗi ngay khi deploy. Mọi mục watchlist dùng chung cron ngày, nên lịch riêng cho từng mục là thứ không tồn tại.

Ràng buộc then chốt: `citations` phải trỏ tới ít nhất một nguồn — `chunk_id` cho đoạn trong kho, hoặc `url` cho nguồn web chưa nạp. Trang web deep research đọc về nhưng không nạp vào kho vẫn trích dẫn được mà không phải sinh embedding cho toàn bộ nội dung đã đọc.

### 6.1 Ngân sách 1 GB (phép tính)

Ước lượng theo một chunk khoảng 800 token:

- `chunks.embedding vector(1024)` = 1024 × 4 byte = 4 KB mỗi chunk; index HNSW thường tốn thêm khoảng 1,5 lần dữ liệu vector, tính tròn 8–10 KB mỗi chunk.
- Phần chữ của chunk (800 token tiếng Việt) khoảng 3–4 KB.
- Vậy mỗi chunk chiếm khoảng 12–14 KB trong DB.

Một tài liệu 50 trang khoảng 100 KB chữ, tức khoảng 40 chunk, chiếm khoảng 0,5 MB. 1 GB chứa được khoảng 2.000 tài liệu cỡ đó, khớp với ước lượng "vài nghìn tài liệu", nhưng chỉ khi không lưu thêm bản sao toàn văn.

Hệ quả thiết kế:

- Không lưu `content_md` trong DB: bản Markdown sạch để ở Object Storage, DB chỉ giữ chunk và `storage_key`. Giữ cả hai thì dung lượng tăng gần gấp đôi và trần thực tế rơi xuống khoảng 1.000 tài liệu.
- Cảnh báo ở 70% (khoảng 700 MB), đo khi người dùng bấm hoặc trong cron ngày, không theo timer.
- Dựng index HNSW tốn CPU và bộ nhớ; nạp xong theo lô rồi mới dựng, không dựng lại toàn bộ thường xuyên.

### 6.2 Ngân sách 100 CU-hrs (phép tính)

Neon Free cho 100 CU-hrs/project/tháng, tương đương 0,25 CU (1 GB RAM) chạy liên tục 400 giờ; compute autoscale tối đa 2 CU (8 GB RAM) nên chạy to hơn thì hết nhanh hơn, và scale về 0 sau 5 phút rảnh.

- Một lượt resume 240 giây ở 0,25 CU = 0,0167 CU-hr. Nếu chỉ có việc đó thì 100 CU-hrs đủ cho khoảng 6.000 lượt.
- Rủi ro thật nằm ở việc đánh thức compute: mỗi lần client tick, mỗi lần đếm dung lượng, mỗi lần cron đều cộng dồn và phá scale-to-zero.

Hệ quả thiết kế:

- Không truy vấn nền theo timer. Đếm dung lượng chỉ chạy khi người dùng bấm hoặc trong cron ngày.
- Client tick có nhịp tối thiểu (không dưới 2 giây mỗi lần) và dừng ngay khi phiên kết thúc để compute về 0.
- Theo dõi CU-hrs song song với trần 1 GB vì đây là điểm gãy thứ hai, không chỉ dung lượng.

---

## 7. Luồng nghiệp vụ

1. Thu thập: người dùng dán URL hoặc chọn file. File đi thẳng lên Object Storage bằng URL ký sẵn, DB nhận `storage_key`, rồi một bản ghi `jobs` được tạo.
2. Ingest: function xử lý một tài liệu mỗi lần gọi, bó trong 300 giây. Việc dài chia thành nhiều `jobs` liên tiếp.
3. Hỏi đáp kho cá nhân: tìm lai full-text và vector, hợp nhất bằng RRF, sinh câu trả lời streaming kèm `citations[]`, UI hiển thị đoạn nguyên văn cạnh câu trả lời.
4. Deep research: planner tạo kế hoạch, searcher gọi `web_search`, reader gọi `web_fetch`, synthesizer viết báo cáo có mục nguồn. Mỗi lượt gọi function ghi `run_steps` và `cursor`; hết thời gian thì client gọi tiếp `/api/research?resume=`.
5. Ghi chú: chèn trích dẫn từ phiên chat, liên kết hai chiều, xuất Markdown, PDF, DOCX.
6. Watchlist: một cron hằng ngày quét toàn bộ danh sách theo dõi, so diff, thông báo. Đây là việc đúng khớp với giới hạn một lần mỗi ngày.

### 7.1 Phiên research là gì

Một phiên research là một dòng trong `runs`, ứng với đúng một câu hỏi, và bị chặn bằng ngân sách cứng của phiên chứ không bằng một số lượt gọi function cố định. Ngân sách gồm ba trần, lưu trong `runs.plan`:

1. Trần số bước agent (planner, search, read, reflect, synthesize).
2. Trần hạn mức model cho cả phiên (token hoặc credit của nhà cung cấp đang chạy).
3. Trần tổng thời gian của cả phiên, cộng dồn qua các lượt, tách khỏi trần 240 giây của một lượt gọi function.

Giá trị cụ thể của trần thứ hai, chốt ngày 11/10/2026 và bám số đo thật:

- **Trần hạn mức model: 200.000 token cho cả phiên.** Một phiên cỡ vừa gồm 1 bước planner, 8 bước search/read, 4 bước reflect và 1 bước synthesize, ước tính khoảng 178.000 token vào cộng 7.000 token ra khi ngữ cảnh tích luỹ từ 4.000 lên 24.000 token. Với `gemma4:31b` ở đơn giá $0,14 mỗi triệu token vào và $0,40 mỗi triệu token ra, một phiên đầy trần tốn khoảng **$0,028**. Số này đối chiếu được với thực tế: tài khoản đã dùng 7.737 token vào và 62 token ra, `/api/usage` báo `usage_usd = 0,00112`, khớp gần tuyệt đối với bảng giá công bố.
- **Đếm bằng số thật, không ước lượng giữa chừng:** cộng `run_steps.tokens` vào `runs.used_units` sau mỗi bước và kiểm tra ở đầu mỗi lượt trước khi gọi model. Chạm 200.000 token thì dừng cứng với lý do `budget_exhausted` như cách kết thúc số 2 bên dưới.
- **Chọn model theo bước để hạn mức dàn đều:** bước search/read chạy bằng model rẻ và gọi được trên gói Free (`nemotron-3-super` $0,015 mỗi triệu token vào, `gpt-oss:20b` $0,07/$0,30, `nemotron-3-nano:30b` $0,06/$0,24), chỉ để `gemma4:31b` làm bước tổng hợp cuối.

Phiên chạy qua nhiều lượt gọi function tùy ý: mỗi lượt tự bó trong 240 giây, ghi `run_steps` và `cursor` rồi trả về; lượt sau do client gọi `/api/research?resume=` chạy tiếp đúng chỗ. Số lượt không phải tiêu chí nghiệm thu; tiêu chí là phiên nằm trong ngân sách đã khai báo.

Phiên kết thúc theo một trong ba cách, cả ba đều ghi vào `runs.status`:

1. Hoàn tất: synthesizer phát ra báo cáo đầy đủ.
2. Chạm trần ngân sách: dừng cứng, trả báo cáo một phần kèm lý do `budget_exhausted`, không cố chạy thêm.
3. Quá hạn `runs.expires_at`: bị reaper (cron hằng ngày) đánh dấu `expired`, phần đã làm vẫn xem lại được.

Vì số lượt là tùy ý, một phiên dài có thể trải qua nhiều giờ và nhiều lần client mở lại; do đó phải kiểm tra ngân sách ở đầu mỗi lượt trước khi gọi model, và phải chặn hai client cùng resume một `cursor`.

### 7.2 Lease và idempotency cho jobs và runs

Vấn đề: `jobs` bị cron và client tick cùng nhặt, còn `runs` bị hai tab hoặc một lần retry cùng resume một `cursor`. Không chặn thì hệ quả là gọi model và search trùng, đốt hạn mức miễn phí, và ghi `run_steps` hoặc `citations` trùng.

Nguyên tắc: một chủ sở hữu tại một thời điểm, và mọi bước phải lặp lại an toàn.

**Lease (áp cho cả `jobs` và `runs`)**

- Cột dùng chung: `lease_owner text` (id của cron, client tick, hoặc tiến trình ở chế độ chạy máy), `lease_expires_at timestamptz`, `attempt int`.
- Giành quyền bằng một câu UPDATE có điều kiện (compare-and-set), không đọc rồi ghi:

```sql
update runs
   set lease_owner = $owner,
       lease_expires_at = now() + interval '4 minutes',
       attempt = attempt + 1,
       status = 'running'
 where id = $id
   and status in ('queued','running')
   and (lease_owner is null or lease_expires_at < now())
returning attempt, cursor, plan;
```

- UPDATE trả 0 dòng nghĩa là người khác đang giữ lease: API trả 409 kèm trạng thái hiện tại, client dừng và không retry mù.
- Mọi chỗ nhặt job — cron, client tick, và tiến trình ở chế độ chạy máy — đều dùng `select ... for update skip locked` trong một transaction, nên không hai bên nào nhặt trùng cùng một job.
- TTL lease đặt 4 phút, dài hơn trần 240 giây của một lượt: đây là visibility timeout. Client chết giữa lượt thì lease tự hết hạn để lượt sau hoặc reaper tiếp quản.

**Fencing token**

- `attempt` là số thứ tự lượt và đóng vai fencing token: mỗi lần nhận lease thì tăng một.
- Mọi ghi kết thúc lượt (`cursor`, `run_steps`, `status`) phải kèm điều kiện `and attempt = $attempt`. Nếu lease đã bị thu hồi (attempt đã tăng) thì ghi bị từ chối, client cũ dừng và không ghi đè `cursor` mới hơn.
- Ca này xử lý tình huống client cũ tưởng mình còn giữ lease nhưng lease đã hết hạn do treo mạng.

**Idempotency**

- `run_steps.idem_key` unique, đặt bằng `hash(run_id, ord)`. Trước khi gọi model hoặc search, chèn `run_steps` với `state='pending'` theo `idem_key`; nếu dòng đã tồn tại thì đọc `output` cũ và bỏ qua lời gọi. Khi xong, cập nhật cùng dòng sang `state='done'`.
- Nhờ vậy một bước chỉ chạy một lần dù lượt bị lặp, và lượt resume phát lại các bước đã `done` từ DB thay vì gọi lại API.
- Với job ingest, `jobs.idem_key` unique bằng `hash(type, payload_digest)` để cùng một tài liệu không sinh hai job khi người dùng bấm hai lần.
- Bước đang ở `state='failed'` được thử lại bằng cách cập nhật chính dòng đó về `state='pending'` và tăng một bộ đếm riêng, không chèn dòng mới vì sẽ phạm unique `idem_key`.

**Reaper (lỗ hổng 5)**

- Cron hằng ngày quét, chỉ UPDATE theo điều kiện và không gọi model:
  - `runs` có `lease_expires_at < now()` và `status='running'`: nếu `expires_at` chưa qua thì trả về `queued` để lượt sau resume; nếu đã qua thì đặt `expired`.
  - `jobs` có `lease_expires_at < now()` và `state='running'`: giải phóng lease và đặt lại `queued`; nếu `attempt` đã chạm trần thì đặt `failed`.
- Reaper là lưới an toàn cuối vì cron chỉ chạy một lần mỗi ngày; cơ chế chính vẫn là TTL lease để lượt sau tự thu hồi lease đã hết hạn.

**Ràng buộc kèm theo**

- Số lượt tùy ý ở mục 7.1 nay đi cùng `attempt` tăng dần, nên cần trần an toàn cho `attempt` (ví dụ 50) trên cả `runs` và `jobs`: vượt trần thì đặt `status='failed'` (hoặc `state='failed'`) với lý do `too_many_attempts`, tránh một bug lặp đốt hạn mức vô hạn.
- Kiểm tra ngân sách phiên ở đầu mỗi lượt phải chạy sau khi đã nhận lease, để hai lượt trùng không cùng tiêu ngân sách.

---

## 8. Lộ trình triển khai

### Giai đoạn 0 — Khung và deploy rỗng (2–3 ngày)

1. Khởi tạo monorepo pnpm: `apps/web` (Next.js 16, TypeScript strict), `packages/core` (domain và schema Zod), `packages/pipeline`.
2. Tạo project Neon ở region Singapore, bật pgvector, bật Managed Better Auth, chạy migration đầu tiên bằng drizzle-kit.
3. Bật Object Storage của Neon và viết hàm ký URL upload.
4. Cấu hình Biome, Vitest, Playwright và CI chạy typecheck, lint, test.
5. `env.ts` validate biến môi trường bằng Zod, thiếu khoá thì fail ngay khi khởi động; khai báo sẵn `DATABASE_URL`, `OLLAMA_API_KEY`, `CLOUDFLARE_API_TOKEN`, nhóm `NEON_AUTH_*`, `CRON_SECRET`, `SLACK_WEBHOOK_URL`, `RESEND_API_KEY` và `SSI_API_KEY` (hai khoá cuối để trống tới Giai đoạn 6).
6. Deploy lên Vercel Hobby và ghim region function là `sin1`, cùng thành phố với project Neon.
7. Gọi `/api/embed` một lần để xác nhận vector dài đúng 1024 chiều, ghi `EMBED_DIM` vào cấu hình.
8. Khung UI: layout, dark mode, design token, trang rỗng cho năm mục chính.
9. Guard xác thực dùng chung cho route handler: một hàm `requireUser` bắt buộc session hợp lệ, kèm rate limit cơ bản; mọi route đốt hạn mức ở các giai đoạn sau dùng lại hàm này.
10. Đóng đăng ký: chỉ tài khoản chủ được tạo, tắt luồng sign-up công khai; kiểm bằng cách mở trình duyệt riêng và thử đăng ký.

Nghiệm thu: URL Vercel trả về trang chủ thật, kết nối được Neon, upload thử một file qua URL ký sẵn thành công, CI xanh.

### Giai đoạn 1 — Thu thập và đọc (1–2 tuần)

1. Bảng `sources`, `documents`, `jobs` (kèm `idem_key` và lease) và API `/api/ingest` có xác thực bắt buộc ngay từ route đầu tiên.
2. Guard dùng chung cho mọi route đốt hạn mức: session hợp lệ, rate limit theo user, allowlist model và nguồn; route mới phải đi qua guard ngay khi được tạo, không để sang giai đoạn sau.
3. Fetcher: HTTP cộng Readability cho HTML tĩnh, pdf.js cho PDF. Không nhúng Chromium vào function; trang render bằng JavaScript đi theo đường riêng (dịch vụ render miễn phí hoặc tiến trình local ở mục 12.2), nếu không có thì đánh dấu không đọc được thay vì thử render trong function.
4. Upload file lớn: URL ký sẵn cho từng phần và multipart upload cho file hơn 4.5 MB; tài liệu lớn được chia thành nhiều `jobs` ingest liên tiếp để mỗi lượt nằm trong 300 giây.
5. Đọc file từ Object Storage bằng luồng, không nạp toàn bộ vào bộ nhớ function.
6. Viewer tài liệu: Markdown sạch, highlight, mục lục, lưu vị trí đọc.
7. Chống trùng bằng hash nội dung, gộp nguồn trùng.

Nghiệm thu: dán một URL và một PDF dưới 4.5 MB, đọc được bản sạch; ingest một tài liệu không vượt 300 giây; ingest 50 tài liệu liên tiếp không lỗi; một PDF lớn hơn 4.5 MB upload bằng multipart rồi ingest xong qua nhiều `jobs`; request thiếu session hợp lệ hoặc vượt rate limit bị từ chối và không gọi model.

### Giai đoạn 2 — Chỉ mục và chat có trích dẫn (1 tuần)

1. Chunking theo cấu trúc tài liệu, overlap có kiểm soát.
2. Sinh embedding bằng `qwen3-embedding` gọi qua API embed của Ollama Cloud (xem mục 2 và 6.1), xử lý theo batch, cache theo hash chunk để không tính lại, và ghi `embed_model` lên từng chunk.
3. Tìm kiếm lai: full-text cộng vector HNSW, hợp nhất bằng RRF. Full-text dùng config `simple` kèm `unaccent` thay cho config mặc định tiếng Anh, để tách từ đúng trên văn bản luật tiếng Việt.
4. Chat streaming qua AI SDK, prompt buộc trả `citations[]`, UI bấm được về đúng đoạn nguồn.
5. Bộ 30 câu hỏi vàng để đo độ chính xác trích dẫn.
6. Reindex khi đổi model embedding: quét chunk có `embed_model` khác model hiện tại, sinh lại theo lô qua `jobs` + lease ở mục 7.2, chỉ đổi `EMBED_DIM` sau khi sinh xong toàn bộ.

Nghiệm thu: từ 80% câu trả lời trở lên có ít nhất một trích dẫn trỏ đúng đoạn nguồn; khi hệ thống đã ấm thì token đầu tiên về dưới 5 giây, còn lần đầu sau thời gian rảnh thì chấp nhận thêm độ trễ đánh thức và UI phải hiện trạng thái đang chờ.

### Giai đoạn 3 — Deep research (1–2 tuần)

1. Orchestrator dạng máy trạng thái: plan, search, read, reflect, synthesize.
2. Ghi `cursor` sau mỗi bước để chạy tiếp được; trần 240 giây mỗi lượt gọi function, còn số lượt là tùy ý trong ngân sách phiên (xem 7.1).
3. Lease và idempotency cho `runs`: mỗi lượt giành lease bằng compare-and-set, `attempt` làm fencing token, và mỗi bước ghi vào `run_steps` theo `idem_key` để không gọi trùng khi lượt bị lặp (xem 7.2).
4. Tuần tự hoá theo giới hạn một request đồng thời của Ollama free; `web_search` và `web_fetch` dùng chung slot đó với chat nên mọi lời gọi ra Ollama phải xếp hàng.
5. Báo cáo Markdown có mục nguồn và câu từ chối kết luận khi thiếu bằng chứng.
6. Bảng mức tiêu thụ hạn mức miễn phí theo từng run, cảnh báo khi gần cạn; đếm cục bộ theo token và neuron, vì Ollama không công bố mức còn lại qua API.

Nghiệm thu: một câu hỏi phức tạp cho ra báo cáo từ 5 nguồn trở lên, hoàn tất trong ngân sách phiên đã khai báo (không giới hạn số lượt gọi function), không phát sinh chi phí, chạy tiếp đúng chỗ sau khi bị cắt ở giây 300, và khi chạm trần ngân sách thì dừng cứng trả báo cáo một phần kèm lý do.

### Giai đoạn 4 — Ghi chú, watchlist, xuất bản (1 tuần)

1. Note Markdown, liên kết hai chiều, tag, chèn trích dẫn từ chat.
2. Cron hằng ngày cho watchlist, so diff, gửi thông báo qua chuông trong app và Telegram. Kênh Slack (Incoming Webhook) và email (Resend gói Free) bật ở Giai đoạn 6; cả bốn kênh cùng đọc bảng `changes`, chỉ khác đầu ra.
3. Cron hằng ngày thứ hai để export logic dữ liệu ra Object Storage, loại trừ mọi cột bí mật.
4. Xuất Markdown, PDF, DOCX và bản đọc chỉ-đọc.
5. Tìm kiếm toàn cục và đồ thị quan hệ tài liệu.

Nghiệm thu: watchlist phát hiện đúng thay đổi trên một trang văn bản luật trong vòng 24 giờ; file export mở lại được và khôi phục được vào branch mới.

### Giai đoạn 5 — Cứng hoá (3–5 ngày)

1. Đếm dung lượng DB và Object Storage, cảnh báo ở 70% hạn mức.
2. Diễn tập khôi phục: tạo branch mới từ snapshot hoặc từ file export, đo thời gian.
3. Siết guard đã dựng ở giai đoạn 1: đo lại ngưỡng rate limit theo hạn mức thực tế và rà lại allowlist model, nguồn.
4. Khoá API chỉ nằm ở biến môi trường, không lưu trong `settings` và không lọt vào file export; không bao giờ ghi vào log hay vào `run_steps`.
5. 2FA cho tài khoản, kiểm tra quyền truy cập Object Storage.

Nghiệm thu: xoá branch dev và khôi phục dữ liệu trong 15 phút bằng một lệnh; không có khoá bí mật nào xuất hiện trong log.

### Giai đoạn 6 — Mở rộng: bản tin hằng ngày (khoảng 1 tuần, sau v1)

1. Bảng `quotes` cho chuỗi giá của chỉ số và rổ mã theo dõi.
2. Kết nối một nhà cung cấp dữ liệu chứng khoán theo mục 13.2, bắt đầu bằng SSI FastConnect.
3. Thêm nguồn tin công nghệ vào `watchlist` theo mục 13.3.
4. Render mẫu báo cáo, gửi qua Slack Incoming Webhook và email qua Resend gói Free; ghi mỗi lần gửi vào sổ `notifications` để không gửi trùng.

Nghiệm thu: cron chạy đúng một lần mỗi ngày, gửi một bản tin có cả tin công nghệ lẫn số liệu chứng khoán VN, kèm nguồn và dòng miễn trừ; không tái phân phối dữ liệu thị trường.

---

## 9. Chi phí

Chi phí mục tiêu và cũng là ràng buộc cứng: 0 USD. Không nạp credit, không nâng gói, không thuê máy. Mọi đường trả tiền đã bị loại khỏi kế hoạch, kể cả khi chạm trần.

Ngân sách miễn phí thực tế:

| Nguồn | Hạn mức miễn phí | Khi hết thì làm gì |
|---|---|---|
| Vercel Hobby | 100 deploy/ngày, cron tối đa một lần mỗi ngày, function 300 giây, log 1 giờ | Chờ qua ngày, dồn việc vào cron hôm sau |
| Neon Free | 1 GB Postgres, 5 GB Object Storage, 100 CU-hrs/tháng, scale về 0 sau 5 phút | Nén dữ liệu, xoá tài liệu ít dùng; không có cách mua thêm |
| Ollama Cloud free | Lượng dùng khởi điểm theo tháng cho nhóm starter models, reset hằng tháng; chạy local thì không giới hạn | Chuyển sang Workers AI, rồi sang chế độ chạy máy |
| Workers AI free | 10.000 neurons/ngày, reset 07:00 giờ Việt Nam | Chờ reset, hoặc chuyển sang chế độ chạy máy |
| Ollama local | Không giới hạn trên máy bạn, nhưng chỉ gọi được khi pipeline chạy trên máy | Đây là chế độ chạy cuối ở mục 12.2, không phải mắt xích trong chuỗi dự phòng của function |
| Resend Free | 100 email/ngày, 3 domain riêng | Bản tin chỉ gửi một email mỗi ngày; vượt thì gộp lại hoặc chờ sang ngày |
| Slack Incoming Webhook | Miễn phí cho workspace thông thường | Kênh chính cho bản tin; nếu đổi chính sách thì rơi về Telegram hoặc chuông trong app |

Điểm gãy đầu tiên theo thứ tự dự đoán: hết hạn mức Ollama trong tháng, rồi tới trần 1 GB hoặc 100 CU-hrs của Neon. Cả hai đều xử lý bằng cách chờ hoặc bằng chế độ chạy máy, không bằng tiền.

---

## 10. Rủi ro và tuân thủ

- Cron chỉ một lần mỗi ngày: không dùng cron cho bất cứ thứ gì cần nhịp nhanh. Research do người dùng thúc, watchlist chấp nhận độ trễ 24 giờ.
- Trần 300 giây: research dài phải chia bước. Nếu một lượt vượt trần, người dùng nhận 504, nên phải lưu `cursor` trước mỗi bước tốn thời gian.
- Chạy trùng và việc kẹt: thiếu lease thì hai client cùng resume một `cursor` sẽ gọi model trùng và đốt hạn mức; thiếu reaper thì `runs` hoặc `jobs` nằm mãi ở trạng thái `running`. Xử lý bằng lease, fencing token và reaper hằng ngày ở mục 7.2.
- Route đốt hạn mức hở: nếu để xác thực và rate limit sang giai đoạn sau, bất kỳ ai biết URL cũng đốt hết quota miễn phí. Vì vậy guard được dựng ngay từ route đầu tiên ở giai đoạn 1, không chờ tới giai đoạn cứng hoá.
- Upload qua function bị chặn ở 4.5 MB: bắt buộc dùng URL ký sẵn, và cần cảnh báo rõ với file lớn hơn.
- Không có scheduled backup trên Neon Free: export hằng ngày là biện pháp bắt buộc, không phải tuỳ chọn.
- Dữ liệu rời khỏi máy: Ollama xử lý prompt và response ở hạ tầng chủ yếu tại Mỹ, có thể route sang châu Âu hoặc Singapore; họ cam kết không log và không dùng để huấn luyện. Phần lưu trữ thì DB và file gốc nằm ở Singapore theo region đã chốt. Tài liệu pháp lý nội bộ nằm ngoài phạm vi an toàn của phương án này, muốn giữ kín thì phải chạy model local.
- Phụ thuộc các gói free: chính sách có thể đổi bất kỳ lúc nào. Vì đã bỏ mọi đường trả tiền, rủi ro này chuyển thành rủi ro tính năng chứ không phải rủi ro hoá đơn: khi một nguồn đổi chính sách, tính năng liên quan phải rơi xuống Workers AI, chuyển sang chế độ chạy máy, hoặc tạm dừng. Giảm thiểu bằng interface `ModelProvider` và `SearchProvider`, export dữ liệu hằng ngày, và luôn cài sẵn model local cho chế độ máy.
- Chất lượng bị chặn bởi hạn mức: model nhỏ, ít vòng lặp. Kết quả research sẽ ngắn hơn bản trả tiền, nên UI phải nói rõ đang chạy model nào và ước lượng hạn mức còn lại theo số liệu đếm cục bộ, vì Ollama không có API tra hạn mức còn lại.
- Dữ liệu trên free tier: Gemini free dùng nội dung để cải thiện sản phẩm nên không nằm trong mặc định; Ollama cam kết không log và không huấn luyện; model local thì dữ liệu không rời máy.
- Prompt injection từ nội dung thu thập: coi nội dung là dữ liệu, allowlist tool, sandbox nếu chạy lệnh sinh ra.
- Ảo giác: bắt buộc trích dẫn cấp đoạn, có chế độ từ chối kết luận, hiển thị nguyên văn đoạn nguồn.
- Bản quyền và điều khoản: chỉ lưu trữ cho mục đích nghiên cứu cá nhân, không tái xuất bản toàn văn, tôn trọng robots.txt và giới hạn tốc độ theo domain.
- Dữ liệu thị trường: chỉ dùng cho mục đích cá nhân và nghiên cứu, không tái phân phối bảng giá; ưu tiên API chính thức có tài liệu (mục 13.2), tránh endpoint nội bộ không điều khoản và cào HTML.
- Dữ liệu cá nhân: v1 chỉ xử lý dữ liệu của chính người dùng. Nếu thu thập dữ liệu của người khác thì phải đánh giá lại nghĩa vụ theo Nghị định 13/2023/NĐ-CP trước khi mở rộng.
- TypeScript 7 và Next.js 16: ghim phiên bản, đọc upgrade guide trước khi nâng, giữ đường lùi về TypeScript 6 nếu công cụ chặn.

---

## 11. Tiêu chí nghiệm thu tổng thể

- Ứng dụng chạy trên Vercel Hobby, kết nối Neon, không có dịch vụ tự vận hành nào.
- Ingest URL hoặc PDF dưới 4.5 MB, đọc được bản sạch, mỗi lượt gọi không vượt 300 giây.
- Từ 80% câu trả lời trở lên có trích dẫn trỏ đúng đoạn nguồn trên bộ 30 câu hỏi vàng.
- Deep research cho báo cáo từ 5 nguồn trở lên, hoàn tất trong ngân sách phiên đã khai báo (số lượt gọi function không bị giới hạn), không phát sinh chi phí.
- Research bị cắt ở giây 300 vẫn chạy tiếp đúng chỗ, không mất bước đã hoàn thành.
- Hai client cùng resume một `cursor` thì chỉ một lượt chạy, lượt kia nhận 409; một bước đã hoàn thành không bị gọi lại lần hai; `runs` hoặc `jobs` bỏ dở được reaper chuyển trạng thái trong vòng 24 giờ.
- Watchlist chạy bằng cron hằng ngày, phát hiện thay đổi trong vòng 24 giờ.
- Export sao lưu chạy hằng ngày và khôi phục được trong 15 phút.
- Bản tin hằng ngày gửi đúng một lần mỗi ngày qua Slack và email (Resend gói Free), có cả mục tin công nghệ và chứng khoán VN, kèm nguồn và dòng miễn trừ, và không gửi trùng nhờ sổ `notifications`.
- Vector đúng 1024 chiều, dùng cùng một model cho cả lúc ghi chỉ mục lẫn lúc truy vấn, mỗi chunk ghi `embed_model` để phát hiện được vector cũ.
- Chi phí 0 USD ở mọi tình huống: chạm trần thì hệ thống báo và xếp hàng chờ, không mua thêm.
- Đăng ký công khai đã tắt: người ngoài không tạo được tài khoản, và request thiếu session hợp lệ bị từ chối.
- Chế độ chạy máy chạy được trên máy local bằng cùng mã nguồn: đọc `jobs`, dùng Ollama local, ghi kết quả vào cùng Neon, và không nhặt trùng việc với cron đang chạy.

---

## 12. Bốn điểm đã chốt ngày 09/10/2026

1. Embedding: dùng `qwen3-embedding`, đặt số chiều đầu ra cố định 1024. Mặc định gọi qua API embed của Ollama Cloud từ trong function; Ollama local chỉ dùng ở chế độ chạy máy, nhưng vẫn là cùng một model nên vector so sánh được. Model hỗ trợ hơn 100 thứ tiếng và cho tự chọn số chiều trong khoảng 32 đến 4096, nên `vector(1024)` là lựa chọn có kiểm soát chứ không phải phỏng đoán. Ràng buộc: dùng đúng một model cho cả lúc ghi chỉ mục lẫn lúc truy vấn, ghi `embed_model` lên từng chunk, và đổi model là phải sinh lại toàn bộ vector qua `jobs` ở mục 7.2.
2. Region: chốt Singapore cho cả hai, function Vercel `sin1` và project Neon `aws-ap-southeast-1`, để function nằm cùng thành phố với DB. Lượt gọi model vẫn đi Mỹ vì Ollama đặt hạ tầng ở đó, nên chọn region không cải thiện được phần này. Ràng buộc: region của Neon ghim lúc tạo project và không đổi được.
3. Xác thực: dùng Managed Better Auth của Neon để tự động và miễn phí, chạy cùng region với DB. Đánh đổi là phụ thuộc thêm Neon; đường lùi là tự chạy better-auth trong app vì đây cũng chính là thư viện nền.
4. Job nền: chưa cần ở v1, xem định nghĩa ở mục 12.1.

### 12.1 Job nền thật là gì

Job nền là việc chạy mà không cần ai bấm nút và không cần một request HTTP nào: hệ thống tự đánh thức theo lịch hoặc theo sự kiện, tự chạy, tự thử lại khi lỗi, và có chỗ ghi nhớ đã chạy tới đâu.

Ví dụ trong chính dự án này: quét 20 trang văn bản luật mỗi giờ để phát hiện văn bản mới; đêm xử lý 500 PDF còn tồn; khi đổi model embedding thì sinh lại toàn bộ vector; sáng thứ Hai gửi báo cáo tuần qua Telegram.

Ba khả năng bắt buộc của một hệ job nền đầy đủ: có nhịp chạy, chạy lại được khi thất bại, và giữ trạng thái bền theo thời gian.

Kế hoạch này có một phần và thiếu một phần:

| Khả năng | Trong kế hoạch hiện tại |
|---|---|
| Nhịp định kỳ | Có, nhưng tối đa một lần mỗi ngày qua Vercel Cron trên gói Hobby |
| Chạy lại khi thất bại | Có ở mức cơ bản, qua `attempt` cùng lease và reaper của `jobs` (mục 7.2) |
| Việc dài hoặc chạy song song | Không có: function tối đa 300 giây, và Ollama free chỉ cho 1 request đồng thời |
| Nhịp nhanh hơn một lần mỗi ngày | Không có, và không nên tìm cách lách giới hạn của gói |

Vì vậy ba việc định kỳ chạy đúng theo nhịp ngày: watchlist chạy sáng sớm, bản tin hằng ngày (mục 13) chạy sau giờ đóng cửa phiên VN, và export sao lưu chạy ban đêm. Phần research do người dùng thúc và chạy trong request, nên không thuộc loại job nền.

Khi nào mới cần: khi muốn quét nguồn dày hơn một lần mỗi ngày, muốn xử lý hàng loạt theo đợt dài, hoặc muốn một phiên nghiên cứu chạy xong trong lúc bạn làm việc khác. Trong ràng buộc chỉ free thì hai đường cũ đã bị loại vì đều là trả tiền: nâng Vercel Pro và thuê máy luôn bật. Cách duy nhất còn lại là tự chạy phần việc đó trên máy bạn, ví dụ một tiến trình local đọc bảng `jobs` và xử lý theo lô mỗi khi bạn mở máy. Chi tiết ở mục 12.2.

### 12.2 Chế độ chạy máy là gì

Chế độ chạy máy là cách dùng chính mã nguồn đó nhưng chạy trên máy bạn thay vì trên Vercel. Nó tồn tại vì ba việc mà function Vercel không làm được hoặc không nên làm: gọi Ollama local, xử lý lô lớn hơn 300 giây, và giữ tài liệu không rời máy.

Cách nó chạy:

1. Cùng repo, cùng `packages/pipeline`, cùng schema; chỉ khác điểm vào là một tiến trình Node chạy bằng `pnpm local` thay vì route handler.
2. Đọc bảng `jobs` và `runs` giống hệt cron: nhặt việc bằng `select ... for update skip locked`, giành lease, ghi `run_steps` — dùng chung cơ chế ở mục 7.2 nên không giẫm chân cron đang chạy.
3. Kết nối cùng project Neon bằng credential để trong `.env.local`, không nằm trong repo.
4. Model và embedding gọi Ollama local, vẫn là `qwen3-embedding` cùng 1024 chiều, nên chỉ mục sinh ở máy vẫn truy vấn được từ bản chạy cloud.

Khi nào dùng: hết hạn mức Ollama trong tháng, cần xử lý lô lớn trong một lần, hoặc tài liệu không được rời máy.

Giới hạn: chạy tay nên không tự lên lịch; máy phải bật và Ollama phải đang chạy; không có UI, chỉ đọc log ở terminal.

---

## 13. Mở rộng: bản tin hằng ngày — tin công nghệ và chứng khoán VN

Mục này mô tả phần tích hợp sau khi v1 xong: mỗi ngày crawl tin công nghệ và dữ liệu chứng khoán VN, tổng hợp thành một bản tin, gửi qua Slack và email. Nó dùng lại watchlist, changes, cron ngày và cơ chế jobs + lease, nên không thêm hạ tầng mới.

### 13.1 Kiến trúc

- Một cron hằng ngày: Hobby chỉ cho tối thiểu một lần mỗi ngày, múi giờ UTC, chính xác ±59 phút. Hẹn sau 08:00 UTC để có dữ liệu đóng cửa phiên VN (15:00 ICT).
- Mỗi mục trong `watchlist` là một chủ đề: danh sách nguồn tin công nghệ, hoặc một rổ mã chứng khoán.
- Tin công nghệ: lấy về thành `documents` + `chunks` như mọi nguồn khác, so hash để tìm bài mới. Không sinh embedding cho toàn bộ bài crawl; dùng đường trích dẫn theo `url` ở mục 6 để tiết kiệm hạn mức, chỉ embed bài thật sự đưa vào kho.
- Chứng khoán: lưu chuỗi số vào bảng `quotes`, không nhét vào `chunks`.
- Tổng hợp diff 24 giờ, render mẫu, gửi Slack webhook và email; ghi lại vào `runs`/`run_steps` và dùng lease ở mục 7.2 để lượt cron không chạy trùng.

### 13.2 Đối chiếu nhà cung cấp dữ liệu chứng khoán VN

| Nguồn | Loại | Dữ liệu có | Điều khoản đã đối chiếu | Kết luận |
|---|---|---|---|---|
| SSI FastConnect (`fc-data.ssi.com.vn`) | API chính thức của SSI, có client Python, JS, Java, .NET | `GetDailyOHLC`, `GetIntradayOHLC`, `GetDailyIndex`, `GetDailyStockPrice`, danh sách mã và chỉ số | API dành cho khách hàng SSI; mức truy cập phụ thuộc loại tài khoản và chương trình ưu đãi; tài liệu không nêu quyền phân phối lại | Lựa chọn chính: chính thức, có tài liệu. Cần mở tài khoản SSI và đăng ký API key |
| `vnstock` (thư viện Python) | Thư viện mã nguồn mở, gọi tới nhiều nguồn VN | Giá, chỉ số, báo cáo tài chính, tuỳ nguồn cấu hình | Giấy phép riêng, không phải OSI; miễn phí cho cá nhân, học tập, nghiên cứu; không cấp quyền dữ liệu nguồn bên thứ ba; phân phối lại phần mềm hoặc vận hành sản phẩm cấp dữ liệu thị trường cho bên thứ ba phải có thoả thuận văn bản riêng | Dùng tốt cho nghiên cứu cá nhân, nhưng vẫn phải tự tuân thủ điều khoản của từng nguồn bên dưới |
| FireAnt | Nền tảng dữ liệu kèm mạng xã hội | Bảng giá, chỉ số, tin | Không tìm thấy tài liệu API công khai (đường tài liệu trả 404); trang "Quy định" là quy định nội dung đăng tải, không phải điều khoản API | Không dựa vào API công khai |
| VNDirect, TCBS, SSI iBoard (endpoint nội bộ) | Endpoint phục vụ web/app của họ | Bảng giá, chỉ số | Không có tài liệu và không có điều khoản API công khai | Tránh: rủi ro điều khoản và dễ vỡ khi họ đổi |
| Cào HTML bảng giá | Cào trực tiếp | Bảng giá | Mỗi trang có robots.txt và điều khoản riêng; cào bảng giá thường không được phép | Không dùng |
| Nguồn quốc tế (Alpha Vantage, EODHD, FMP, Polygon) | API có tài liệu và điều khoản rõ | Phủ VN không đầy đủ, gói free rất hạn chế | Chưa đối chiếu trong tài liệu này | Để dành, chưa đưa vào mặc định |

Chốt: SSI FastConnect là đường chính; `vnstock` là đường phụ cho nghiên cứu cá nhân; không cào HTML; không dùng endpoint nội bộ không tài liệu.

Ràng buộc khi dùng dữ liệu thị trường: chỉ dùng cho mục đích cá nhân và nghiên cứu, không tái phân phối, không đăng lại bảng giá, và luôn ghi rõ nguồn trong báo cáo.

### 13.3 Nguồn tin công nghệ

Thêm vào `watchlist` dưới dạng cấu hình nguồn, mỗi nguồn có `kind` riêng:

| Nguồn | Kiểu lấy | Ghi chú |
|---|---|---|
| Hacker News | API chính thức, miễn phí, không giới hạn nhịp, giấy phép MIT | Lấy top/best stories, lọc theo điểm |
| TechCrunch, The Verge, Ars Technica, InfoQ | RSS/Atom | Kiểm robots.txt trước |
| GitHub Blog và changelog framework đang dùng | RSS/Atom | Bám sát Next.js, React, Drizzle |
| VnExpress Số hoá, GenK | RSS | Tin công nghệ Việt Nam |
| arXiv (cs.AI, cs.CL) | API công khai | Tuỳ chọn, nếu muốn theo dõi nghiên cứu |

Lọc theo từ khoá trong `watchlist.query` để tránh nhiễu; mỗi ngày chỉ đưa vào bản tin tối đa N mục mới nhất chưa gửi.

### 13.4 Mẫu báo cáo Slack

```text
*Bản tin hằng ngày — {ngày}*

*Tin công nghệ mới* ({số} mục)
• {tiêu đề} — {nguồn} <{url}>
• ...

*Chứng khoán VN* (phiên {ngày})
• VNINDEX {giá} ({thay đổi %})
• HNXINDEX {giá} ({thay đổi %})
• Rổ theo dõi: {mã} {giá} ({thay đổi %}), ...

*Điểm đáng chú ý*
{3-5 gạch đầu dòng do model tóm tắt, mỗi ý kèm trích dẫn <{url}>}

_Chỉ dùng cho mục đích cá nhân và nghiên cứu. Không phải khuyến nghị đầu tư._
```

### 13.5 Mẫu email

Tiêu đề: `Bản tin hằng ngày {ngày} — tin công nghệ và chứng khoán VN`

```text
Bản tin hằng ngày — {ngày}

1. Tin công nghệ mới ({số} mục)
{tiêu đề} — {nguồn}
{url}
{tóm tắt 1-2 câu}

2. Chứng khoán VN — phiên {ngày}
VNINDEX: {giá} ({thay đổi %})
HNXINDEX: {giá} ({thay đổi %})
Rổ theo dõi: {mã}: {giá} ({thay đổi %}), ...

3. Điểm đáng chú ý
{3-5 gạch đầu dòng kèm trích dẫn}

Nguồn dữ liệu chứng khoán: {nhà cung cấp}. Chỉ dùng cho mục đích cá nhân và nghiên cứu, không phải khuyến nghị đầu tư.
```

### 13.6 Ràng buộc vận hành

- Cron một lần mỗi ngày, múi giờ UTC, chính xác ±59 phút; hẹn sau 08:00 UTC.
- Một lượt 300 giây: nhiều chủ đề phải chia thành nhiều `jobs`, dùng lease ở mục 7.2, không nhồi tất cả vào một lượt.
- Không embed toàn bộ bài crawl; chỉ embed bài được đưa vào kho.
- Slack: dùng Incoming Webhook, miễn phí, chỉ là một HTTP POST; webhook URL để ở biến môi trường, không lưu trong DB.
- Email: dùng Resend gói Free (100 email/ngày, 3 domain riêng). Bản tin chỉ gửi một email mỗi ngày nên dư hạn mức; cần cấu hình SPF, DKIM, DMARC cho domain gửi trước khi bật kênh này.
- Ghi lại nguồn và thời điểm lấy dữ liệu trong `meta` để đối soát về sau.

---

## 14. Phụ lục — Chạm trần thì làm gì mà không trả tiền

| Dấu hiệu | Cách xử lý miễn phí |
|---|---|
| Hết hạn mức Ollama trong tháng | Chuyển sang Workers AI trong hạn mức ngày; hoặc chờ reset tháng; hoặc chuyển sang chế độ chạy máy |
| `usage_usd` tháng đạt 70% trần tự đặt | Ngưỡng chuyển sang Workers AI: đọc `/api/usage?range=30d` ở đầu mỗi phiên, chạm ngưỡng thì cả phiên đó chạy bằng Workers AI |
| Ollama trả `402` hoặc `429` | Chuyển ngay phần còn lại của phiên sang Workers AI, rồi chốt trần tháng = 80% × `usage_usd` tại thời điểm đó và ghi vào `settings` — gói Free không công bố số nên đây là cách duy nhất biết trần |
| Phiên chạm trần 200.000 token | Dừng cứng với `budget_exhausted`, không chạy thêm; phần đã làm vẫn xem lại được |
| Hết 10.000 neurons trong ngày | Chờ 07:00 giờ Việt Nam, hoặc chuyển sang chế độ chạy máy |
| DB gần 1 GB | Xoá tài liệu cũ ít dùng, giảm kích thước chunk và trường `meta`; không có cách mua thêm |
| CU-hrs gần cạn | Giảm số lượt tick và bỏ truy vấn nền; để compute về 0 giữa các phiên |
| Cần research dài hơn 300 giây | Chia nhỏ bước và chạy tiếp bằng client, không nâng gói |
| Cần job nền nhịp dày hơn một lần mỗi ngày | Chấp nhận nhịp ngày, hoặc tự chạy thủ công trên máy bạn |
| Tài liệu không được rời máy | Chạy ở chế độ máy với model local và tắt model cloud cho riêng phiên đó |
| Chính sách free tier thay đổi | Chế độ chạy máy với model local đã cài sẵn là đường lùi cuối cùng |

---

Ghi chú kiểm chứng: các số liệu hạn mức lấy từ tài liệu chính thức của Vercel, Neon, Ollama, Cloudflare và Google trong ngày 09/10/2026, và có thể thay đổi. Đã đối chiếu lại trực tiếp: Vercel Hobby giới hạn thời lượng function 300 giây cho cả mặc định lẫn tối đa; Neon Free cho 100 CU-hrs/project/tháng (0,25 CU chạy 400 giờ), autoscale tới 2 CU, 1 GB Postgres/project, 5 GB Object Storage, Auth tới 60k MAU; Vitest bản mới nhất 5.0.3. Riêng Gemini free tier có điều khoản dùng nội dung để cải thiện sản phẩm, và đó là lý do nó không nằm trong mặc định.
