import { type Db, getDb } from './db/client';
import { documentSources, documents, noteLinks, notes } from './db/schema';

// Đồ thị quan hệ tài liệu (Giai đoạn 4, T5).
//
// Nút là tài liệu và ghi chú; cạnh là nguồn chung, ghi chú gắn tài liệu và liên kết giữa hai ghi chú.
// Có trần số nút/cạnh để trang vẽ được trên gói miễn phí và dữ liệu lớn không làm treo trình duyệt.

export type GraphNode = {
  id: string;
  label: string;
  kind: 'document' | 'note';
};

export type GraphEdge = {
  from: string;
  to: string;
  kind: 'shared-source' | 'note-document' | 'note-link';
};

export type PositionedNode = GraphNode & { x: number; y: number };

export const MAX_GRAPH_NODES = 60;
export const MAX_GRAPH_EDGES = 200;

export function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: { width?: number; height?: number } = {},
): { nodes: PositionedNode[]; edges: GraphEdge[] } {
  const width = options.width ?? 720;
  const height = options.height ?? 520;
  const radius = Math.max(40, Math.min(width, height) / 2 - 60);
  const centerX = width / 2;
  const centerY = height / 2;
  const total = nodes.length;

  const positioned = nodes.map((node, index) => {
    if (total === 1) return { ...node, x: centerX, y: centerY };
    const angle = (2 * Math.PI * index) / total - Math.PI / 2;
    return {
      ...node,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });

  const ids = new Set(nodes.map((node) => node.id));
  const kept = edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  return { nodes: positioned, edges: kept.slice(0, MAX_GRAPH_EDGES) };
}

export async function buildDocumentGraph(
  db?: Db,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const handle = db ?? getDb();
  const [documentRows, noteRows, linkRows, noteLinksRows] = await Promise.all([
    handle
      .select({ id: documents.id, title: documents.title })
      .from(documents)
      .limit(MAX_GRAPH_NODES),
    handle
      .select({ id: notes.id, title: notes.title, docId: notes.docId })
      .from(notes)
      .limit(MAX_GRAPH_NODES),
    handle
      .select({ documentId: documentSources.documentId, sourceId: documentSources.sourceId })
      .from(documentSources),
    handle.select({ from: noteLinks.fromNote, to: noteLinks.toNote }).from(noteLinks),
  ]);

  const nodes: GraphNode[] = [
    ...documentRows.map((row) => ({
      id: `doc:${row.id}`,
      label: row.title.slice(0, 60),
      kind: 'document' as const,
    })),
    ...noteRows.map((row) => ({
      id: `note:${row.id}`,
      label: row.title.slice(0, 60),
      kind: 'note' as const,
    })),
  ].slice(0, MAX_GRAPH_NODES);

  const known = new Set(nodes.map((node) => node.id));
  const edges: GraphEdge[] = [];

  const bySource = new Map<string, string[]>();
  for (const row of linkRows) {
    const list = bySource.get(row.sourceId) ?? [];
    list.push(`doc:${row.documentId}`);
    bySource.set(row.sourceId, list);
  }
  for (const documentIds of bySource.values()) {
    for (let index = 0; index < documentIds.length - 1; index += 1) {
      const from = documentIds[index];
      const to = documentIds[index + 1];
      if (from !== undefined && to !== undefined) {
        edges.push({ from, to, kind: 'shared-source' });
      }
    }
  }

  for (const row of noteRows) {
    if (row.docId !== null) {
      edges.push({ from: `note:${row.id}`, to: `doc:${row.docId}`, kind: 'note-document' });
    }
  }

  for (const row of noteLinksRows) {
    edges.push({ from: `note:${row.from}`, to: `note:${row.to}`, kind: 'note-link' });
  }

  return {
    nodes,
    edges: edges
      .filter((edge) => known.has(edge.from) && known.has(edge.to))
      .slice(0, MAX_GRAPH_EDGES),
  };
}
