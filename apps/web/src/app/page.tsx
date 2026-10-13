const SECTIONS = [
  { href: '/library', label: 'Kho tài liệu', note: 'Thu thập, chuẩn hoá, đọc' },
  { href: '/chat', label: 'Hỏi đáp có trích dẫn', note: 'Tìm lai full-text và vector' },
  { href: '/research', label: 'Deep research', note: 'Báo cáo nhiều nguồn' },
  { href: '/notes', label: 'Ghi chú', note: 'Liên kết hai chiều' },
  { href: '/watchlist', label: 'Theo dõi thay đổi', note: 'Cron hằng ngày' },
];

// Trang chủ của Giai đoạn 0: khung rỗng cho năm mục chính, chưa nối dữ liệu.
export default function HomePage() {
  return (
    <main>
      <h1>Research Hub</h1>
      <p>Khung Giai đoạn 0. Chưa nối kho dữ liệu.</p>
      <ul>
        {SECTIONS.map((section) => (
          <li key={section.href}>
            <strong>{section.label}</strong> — {section.note} <code>{section.href}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}
