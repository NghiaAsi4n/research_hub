import type { HighlightInput } from '@research-hub/core/reader';

type Node = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
  position?: { start: { offset?: number } };
};

// Runs on the parsed tree before React renders it. Only our own page markers
// become elements; all other raw HTML is discarded by react-markdown's skipHtml.
export function readerMarkup(options: { highlights: HighlightInput[] }) {
  return (tree: Node) => {
    function anchors(node: Node) {
      if (node.tagName === 'img') {
        const alt = node.properties?.alt;
        node.tagName = 'span';
        node.properties = {};
        node.children = [
          {
            type: 'text',
            value: typeof alt === 'string' && alt ? `[Ảnh: ${alt}]` : '[Ảnh trong bản gốc]',
          },
        ];
      }
      if (node.type === 'raw') {
        const page = /^<!--\s*page:\s*(\d+)\s*-->$/.exec(node.value ?? '');
        if (page) {
          node.type = 'element';
          node.tagName = 'h2';
          node.properties = { id: `page-${page[1]}`, className: ['reader-page'] };
          node.children = [{ type: 'text', value: `Trang ${page[1]}` }];
          delete node.value;
        }
      } else if (/^h[1-6]$/.test(node.tagName ?? '')) {
        node.properties = { ...node.properties, id: `section-${node.position?.start.offset ?? 0}` };
      }
      for (const child of node.children ?? []) anchors(child);
    }
    anchors(tree);
    const text = (node: Node): string =>
      node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(text).join('');
    const allText = text(tree);
    const ranges = options.highlights.filter(
      (h) => allText.slice(h.startOffset, h.endOffset) === h.quote,
    );
    let offset = 0;
    function mark(node: Node) {
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text') {
          mark(child);
          return [child];
        }
        const value = child.value ?? '';
        const start = offset;
        offset += value.length;
        const overlapping = ranges.filter((h) => h.startOffset < offset && h.endOffset > start);
        const boundaries = [
          ...new Set([
            0,
            value.length,
            ...overlapping.flatMap((h) => [
              Math.max(0, h.startOffset - start),
              Math.min(value.length, h.endOffset - start),
            ]),
          ]),
        ].sort((a, b) => a - b);
        return boundaries.slice(0, -1).map((from, i): Node => {
          const to = boundaries[i + 1] ?? value.length;
          const fragment: Node = { type: 'text', value: value.slice(from, to) };
          return overlapping.some((h) => h.startOffset <= start + from && h.endOffset >= start + to)
            ? { type: 'element', tagName: 'mark', properties: {}, children: [fragment] }
            : fragment;
        });
      });
    }
    mark(tree);
  };
}
