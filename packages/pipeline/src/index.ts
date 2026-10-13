// Điểm vào của chế độ chạy máy (plan mục 12.2).
//
// Giai đoạn 0 mới có khung: tiến trình này sẽ nhặt việc từ bảng `jobs` bằng cùng cơ chế lease
// ở mục 7.2 và gọi Ollama local. Phần thật thuộc Giai đoạn 1 (ingest) và Giai đoạn 2 (embedding).
//
// Chạy: pnpm --filter @research-hub/pipeline local
export function describeLocalMode(): string {
  return 'Chế độ chạy máy: nhặt jobs bằng lease, gọi Ollama local, ghi kết quả vào cùng Neon.';
}
