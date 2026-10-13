import { SectionPlaceholder } from '@/components/section-placeholder';

// Khung rỗng: nối chunking, tìm kiếm lai và chat trích dẫn ở Giai đoạn 2.
export default function ChatPage() {
  return (
    <SectionPlaceholder
      title="Hỏi đáp có trích dẫn"
      note="Tìm lai full-text và vector trên kho tài liệu."
      phase="Giai đoạn 2 — Chỉ mục và chat có trích dẫn"
    />
  );
}
