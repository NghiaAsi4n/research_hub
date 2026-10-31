import type { ExportDocument } from '@research-hub/core/export-doc';
import { createNoteStore } from '@research-hub/core/note-store';
import { renderResearchReport } from '@research-hub/core/research-report';
import { getResearchRun } from '@research-hub/core/research-store';

export type ExportKind = 'note' | 'run';

export function isExportKind(value: string): value is ExportKind {
  return value === 'note' || value === 'run';
}

// Dựng nội dung xuất từ dữ liệu thật: ghi chú đọc từ note store, báo cáo dựng lại từ state của run.
export async function loadExportDocument(
  kind: ExportKind,
  id: string,
): Promise<ExportDocument | null> {
  if (kind === 'note') {
    const note = await createNoteStore().read(id);
    if (note === null) return null;
    return { title: note.title, markdown: note.bodyMd };
  }

  const run = await getResearchRun(id);
  if (run === null) return null;
  return {
    title: run.state.question || 'Báo cáo nghiên cứu',
    markdown: renderResearchReport(run.state),
  };
}
