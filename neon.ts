import { defineConfig } from '@neon/config/v1';

// Bucket này giữ cả file gốc (prefix raw/) và bản Markdown sạch (prefix md/);
// DB chỉ lưu storage_key, theo mục 6.1 của research-hub-plan.md.
export default defineConfig({
  auth: true,
  buckets: {
    'research-hub-media': { access: 'private' },
  },
});
