import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { isExportKind, loadExportDocument } from '@/lib/export-source';
import '../../read.css';

// Bản đọc chỉ-đọc (Giai đoạn 4, T4): không có ô soạn hay nút lưu, chỉ nội dung và liên kết xuất.
export default async function ReadPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!isExportKind(kind)) notFound();

  const document = await loadExportDocument(kind, id);
  if (document === null) notFound();

  return (
    <main className="read-only">
      <p className="no-print">
        <a href="/">← Research Hub</a>
      </p>
      <article>
        <h1>{document.title}</h1>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{document.markdown}</ReactMarkdown>
      </article>
      <p className="no-print">
        Bản đọc chỉ-đọc — nội dung không sửa được ở đây. Tải bản khác:{' '}
        <a href={`/api/export/${kind}/${id}?format=md`}>Markdown</a>{' '}
        <a href={`/api/export/${kind}/${id}?format=pdf`}>PDF</a>{' '}
        <a href={`/api/export/${kind}/${id}?format=docx`}>DOCX</a>
      </p>
    </main>
  );
}
