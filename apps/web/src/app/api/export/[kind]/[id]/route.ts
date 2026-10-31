import {
  contentTypeFor,
  type ExportFormat,
  exportFilename,
  renderDocument,
} from '@research-hub/core/export-doc';
import { isExportKind, loadExportDocument } from '@/lib/export-source';
import { guardRequest } from '@/lib/guard';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATS: ExportFormat[] = ['md', 'pdf', 'docx'];

function isFormat(value: string | null): value is ExportFormat {
  return value !== null && (FORMATS as string[]).includes(value);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const auth = await guardRequest({ route: 'export' });
  if (!auth.ok) return auth.response;

  const { kind, id } = await params;
  if (!isExportKind(kind) || !UUID_PATTERN.test(id)) {
    return Response.json({ error: 'invalid_target' }, { status: 400 });
  }

  const format = new URL(request.url).searchParams.get('format') ?? 'md';
  if (!isFormat(format)) {
    return Response.json({ error: 'invalid_format' }, { status: 400 });
  }

  const document = await loadExportDocument(kind, id);
  if (document === null) return Response.json({ error: 'not_found' }, { status: 404 });

  const bytes = await renderDocument(document, format);
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': contentTypeFor(format),
      'content-disposition': `attachment; filename="${exportFilename(document.title, format)}"`,
      'cache-control': 'private, no-store',
    },
  });
}
