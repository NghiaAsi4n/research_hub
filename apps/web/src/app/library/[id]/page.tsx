import { documentIdSchema } from '@research-hub/core/reader';
import { notFound } from 'next/navigation';
import { ReaderLoader } from '@/components/reader/reader-loader';
import '../reader.css';

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!documentIdSchema.safeParse(id).success) notFound();
  return <ReaderLoader key={id} id={id} />;
}
