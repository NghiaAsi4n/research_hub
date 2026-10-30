import type { EvalQuestion } from './eval-citations';

// Bộ 30 câu hỏi vàng cho Giai đoạn 2 (T5).
//
// Mỗi câu gắn với một tài liệu mẫu và một đoạn văn bản phải xuất hiện trong chunk được trích.
// `contains` là đoạn ngắn, đủ đặc trưng để không khớp nhầm sang tài liệu khác; đây cũng là điều
// kiện tính "trích dẫn đúng" trong `scoreAnswer`.

export const GOLD_QUESTIONS: EvalQuestion[] = [
  // Hợp đồng thuê nhà ở
  {
    id: 'thue-01',
    question: 'Thời hạn thuê nhà trong hợp đồng là bao lâu?',
    documentTitle: 'Hợp đồng thuê nhà ở',
    contains: 'thời hạn thuê là 12 tháng',
  },
  {
    id: 'thue-02',
    question: 'Bên thuê phải đặt cọc bao nhiêu tháng tiền thuê?',
    documentTitle: 'Hợp đồng thuê nhà ở',
    contains: 'đặt cọc hai tháng tiền thuê',
  },
  {
    id: 'thue-03',
    question: 'Trong bao nhiêu ngày kể từ khi ký hợp đồng thì phải bàn giao nhà?',
    documentTitle: 'Hợp đồng thuê nhà ở',
    contains: 'bàn giao nhà trong 07 ngày',
  },
  {
    id: 'thue-04',
    question: 'Ai chịu trách nhiệm sửa chữa hư hỏng lớn của căn nhà?',
    documentTitle: 'Hợp đồng thuê nhà ở',
    contains: 'sửa chữa hư hỏng lớn thuộc trách nhiệm bên cho thuê',
  },
  {
    id: 'thue-05',
    question: 'Hợp đồng chấm dứt trước hạn trong trường hợp nào?',
    documentTitle: 'Hợp đồng thuê nhà ở',
    contains: 'chấm dứt trước hạn khi một bên vi phạm nghĩa vụ cơ bản',
  },

  // Hợp đồng lao động thử việc
  {
    id: 'ld-01',
    question: 'Thời gian thử việc tối đa là bao nhiêu ngày?',
    documentTitle: 'Hợp đồng lao động thử việc',
    contains: 'thời gian thử việc không quá 60 ngày',
  },
  {
    id: 'ld-02',
    question: 'Mức lương trong thời gian thử việc bằng bao nhiêu phần trăm lương chính thức?',
    documentTitle: 'Hợp đồng lao động thử việc',
    contains: 'ít nhất 85% mức lương của công việc đó',
  },
  {
    id: 'ld-03',
    question: 'Cần báo trước bao nhiêu ngày để chấm dứt hợp đồng trong thời gian thử việc?',
    documentTitle: 'Hợp đồng lao động thử việc',
    contains: 'báo trước 03 ngày làm việc',
  },
  {
    id: 'ld-04',
    question: 'Một năm người lao động được nghỉ phép bao nhiêu ngày?',
    documentTitle: 'Hợp đồng lao động thử việc',
    contains: '12 ngày làm việc mỗi năm',
  },
  {
    id: 'ld-05',
    question: 'Người sử dụng lao động phải trả trợ cấp thôi việc khi nào?',
    documentTitle: 'Hợp đồng lao động thử việc',
    contains: 'trợ cấp thôi việc khi đã làm việc đủ 12 tháng trở lên',
  },

  // Nghị định xử phạt giao thông
  {
    id: 'gt-01',
    question: 'Mức phạt với người điều khiển xe máy có nồng độ cồn vượt mức là bao nhiêu?',
    documentTitle: 'Nghị định xử phạt giao thông',
    contains: 'phạt tiền từ 6.000.000 đồng đến 8.000.000 đồng',
  },
  {
    id: 'gt-02',
    question: 'Vi phạm nồng độ cồn bị tước giấy phép lái xe bao lâu?',
    documentTitle: 'Nghị định xử phạt giao thông',
    contains: 'tước quyền sử dụng giấy phép lái xe 22 đến 24 tháng',
  },
  {
    id: 'gt-03',
    question: 'Xe bị tạm giữ bao nhiêu ngày khi vi phạm nồng độ cồn?',
    documentTitle: 'Nghị định xử phạt giao thông',
    contains: 'tạm giữ phương tiện 07 ngày',
  },
  {
    id: 'gt-04',
    question: 'Người điều khiển xe không có giấy phép lái xe bị phạt bao nhiêu?',
    documentTitle: 'Nghị định xử phạt giao thông',
    contains: 'phạt tiền từ 1.000.000 đồng đến 2.000.000 đồng',
  },
  {
    id: 'gt-05',
    question: 'Cơ quan nào có thẩm quyền lập biên bản vi phạm giao thông?',
    documentTitle: 'Nghị định xử phạt giao thông',
    contains: 'cảnh sát giao thông và thanh tra giao thông',
  },

  // Điều lệ công ty cổ phần
  {
    id: 'ct-01',
    question: 'Đại hội đồng cổ đông thường niên phải họp trong thời hạn nào?',
    documentTitle: 'Điều lệ công ty cổ phần',
    contains: 'trong thời hạn 04 tháng kể từ ngày kết thúc năm tài chính',
  },
  {
    id: 'ct-02',
    question: 'Nghị quyết Đại hội đồng cổ đông về sửa đổi điều lệ cần tỉ lệ bao nhiêu?',
    documentTitle: 'Điều lệ công ty cổ phần',
    contains: 'ít nhất 65% tổng số phiếu biểu quyết',
  },
  {
    id: 'ct-03',
    question: 'Cổ đông sở hữu bao nhiêu phần trăm cổ phần được yêu cầu triệu tập họp?',
    documentTitle: 'Điều lệ công ty cổ phần',
    contains: 'cổ đông sở hữu từ 10% tổng số cổ phần',
  },
  {
    id: 'ct-04',
    question: 'Cổ tức được chia trong thời hạn bao lâu kể từ ngày quyết định?',
    documentTitle: 'Điều lệ công ty cổ phần',
    contains: 'thanh toán cổ tức trong 30 ngày',
  },
  {
    id: 'ct-05',
    question: 'Hội đồng quản trị có tối thiểu bao nhiêu thành viên?',
    documentTitle: 'Điều lệ công ty cổ phần',
    contains: 'Hội đồng quản trị có từ 03 đến 11 thành viên',
  },

  // Quy chế bảo vệ dữ liệu cá nhân
  {
    id: 'dl-01',
    question: 'Dữ liệu cá nhân được lưu trong bao lâu?',
    documentTitle: 'Quy chế bảo vệ dữ liệu cá nhân',
    contains: 'lưu trữ không quá 24 tháng',
  },
  {
    id: 'dl-02',
    question: 'Khi xảy ra sự cố dữ liệu phải thông báo trong bao lâu?',
    documentTitle: 'Quy chế bảo vệ dữ liệu cá nhân',
    contains: 'thông báo trong vòng 72 giờ',
  },
  {
    id: 'dl-03',
    question: 'Ai là người chịu trách nhiệm bảo vệ dữ liệu cá nhân?',
    documentTitle: 'Quy chế bảo vệ dữ liệu cá nhân',
    contains: 'bộ phận bảo vệ dữ liệu do giám đốc chỉ định',
  },
  {
    id: 'dl-04',
    question: 'Người dùng có quyền yêu cầu xoá dữ liệu của mình không?',
    documentTitle: 'Quy chế bảo vệ dữ liệu cá nhân',
    contains: 'quyền yêu cầu xoá dữ liệu bất kỳ lúc nào',
  },
  {
    id: 'dl-05',
    question: 'Dữ liệu được mã hoá bằng tiêu chuẩn nào?',
    documentTitle: 'Quy chế bảo vệ dữ liệu cá nhân',
    contains: 'mã hoá AES-256 khi lưu trữ',
  },

  // Hướng dẫn sử dụng dịch vụ
  {
    id: 'dv-01',
    question: 'Được hoàn tiền trong bao nhiêu ngày kể từ khi mua?',
    documentTitle: 'Hướng dẫn sử dụng dịch vụ',
    contains: 'hoàn tiền trong vòng 14 ngày',
  },
  {
    id: 'dv-02',
    question: 'Thời gian hỗ trợ khách hàng là khi nào?',
    documentTitle: 'Hướng dẫn sử dụng dịch vụ',
    contains: 'hỗ trợ 24/7 qua email và điện thoại',
  },
  {
    id: 'dv-03',
    question: 'Tài khoản bị khoá sau bao nhiêu lần đăng nhập sai?',
    documentTitle: 'Hướng dẫn sử dụng dịch vụ',
    contains: 'khoá tạm thời sau 05 lần đăng nhập sai',
  },
  {
    id: 'dv-04',
    question: 'Thời gian xử lý yêu cầu hoàn tiền là bao lâu?',
    documentTitle: 'Hướng dẫn sử dụng dịch vụ',
    contains: 'xử lý hoàn tiền trong 07 ngày làm việc',
  },
  {
    id: 'dv-05',
    question: 'Gói dịch vụ có được dùng thử miễn phí không?',
    documentTitle: 'Hướng dẫn sử dụng dịch vụ',
    contains: 'dùng thử miễn phí 14 ngày',
  },
];
