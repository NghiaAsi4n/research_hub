'use client';

import { useEffect, useState } from 'react';

type Node = {
  id: string;
  label: string;
  kind: 'document' | 'note';
  x: number;
  y: number;
};

type Edge = { from: string; to: string; kind: 'shared-source' | 'note-document' | 'note-link' };

type GraphPayload = { nodes: Node[]; edges: Edge[] };

const EDGE_LABELS: Record<Edge['kind'], string> = {
  'shared-source': 'nguồn chung',
  'note-document': 'ghi chú gắn tài liệu',
  'note-link': 'liên kết ghi chú',
};

export function Graph() {
  const [graph, setGraph] = useState<GraphPayload>({ nodes: [], edges: [] });
  const [status, setStatus] = useState('Đang tải đồ thị…');

  useEffect(() => {
    let active = true;
    fetch('/api/graph')
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as GraphPayload;
      })
      .then((payload) => {
        if (!active) return;
        setGraph(payload);
        setStatus(payload.nodes.length === 0 ? 'Chưa có tài liệu hoặc ghi chú để vẽ.' : '');
      })
      .catch(() => {
        if (active) setStatus('Không tải được đồ thị.');
      });
    return () => {
      active = false;
    };
  }, []);

  const positions = new Map(graph.nodes.map((node) => [node.id, node]));

  return (
    <main>
      <p>
        <a href="/">← Research Hub</a>
      </p>
      <h1>Đồ thị quan hệ tài liệu</h1>
      <p>
        Nút là tài liệu và ghi chú; cạnh là nguồn chung, ghi chú gắn tài liệu, liên kết ghi chú.
      </p>
      {status ? <p role="status">{status}</p> : null}

      {graph.nodes.length > 0 ? (
        <svg
          viewBox="0 0 720 520"
          role="img"
          aria-label="Đồ thị quan hệ tài liệu"
          className="graph-svg"
        >
          {graph.edges.map((edge) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            return (
              <line
                key={`${edge.from}-${edge.to}-${edge.kind}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="currentColor"
                strokeOpacity={edge.kind === 'shared-source' ? 0.25 : 0.45}
                strokeDasharray={edge.kind === 'note-link' ? '4 3' : undefined}
              />
            );
          })}
          {graph.nodes.map((node) => (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={node.kind === 'document' ? 7 : 5}
                fill={node.kind === 'document' ? 'var(--accent)' : 'var(--muted)'}
              >
                <title>{node.label}</title>
              </circle>
              <text x={node.x + 9} y={node.y + 3} fontSize="9" fill="currentColor">
                {node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label}
              </text>
            </g>
          ))}
        </svg>
      ) : null}

      <ul className="graph-legend">
        {Object.entries(EDGE_LABELS).map(([kind, label]) => (
          <li key={kind}>
            {label}: {graph.edges.filter((edge) => edge.kind === kind).length} cạnh
          </li>
        ))}
      </ul>
    </main>
  );
}
