import { useState } from 'react';
import type { Lot, Position } from '../shared/types';
import { formatDate, formatMoney, formatShares } from './format';

interface Props {
  position: Position;
  onEdit: (lot: Lot) => void;
  onDelete: (lot: Lot) => Promise<void>;
}

export function PositionCard({ position, onEdit, onDelete }: Props) {
  return (
    <section className="card">
      <header className="card-header">
        <h3>{position.ticker}</h3>
        <span className="muted">
          {formatShares(position.shares)} {position.shares === 1 ? 'share' : 'shares'}
        </span>
      </header>

      <dl className="card-stats">
        <div>
          <dt>Avg cost</dt>
          <dd>{formatMoney(position.avgCost)}</dd>
        </div>
        <div>
          <dt>Cost basis</dt>
          <dd>{formatMoney(position.costBasis)}</dd>
        </div>
      </dl>

      <ul className="lots">
        {position.lots.map((lot) => (
          <LotRow key={lot.id} lot={lot} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </ul>
    </section>
  );
}

function LotRow({ lot, onEdit, onDelete }: { lot: Lot } & Omit<Props, 'position'>) {
  // Deleting asks for a second click in place, instead of a pop-up dialog.
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="lot">
      <div className="lot-main">
        <span>
          {formatShares(lot.shares)} @ {formatMoney(lot.buyPrice)}
        </span>
        <span className="muted small">{formatDate(lot.boughtOn)}</span>
      </div>
      <div className="lot-actions">
        {confirming ? (
          <>
            <button className="link danger" onClick={() => onDelete(lot)}>
              Delete
            </button>
            <button className="link" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </>
        ) : (
          <>
            <button className="link" onClick={() => onEdit(lot)}>
              Edit
            </button>
            <button className="link" onClick={() => setConfirming(true)}>
              Remove
            </button>
          </>
        )}
      </div>
    </li>
  );
}
