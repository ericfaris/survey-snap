import ResultPanel from '@/components/ResultPanel';

export const dynamic = 'force-dynamic';

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResultPanel receiptId={id} />;
}
