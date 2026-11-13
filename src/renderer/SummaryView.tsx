import type { PositionResult } from '../shared/pnl';
import { allocation, extremes, type AllocationRow } from '../shared/summary';
import { direction, formatMoney, formatSignedPercent } from './format';
import { Change } from './PositionCard';

interface Props {
  results: PositionResult[];
}

/** Every position in one table: how big it is, how it moved today, and how it has done overall. */
export function SummaryView({ results }: Props) {
  const rows = allocation(results);
  const today = extremes(rows, 'dayChangePct');
  const overall = extremes(rows, 'pnlPct');

  if (rows.length === 0) {
    return <p className="empty">Prices are needed for the summary. They will appear here once they load.</p>;
  }

  return (
    <section className="card summary">
      <table className="summary-table">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Share of portfolio</th>
            <th className="num">Value</th>
            <th className="num">Today</th>
            <th className="num">Total P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.ticker}>
              <td>{row.ticker}</td>
              <td>
                <div className="weight">
                  <span className="weight-track">
                    {/* React sets this width through the DOM style object, which the Content Security Policy allows. */}
                    <span className="weight-bar" style={{ width: `${row.weight}%` }} />
                  </span>
                  <span className="small muted">{row.weight.toFixed(1)}%</span>
                </div>
              </td>
              <td className="num">{formatMoney(row.marketValue)}</td>
              <td className="num">
                <PercentChange value={row.dayChangePct} />
              </td>
              <td className="num">
                <Change value={row.pnl} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {(today || overall) && (
        <dl className="movers">
          {today && <Mover label="Today" best={today.best} worst={today.worst} by="dayChangePct" />}
          {overall && <Mover label="Overall" best={overall.best} worst={overall.worst} by="pnlPct" />}
        </dl>
      )}
    </section>
  );
}

interface MoverProps {
  label: string;
  best: AllocationRow;
  worst: AllocationRow;
  by: 'dayChangePct' | 'pnlPct';
}

function Mover({ label, best, worst, by }: MoverProps) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        Best {best.ticker} <PercentChange value={best[by]} />, worst {worst.ticker} <PercentChange value={worst[by]} />
      </dd>
    </div>
  );
}

function PercentChange({ value }: { value: number }) {
  return <span className={`change ${direction(value)}`}>{formatSignedPercent(value)}</span>;
}
