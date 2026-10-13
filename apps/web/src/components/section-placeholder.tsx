// Khung rỗng dùng chung cho năm mục chính ở Giai đoạn 0 (plan mục 8 bước 8).
// Mục đích: route tồn tại thật để guard xác thực và điều hướng chạy được, chưa nối dữ liệu.
export function SectionPlaceholder({
  title,
  note,
  phase,
}: {
  title: string;
  note: string;
  phase: string;
}) {
  return (
    <main>
      <p>
        <a href="/">← Research Hub</a>
      </p>
      <h1>{title}</h1>
      <p>{note}</p>
      <p>Khung Giai đoạn 0. Phần việc thật thuộc {phase} (plan mục 8).</p>
    </main>
  );
}
