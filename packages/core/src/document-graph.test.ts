import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { buildDocumentGraph, layoutGraph, MAX_GRAPH_EDGES } from './document-graph';

const pg = new PGlite();
const db = drizzle(pg) as unknown as Db;

beforeAll(async () => {
  await pg.exec(`
    create table sources (id uuid primary key default gen_random_uuid());
    create table documents (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      created_at timestamptz not null default now()
    );
    create table document_sources (
      document_id uuid not null references documents(id) on delete cascade,
      source_id uuid not null references sources(id) on delete cascade
    );
    create table notes (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      doc_id uuid references documents(id) on delete set null,
      updated_at timestamptz not null default now()
    );
    create table note_links (
      from_note uuid not null,
      to_note uuid not null
    );
  `);
});

afterAll(() => pg.close());

describe('đồ thị quan hệ tài liệu', () => {
  it('nối hai tài liệu cùng nguồn, ghi chú với tài liệu và hai ghi chú', async () => {
    const source = (
      await pg.query<{ id: string }>('insert into sources default values returning id')
    ).rows[0];
    const docA = (
      await pg.query<{ id: string }>(`insert into documents (title) values ('Luật A') returning id`)
    ).rows[0];
    const docB = (
      await pg.query<{ id: string }>(`insert into documents (title) values ('Luật B') returning id`)
    ).rows[0];
    const noteA = (
      await pg.query<{ id: string }>(
        `insert into notes (title, doc_id) values ('Ghi chú A', $1) returning id`,
        [docA?.id],
      )
    ).rows[0];
    const noteB = (
      await pg.query<{ id: string }>(`insert into notes (title) values ('Ghi chú B') returning id`)
    ).rows[0];

    await pg.query(
      `insert into document_sources (document_id, source_id) values ($1, $3), ($2, $3)`,
      [docA?.id, docB?.id, source?.id],
    );
    await pg.query(`insert into note_links (from_note, to_note) values ($1, $2)`, [
      noteA?.id,
      noteB?.id,
    ]);

    const graph = await buildDocumentGraph(db);
    expect(graph.nodes).toHaveLength(4);
    const kinds = graph.edges.map((edge) => edge.kind).sort();
    expect(kinds).toEqual(['note-document', 'note-link', 'shared-source']);
  });

  it('bố trí nút trên vòng tròn và bỏ cạnh trỏ ra ngoài', () => {
    const nodes = [
      { id: 'a', label: 'A', kind: 'document' as const },
      { id: 'b', label: 'B', kind: 'note' as const },
    ];
    const layout = layoutGraph(
      nodes,
      [
        { from: 'a', to: 'b', kind: 'note-document' },
        { from: 'a', to: 'x', kind: 'note-link' },
      ],
      { width: 400, height: 400 },
    );

    expect(layout.edges).toHaveLength(1);
    expect(
      layout.nodes[0]?.x !== layout.nodes[1]?.x || layout.nodes[0]?.y !== layout.nodes[1]?.y,
    ).toBe(true);
    expect(MAX_GRAPH_EDGES).toBeGreaterThan(0);
  });
});
