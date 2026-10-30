# Workflow làm việc theo ticket

Áp dụng cho các task trong repo `research-hub`.

## Tiếp nhận ticket và lập checklist

1. Chỉ xử lý ticket Jira mà người dùng yêu cầu; không tự chọn ticket khác để làm tiếp.
2. Lấy ticket từ Jira, đọc mô tả, tiêu chí nghiệm thu, bình luận và các liên kết liên quan. Khi bắt đầu xử lý, chuyển ticket sang `In Progress`. Nếu không truy cập được ticket hoặc không thể đổi trạng thái, báo rõ và không giả vờ đã hoàn tất thao tác.
3. Đọc `README.md`, README của phase, checklist hiện có và các tài liệu liên quan. Xác nhận phụ thuộc đã hoàn tất, phase tương ứng và nhánh hiện tại đúng (`phase-<số>`); không làm trực tiếp trên `main`. Khi một phase đã hoàn thành nghiệm thu thì đẩy nhánh phase lên remote rồi merge vào `main` (người dùng đã cho phép thường trực bước này) trước khi sang phase kế tiếp.
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

1. Sau mỗi mục checklist đã xác minh, cập nhật file Markdown tương ứng. Trong lúc triển khai, ticket Jira giữ trạng thái `In Progress`; có thể thêm bình luận tiến độ nhưng không chuyển `Done`.
2. Khi toàn bộ checklist hoàn tất, xác nhận file checklist và Jira phản ánh đúng thay đổi, kiểm chứng, giới hạn và các mục còn tồn tại. Thêm bình luận tổng kết vào ticket; giữ trạng thái `In Progress` trong lúc chờ review và chờ quyền commit/push.
3. Nếu còn mục chưa hoàn tất hoặc bị chặn, giữ ticket ở trạng thái phù hợp (thường là `In Progress`) và ghi rõ phần còn lại; không chuyển sang `Done`.

## Bàn giao trạng thái giữa các phiên

1. Sau mỗi mục checklist đã hoàn tất và kiểm chứng, hoặc sau mỗi task hoàn tất nếu task không chia checklist, cập nhật `docs/WORK-STATE.md` trước khi dừng hoặc kết thúc phiên. Không đợi đến khi hoàn tất cả ticket hay phase.
2. Ghi ngắn gọn phase/ticket/task đang làm, mục vừa hoàn tất cùng kết quả kiểm chứng và các file liên quan, những mục còn lại hoặc đang bị chặn, và bước tiếp theo cụ thể đủ để phiên sau tiếp tục. Bước tiếp theo phải phù hợp thứ tự phụ thuộc trong README/checklist; nếu không có ticket đang hoạt động hoặc thiếu yêu cầu từ người dùng, ghi rõ điều đó thay vì tự chọn ticket.
3. Giữ `docs/WORK-STATE.md` đồng bộ với checklist và Jira; chỉ ghi hoàn tất khi có bằng chứng, và cập nhật lại trạng thái nếu kiểm chứng sau đó thất bại hoặc phạm vi thay đổi. Khi bắt đầu phiên tiếp theo, đọc file này cùng yêu cầu mới nhất của người dùng; yêu cầu mới nhất được ưu tiên và không được tự tiếp tục ticket khác ngoài phạm vi được yêu cầu.

## Review, commit, push và hoàn tất ticket

1. Khi toàn bộ checklist hoàn tất và đã cập nhật checklist/Jira, dừng để người dùng review. Gửi tóm tắt thay đổi, kết quả kiểm chứng, trạng thái Jira và danh sách file thuộc ticket; không stage, commit hoặc push ở bước này.
2. Nếu người dùng yêu cầu chỉnh sửa khi review, thực hiện trong phạm vi ticket, chạy lại kiểm chứng liên quan, cập nhật checklist/Jira cho khớp và dừng chờ review lại.
3. Tuyệt đối không commit hoặc push nếu chưa có sự cho phép rõ ràng của người dùng. Chỉ sau khi được cho phép commit, stage đúng các file thuộc ticket đã được review; kiểm tra staged diff để loại thay đổi ngoài phạm vi, secret và artifact sinh tự động. Dùng commit message tiếng Anh, mô tả đúng một thay đổi logic.
4. Sau commit, báo mã commit và chờ xác nhận riêng cho việc push. Cho phép commit không đồng nghĩa với cho phép push.
5. Chỉ push commit đã được duyệt lên remote của nhánh phase tương ứng sau khi có xác nhận push rõ ràng. Không force-push. Việc merge nhánh phase đã nghiệm thu vào `main` là bước bắt buộc cuối mỗi phase, không cần hỏi lại.
6. Chỉ sau khi commit và push đều thành công, chuyển ticket Jira sang `Done` và cập nhật bình luận cuối cùng với commit, kết quả kiểm chứng và phần còn tồn tại (nếu có). Nếu commit hoặc push thất bại, hoặc chưa được phép thực hiện, giữ ticket chưa `Done` và báo chính xác trạng thái.
