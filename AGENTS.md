# Workflow làm việc theo ticket

Áp dụng cho các task trong repo `research-hub`.

## Tiếp nhận ticket và lập checklist

1. Chỉ xử lý ticket Jira mà người dùng yêu cầu; không tự chọn ticket khác để làm tiếp.
2. Lấy ticket từ Jira, đọc mô tả, tiêu chí nghiệm thu, bình luận và các liên kết liên quan. Khi bắt đầu xử lý, chuyển ticket sang `In Progress`. Nếu không truy cập được ticket hoặc không thể đổi trạng thái, báo rõ và không giả vờ đã hoàn tất thao tác.
3. Đọc `README.md`, README của phase, checklist hiện có và các tài liệu liên quan. Xác nhận phụ thuộc đã hoàn tất, phase tương ứng và nhánh hiện tại đúng (`phase-<số>`); không làm trực tiếp trên `main`. Xong một ticket là push commit lên nhánh phase rồi merge ngay commit đó vào `main` (người dùng cho phép thường trực), không đợi hết phase.
4. Chia ticket thành các mục checklist nhỏ, độc lập, có thể kiểm chứng; ghi trong file checklist Markdown hiện có của ticket hoặc tạo file theo quy ước của phase. Không thay đổi checklist của ticket khác.
5. Kiểm tra `git status` và diff trước khi chỉnh sửa. Giữ nguyên thay đổi có sẵn ngoài phạm vi; không ghi đè hoặc hoàn tác chúng.
6. Nếu thiếu quyền truy cập, phụ thuộc, hoặc quyết định sản phẩm cần thiết, nêu đúng điểm bị chặn thay vì giả định.

## Nhịp thực hiện checklist

1. Mặc định, làm từng mục checklist một: thực hiện thay đổi cần thiết, chạy kiểm chứng phù hợp, rồi chỉ tick mục đó khi có bằng chứng hoàn tất.
2. Sau mỗi mục hoàn tất, báo người dùng mục nào đã xong cùng kết quả kiểm chứng và các file liên quan; sau đó dừng, chờ người dùng xác nhận mới làm mục tiếp theo.
3. Nếu người dùng yêu cầu hoàn thành toàn bộ checklist trong một lượt, xử lý tuần tự tất cả mục mà không dừng giữa chừng; cuối lượt báo kết quả từng mục, kiểm chứng và các mục còn bị chặn.
4. Yêu cầu tiếp tục checklist, tự nó, không phải là quyền commit hoặc push. Nếu người dùng yêu cầu chỉnh sửa một mục đã làm, cập nhật mục đó, chạy lại kiểm chứng liên quan và chỉ giữ dấu tick khi vẫn có bằng chứng đạt.
5. Khi một mục chưa kiểm chứng hoặc còn bị chặn, để nguyên chưa tick và ghi rõ lý do. Không đánh dấu nghiệm thu toàn phase là hoàn tất nếu còn tiêu chí phase chưa đạt.

## Thực hiện và kiểm chứng

1. Chỉ thay đổi những gì cần cho ticket hiện tại. Thêm hoặc cập nhật test phù hợp với hành vi thay đổi.
2. Chạy test, typecheck, lint, build hoặc kiểm chứng sống phù hợp với tiêu chí nghiệm thu. Báo lệnh đã chạy và kết quả thực tế; không coi kết quả chưa kiểm tra là thành công.

## Cập nhật checklist và Jira

1. Cập nhật Jira tự động ở mọi bước, không hỏi lại: bắt đầu ticket là chuyển `In Progress`; sau mỗi mục checklist hoặc bước thực hiện thì thêm bình luận tiến độ ngắn (việc đã xong, kiểm chứng, file liên quan) và giữ trạng thái đúng với thực tế; hoàn tất ticket thì chuyển `Done` ngay sau khi commit, push và merge thành công.
2. Bình luận Jira phải phản ánh đúng bằng chứng đã có, không ghi hoàn tất khi kiểm chứng chưa đạt; nếu còn mục bị chặn thì giữ trạng thái phù hợp và ghi rõ phần còn lại.
3. Nếu công cụ Jira không cho đổi trạng thái trong phiên, báo rõ ngay khi phát hiện (kèm ticket cụ thể), vẫn thêm bình luận và ghi việc chuyển trạng thái vào `docs/WORK-STATE.md` để phiên sau làm tiếp; không giả vờ đã đổi và không bỏ qua bước này.

## Bàn giao trạng thái giữa các phiên

1. Sau mỗi mục checklist đã hoàn tất và kiểm chứng, hoặc sau mỗi task hoàn tất nếu task không chia checklist, cập nhật `docs/WORK-STATE.md` trước khi dừng hoặc kết thúc phiên. Không đợi đến khi hoàn tất cả ticket hay phase.
2. Ghi ngắn gọn phase/ticket/task đang làm, mục vừa hoàn tất cùng kết quả kiểm chứng và các file liên quan, những mục còn lại hoặc đang bị chặn, và bước tiếp theo cụ thể đủ để phiên sau tiếp tục. Bước tiếp theo phải phù hợp thứ tự phụ thuộc trong README/checklist; nếu không có ticket đang hoạt động hoặc thiếu yêu cầu từ người dùng, ghi rõ điều đó thay vì tự chọn ticket.
3. Giữ `docs/WORK-STATE.md` đồng bộ với checklist và Jira; chỉ ghi hoàn tất khi có bằng chứng, và cập nhật lại trạng thái nếu kiểm chứng sau đó thất bại hoặc phạm vi thay đổi. Khi bắt đầu phiên tiếp theo, đọc file này cùng yêu cầu mới nhất của người dùng; yêu cầu mới nhất được ưu tiên và không được tự tiếp tục ticket khác ngoài phạm vi được yêu cầu.

## Review, commit, push và hoàn tất ticket

1. Khi toàn bộ checklist của một ticket hoàn tất và đã kiểm chứng: stage đúng các file thuộc ticket, xem lại staged diff để loại thay đổi ngoài phạm vi, secret và artifact sinh tự động, rồi commit bằng message tiếng Anh mô tả đúng một thay đổi logic.
2. Ngay sau commit, push lên nhánh `phase-<số>` của phase đang làm, rồi merge commit đó vào `main` và push `main`. Người dùng đã cho phép thường trực chuỗi commit → push → merge này cho từng ticket trong repo này, không cần hỏi lại.
3. Không force-push. Không merge khi kiểm chứng của ticket chưa đạt. Nếu push hoặc merge lỗi, giữ ticket chưa `Done` và báo đúng trạng thái thay vì coi như đã xong.
4. Chỉ chuyển ticket Jira sang `Done` sau khi commit, push và merge đều thành công; thêm bình luận cuối cùng với commit, kết quả kiểm chứng và phần còn tồn tại (nếu có). Nếu người dùng yêu cầu chỉnh sửa sau đó, sửa trong phạm vi ticket, chạy lại kiểm chứng, cập nhật checklist/Jira rồi lặp lại chuỗi trên.
