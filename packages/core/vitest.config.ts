import { defineConfig } from 'vitest/config';

// PGlite dựng cả một Postgres trong tiến trình; chạy 40+ worker song song làm hook khởi tạo
// vượt 10 giây. Giới hạn worker để bộ test tích hợp chạy ổn định trên máy ít RAM.
export default defineConfig({
  test: {
    maxWorkers: 2,
  },
});
