'use client';

import type { Receipt, ReceiptItem } from '@/lib/types';

export interface MetadataDraft {
  storeNumber: string;
  registerNumber: string;
  visitDate: string;
  visitTime: string;
  orderNumber: string;
  totalAmount: string;
  items: ReceiptItem[];
}

export function draftFromReceipt(r: Receipt): MetadataDraft {
  return {
    storeNumber: r.storeNumber ?? '',
    registerNumber: r.registerNumber ?? '',
    visitDate: r.visitDate ?? '',
    visitTime: r.visitTime ?? '',
    orderNumber: r.orderNumber ?? '',
    totalAmount: r.totalAmount != null ? String(r.totalAmount) : '',
    items: r.items ?? [],
  };
}

export default function ReceiptMetadataForm({
  draft,
  onChange,
}: {
  draft: MetadataDraft;
  onChange: (d: MetadataDraft) => void;
}) {
  const set = <K extends keyof MetadataDraft>(key: K, value: MetadataDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const setItem = (i: number, patch: Partial<ReceiptItem>) => {
    const items = draft.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    set('items', items);
  };

  return (
    <div>
      <div className="row" style={{ gap: 10 }}>
        <div className="grow">
          <label className="field" htmlFor="storeNumber">
            Store #
          </label>
          <input
            id="storeNumber"
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={draft.storeNumber}
            onChange={(e) => set('storeNumber', e.target.value)}
          />
        </div>
        <div style={{ width: 90 }}>
          <label className="field" htmlFor="registerNumber">
            KS #
          </label>
          <input
            id="registerNumber"
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={draft.registerNumber}
            onChange={(e) => set('registerNumber', e.target.value)}
          />
        </div>
      </div>

      <div className="row" style={{ gap: 10 }}>
        <div className="grow">
          <label className="field" htmlFor="visitDate">
            Visit date
          </label>
          <input
            id="visitDate"
            type="date"
            value={draft.visitDate}
            onChange={(e) => set('visitDate', e.target.value)}
          />
        </div>
        <div className="grow">
          <label className="field" htmlFor="visitTime">
            Time
          </label>
          <input
            id="visitTime"
            type="time"
            value={draft.visitTime}
            onChange={(e) => set('visitTime', e.target.value)}
          />
        </div>
      </div>

      <div className="row" style={{ gap: 10 }}>
        <div className="grow">
          <label className="field" htmlFor="orderNumber">
            Order #
          </label>
          <input
            id="orderNumber"
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={draft.orderNumber}
            onChange={(e) => set('orderNumber', e.target.value)}
          />
        </div>
        <div className="grow">
          <label className="field" htmlFor="totalAmount">
            Total ($)
          </label>
          <input
            id="totalAmount"
            type="text"
            inputMode="decimal"
            value={draft.totalAmount}
            onChange={(e) => set('totalAmount', e.target.value)}
          />
        </div>
      </div>

      <label className="field">Items</label>
      {draft.items.length === 0 && <p className="muted">None detected.</p>}
      <div className="stack">
        {draft.items.map((item, i) => (
          <div className="row" key={i} style={{ gap: 6 }}>
            <input
              type="text"
              inputMode="numeric"
              aria-label={`Item ${i + 1} quantity`}
              style={{ width: 56, textAlign: 'center' }}
              value={item.qty}
              onChange={(e) => setItem(i, { qty: Number(e.target.value) || 0 })}
            />
            <input
              type="text"
              aria-label={`Item ${i + 1} name`}
              className="grow"
              value={item.name}
              onChange={(e) => setItem(i, { name: e.target.value })}
            />
            <input
              type="text"
              inputMode="decimal"
              aria-label={`Item ${i + 1} price`}
              style={{ width: 82, textAlign: 'right' }}
              value={item.price}
              onChange={(e) => setItem(i, { price: Number(e.target.value) || 0 })}
            />
            <button
              className="btn secondary"
              style={{ padding: '10px 12px' }}
              aria-label={`Remove item ${i + 1}`}
              onClick={() => set('items', draft.items.filter((_, idx) => idx !== i))}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        className="btn secondary"
        style={{ marginTop: 10 }}
        onClick={() => set('items', [...draft.items, { qty: 1, name: '', price: 0 }])}
      >
        + Add item
      </button>
    </div>
  );
}
