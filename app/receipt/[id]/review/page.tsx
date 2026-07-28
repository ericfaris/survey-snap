import ReviewPanel from '@/components/ReviewPanel';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReviewPanel receiptId={id} />;
}
