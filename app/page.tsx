import Link from 'next/link';
import HistoryList from '@/components/HistoryList';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Snap a receipt</h2>
        <p className="muted">
          Photograph a McDonald&apos;s receipt, check the 26-digit survey code, review the staged
          answers, then submit.
        </p>
        <Link className="btn block" href="/capture">
          📷 New receipt
        </Link>
      </div>

      <HistoryList />
    </div>
  );
}
