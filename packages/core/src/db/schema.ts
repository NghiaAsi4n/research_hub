import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// pgvector và tsvector không có sẵn trong drizzle-orm/pg-core, khai báo bằng customType
// để không phụ thuộc API theo phiên bản.
const embeddingVector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1024)'; // EMBED_DIM chốt ở 1024, xem plan mục 2 và 6
  },
  toDriver(value) {
    return `[${value.join(',')}]`;
  },
  fromDriver(value) {
    return JSON.parse(value as string) as number[];
  },
});

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});

// --- Thu thập ---

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  // TODO(rà soát plan): `kind` chưa được liệt kê giá trị. Tạm dùng: 'web' | 'file' | 'rss' | 'api'.
  kind: text('kind').notNull(),
  url: text('url'),
  domain: text('domain'),
  lang: text('lang'),
  // TODO(rà soát plan): `trust_score` chưa có thang đo. Tạm để real, kỳ vọng 0..1.
  trustScore: real('trust_score'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    author: text('author'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    // Bản Markdown sạch nằm ở Object Storage, không lưu trong DB (plan mục 6.1).
    storageKey: text('storage_key').notNull(),
    hash: text('hash').notNull(),
    // TODO(rà soát plan): chưa liệt kê giá trị. Tạm dùng: 'pending' | 'ready' | 'failed'.
    status: text('status').notNull().default('pending'),
    bytes: integer('bytes'),
    meta: jsonb('meta'),
  },
  (table) => [uniqueIndex('documents_hash_idx').on(table.hash)],
);

export const chunks = pgTable(
  'chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    ord: integer('ord').notNull(),
    text: text('text').notNull(),
    tokenCount: integer('token_count'),
    embedModel: text('embed_model'),
    tsv: tsvector('tsv'),
    embedding: embeddingVector('embedding'),
  },
  (table) => [
    uniqueIndex('chunks_document_ord_idx').on(table.documentId, table.ord),
    index('chunks_tsv_idx').using('gin', table.tsv),
  ],
);

export const collections = pgTable('collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
});

export const collectionItems = pgTable(
  'collection_items',
  {
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
  },
  (table) => [uniqueIndex('collection_items_idx').on(table.collectionId, table.documentId)],
);

// --- Ghi chú ---

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  bodyMd: text('body_md').notNull().default(''),
  docId: uuid('doc_id').references(() => documents.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const noteLinks = pgTable(
  'note_links',
  {
    fromNote: uuid('from_note')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    toNote: uuid('to_note')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
  },
  (table) => [uniqueIndex('note_links_idx').on(table.fromNote, table.toNote)],
);

// --- Phiên research ---

export const runs = pgTable('runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  question: text('question'),
  // TODO(rà soát plan): chưa liệt kê giá trị. Tạm dùng: queued | running | done | failed | expired.
  status: text('status').notNull().default('queued'),
  plan: jsonb('plan'),
  cursor: jsonb('cursor'),
  budgetUnits: integer('budget_units'),
  usedUnits: integer('used_units').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  leaseOwner: text('lease_owner'),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  attempt: integer('attempt').notNull().default(0),
});

export const runSteps = pgTable(
  'run_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    ord: integer('ord').notNull(),
    // TODO(rà soát plan): chưa liệt kê giá trị. Tạm dùng: plan | search | read | reflect | synthesize.
    type: text('type').notNull(),
    // TODO(rà soát plan): chưa liệt kê giá trị. Tạm dùng: pending | done | failed.
    state: text('state').notNull().default('pending'),
    idemKey: text('idem_key').notNull(),
    input: jsonb('input'),
    output: jsonb('output'),
    tokens: integer('tokens'),
    units: integer('units'),
    ms: integer('ms'),
  },
  (table) => [uniqueIndex('run_steps_idem_key_idx').on(table.idemKey)],
);

// --- Trích dẫn ---

export const citations = pgTable('citations', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').references(() => runs.id, { onDelete: 'cascade' }),
  // Ràng buộc then chốt (plan mục 6): phải có ít nhất một nguồn — chunk_id hoặc url.
  // Hai cột đều nullable ở tầng DB; kiểm tra bằng check constraint trong migration.
  chunkId: uuid('chunk_id').references(() => chunks.id, { onDelete: 'set null' }),
  sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'set null' }),
  quote: text('quote'),
  startOffset: integer('start_offset'),
  endOffset: integer('end_offset'),
  url: text('url'),
});

// --- Dữ liệu thị trường (Giai đoạn 6) ---

export const quotes = pgTable(
  'quotes',
  {
    symbol: text('symbol').notNull(),
    ts: timestamp('ts', { withTimezone: true }).notNull(),
    open: real('open'),
    high: real('high'),
    low: real('low'),
    close: real('close'),
    volume: real('volume'),
    source: text('source').notNull(),
    // TODO(rà soát plan): thiếu phân loại mã (cổ phiếu / chỉ số / sàn) và bảng danh mục mã.
  },
  (table) => [uniqueIndex('quotes_symbol_ts_source_idx').on(table.symbol, table.ts, table.source)],
);

// --- Sổ gửi thông báo ---

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // TODO(rà soát plan): chưa liệt kê giá trị. Tạm dùng: briefing | watchlist.
    kind: text('kind').notNull(),
    // in_app | telegram | slack | email
    channel: text('channel').notNull(),
    payloadDigest: text('payload_digest').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    // TODO(rà soát plan): thiếu run_id / watchlist_id nên chưa truy được đã gửi bản tin nào
    // cho kênh nào. Bổ sung khi chốt thiết kế thông báo.
  },
  (table) => [
    uniqueIndex('notifications_kind_channel_digest_idx').on(
      table.kind,
      table.channel,
      table.payloadDigest,
    ),
  ],
);

// --- Theo dõi thay đổi ---

export const watchlist = pgTable('watchlist', {
  id: uuid('id').primaryKey().defaultRandom(),
  query: text('query'),
  sources: jsonb('sources'),
  // Chỉ nhận 'daily' hoặc 'weekly': Vercel Hobby không cho cron chạy dày hơn một lần mỗi ngày.
  cadence: text('cadence').notNull().default('daily'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
});

export const changes = pgTable('changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  watchlistId: uuid('watchlist_id')
    .notNull()
    .references(() => watchlist.id, { onDelete: 'cascade' }),
  diff: jsonb('diff'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- Hàng đợi việc ---

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // TODO(rà soát plan): chưa liệt kê giá trị. Tạm dùng: ingest | reindex | backup | briefing.
    type: text('type').notNull(),
    payload: jsonb('payload'),
    idemKey: text('idem_key'),
    // queued | running | done | failed
    state: text('state').notNull().default('queued'),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    attempt: integer('attempt').notNull().default(0),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('jobs_idem_key_idx').on(table.idemKey),
    index('jobs_state_run_at_idx').on(table.state, table.runAt),
  ],
);

// --- Cấu hình ---

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value'),
  // Không chứa khoá API: khoá chỉ nằm ở biến môi trường (plan mục 8 bước 5, mục 12.1).
});
