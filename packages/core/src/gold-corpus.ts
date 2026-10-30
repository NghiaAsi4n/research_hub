// Sáu tài liệu mẫu đi kèm bộ 30 câu hỏi vàng (Giai đoạn 2, T5).
//
// Nội dung ngắn, tự soạn, phủ đúng các đoạn mà `GOLD_QUESTIONS` dùng làm căn cứ chấm điểm. Giữ ở
// dạng chuỗi trong mã thay vì tệp rời để route đánh giá đọc được cả trên Vercel sau khi build.

export type GoldDocument = { title: string; markdown: string };

export const GOLD_DOCUMENTS: GoldDocument[] = [
  {
    title: 'Hợp đồng thuê nhà ở',
    markdown: [
      '# Hợp đồng thuê nhà ở',
      '',
      'Các bên thỏa thuận thời hạn thuê là 12 tháng kể từ ngày bàn giao nhà.',
      '',
      'Bên thuê đặt cọc hai tháng tiền thuê ngay khi ký hợp đồng.',
      '',
      'Bên cho thuê bàn giao nhà trong 07 ngày kể từ ngày hợp đồng có hiệu lực.',
      '',
      'Sửa chữa hư hỏng lớn thuộc trách nhiệm bên cho thuê; hư hỏng nhỏ do bên thuê gây ra thì bên thuê chi trả.',
      '',
      'Hợp đồng chấm dứt trước hạn khi một bên vi phạm nghĩa vụ cơ bản và không khắc phục trong 15 ngày kể từ khi có thông báo.',
    ].join('\n'),
  },
  {
    title: 'Hợp đồng lao động thử việc',
    markdown: [
      '# Hợp đồng lao động thử việc',
      '',
      'Thời gian thử việc không quá 60 ngày đối với công việc cần trình độ chuyên môn từ cao đẳng trở lên.',
      '',
      'Trong thời gian thử việc, người lao động được trả ít nhất 85% mức lương của công việc đó.',
      '',
      'Một bên muốn chấm dứt hợp đồng trong thời gian thử việc phải báo trước 03 ngày làm việc.',
      '',
      'Người lao động được nghỉ hằng năm 12 ngày làm việc mỗi năm, cộng thêm ngày nghỉ theo thâm niên.',
      '',
      'Người sử dụng lao động trả trợ cấp thôi việc khi đã làm việc đủ 12 tháng trở lên, mỗi năm làm việc tính nửa tháng lương.',
    ].join('\n'),
  },
  {
    title: 'Nghị định xử phạt giao thông',
    markdown: [
      '# Nghị định xử phạt giao thông',
      '',
      'Người điều khiển xe mô tô có nồng độ cồn vượt mức quy định bị phạt tiền từ 6.000.000 đồng đến 8.000.000 đồng.',
      '',
      'Cùng hành vi trên còn bị tước quyền sử dụng giấy phép lái xe 22 đến 24 tháng.',
      '',
      'Phương tiện bị tạm giữ phương tiện 07 ngày để xác minh tình tiết vi phạm.',
      '',
      'Người điều khiển xe không có giấy phép lái xe bị phạt tiền từ 1.000.000 đồng đến 2.000.000 đồng.',
      '',
      'Thẩm quyền lập biên bản thuộc cảnh sát giao thông và thanh tra giao thông theo phân cấp.',
    ].join('\n'),
  },
  {
    title: 'Điều lệ công ty cổ phần',
    markdown: [
      '# Điều lệ công ty cổ phần',
      '',
      'Đại hội đồng cổ đông thường niên họp trong thời hạn 04 tháng kể từ ngày kết thúc năm tài chính.',
      '',
      'Nghị quyết sửa đổi điều lệ phải được ít nhất 65% tổng số phiếu biểu quyết của cổ đông dự họp tán thành.',
      '',
      'Cổ đông sở hữu từ 10% tổng số cổ phần có quyền yêu cầu triệu tập họp bất thường.',
      '',
      'Công ty thanh toán cổ tức trong 30 ngày kể từ ngày Đại hội đồng quyết định chia cổ tức.',
      '',
      'Hội đồng quản trị có từ 03 đến 11 thành viên, nhiệm kỳ không quá 05 năm.',
    ].join('\n'),
  },
  {
    title: 'Quy chế bảo vệ dữ liệu cá nhân',
    markdown: [
      '# Quy chế bảo vệ dữ liệu cá nhân',
      '',
      'Dữ liệu cá nhân được lưu trữ không quá 24 tháng kể từ lần cuối người dùng tương tác, trừ trường hợp pháp luật yêu cầu khác.',
      '',
      'Khi xảy ra sự cố lộ dữ liệu, đơn vị phải thông báo trong vòng 72 giờ cho cơ quan có thẩm quyền và người bị ảnh hưởng.',
      '',
      'Trách nhiệm giám sát thuộc bộ phận bảo vệ dữ liệu do giám đốc chỉ định bằng văn bản.',
      '',
      'Người dùng có quyền yêu cầu xoá dữ liệu bất kỳ lúc nào và công ty phải phản hồi trong 30 ngày.',
      '',
      'Dữ liệu được mã hoá AES-256 khi lưu trữ và TLS 1.3 khi truyền.',
    ].join('\n'),
  },
  {
    title: 'Hướng dẫn sử dụng dịch vụ',
    markdown: [
      '# Hướng dẫn sử dụng dịch vụ',
      '',
      'Khách hàng được hoàn tiền trong vòng 14 ngày kể từ ngày mua nếu chưa dùng quá 20% hạn mức.',
      '',
      'Bộ phận hỗ trợ 24/7 qua email và điện thoại, kể cả ngày lễ.',
      '',
      'Tài khoản bị khoá tạm thời sau 05 lần đăng nhập sai liên tiếp và mở lại sau 30 phút.',
      '',
      'Yêu cầu hoàn tiền được xử lý hoàn tiền trong 07 ngày làm việc kể từ khi nhận đủ hồ sơ.',
      '',
      'Mỗi tài khoản được dùng thử miễn phí 14 ngày cho một lần đăng ký.',
    ].join('\n'),
  },
];

export function findGoldDocument(title: string): GoldDocument | undefined {
  return GOLD_DOCUMENTS.find((document) => document.title === title);
}
