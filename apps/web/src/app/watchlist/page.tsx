import { SectionPlaceholder } from '@/components/section-placeholder';

// Khung rỗng: nối cron so diff và thông báo ở Giai đoạn 4.
export default function WatchlistPage() {
  return (
    <SectionPlaceholder
      title="Theo dõi thay đổi"
      note="Cron hằng ngày quét nguồn, so diff và báo thay đổi."
      phase="Giai đoạn 4 — Ghi chú, watchlist, xuất bản"
    />
  );
}
