import { buildDocumentGraph, layoutGraph } from '@research-hub/core/document-graph';
import { guardRequest } from '@/lib/guard';

export async function GET() {
  const auth = await guardRequest({ route: 'graph' });
  if (!auth.ok) return auth.response;

  const graph = await buildDocumentGraph();
  return Response.json(layoutGraph(graph.nodes, graph.edges), {
    headers: { 'cache-control': 'private, no-store' },
  });
}
