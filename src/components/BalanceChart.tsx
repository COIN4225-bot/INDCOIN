import { useMemo, useState } from 'react';
import { formatDmcNumber, formatTimestamp } from '../lib/format';
import type { TransactionRecord } from '../types/wallet';

interface BalanceChartProps {
  transactions: TransactionRecord[];
  walletAddress: string;
  currentBalanceCents: number;
}

interface ChartPoint {
  label: string;
  timestamp: string;
  balanceCents: number;
  deltaCents: number;
}

export function BalanceChart({
  transactions,
  walletAddress,
  currentBalanceCents,
}: BalanceChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const points = useMemo<ChartPoint[]>(() => {
    if (transactions.length === 0) {
      return [
        {
          label: 'Current',
          timestamp: new Date().toISOString(),
          balanceCents: currentBalanceCents,
          deltaCents: 0,
        },
      ];
    }

    const chronological = [...transactions].sort((a, b) => a.sequence - b.sequence);
    let running = 0;
    const computed: ChartPoint[] = chronological.map((tx) => {
      const isOutgoing = tx.fromAddress === walletAddress;
      const deltaCents = isOutgoing ? -tx.amountCents : tx.amountCents;
      running += deltaCents;
      return {
        label: `#${tx.sequence}`,
        timestamp: tx.createdAt,
        balanceCents: running,
        deltaCents,
      };
    });

    if (computed.length === 1) {
      return [
        {
          label: 'Start',
          timestamp: computed[0].timestamp,
          balanceCents: 0,
          deltaCents: 0,
        },
        computed[0],
      ];
    }

    return computed;
  }, [transactions, walletAddress, currentBalanceCents]);

  const width = 640;
  const height = 210;
  const padX = 18;
  const padY = 20;

  const balances = points.map((p) => p.balanceCents);
  const minVal = Math.min(...balances, 0);
  const maxVal = Math.max(...balances, 100_00);
  const span = Math.max(maxVal - minVal, 10_00);

  const coords = points.map((pt, idx) => {
    const x =
      points.length === 1
        ? width / 2
        : padX + (idx / (points.length - 1)) * (width - padX * 2);
    const y =
      height - padY - ((pt.balanceCents - minVal) / span) * (height - padY * 2);
    return { x, y, point: pt };
  });

  const linePath = coords
    .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');

  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(height - padY).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(height - padY).toFixed(1)} Z`
      : '';

  const activeCoord =
    hoveredIndex !== null && coords[hoveredIndex]
      ? coords[hoveredIndex]
      : coords[coords.length - 1];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Balance Trajectory</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Running wallet balance across confirmed ledger entries
          </p>
        </div>
        {activeCoord && (
          <div className="text-right">
            <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
              {formatDmcNumber(activeCoord.point.balanceCents)} DMC
            </div>
            <div className="text-xs text-slate-500 tabular-nums">
              {activeCoord.point.label} · {formatTimestamp(activeCoord.point.timestamp)}
            </div>
          </div>
        )}
      </div>

      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-48 overflow-visible"
          role="img"
          aria-label="Wallet balance history chart"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <defs>
            <linearGradient id="dmcAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padY + (1 - frac) * (height - padY * 2);
            return (
              <line
                key={frac}
                x1={padX}
                y1={y}
                x2={width - padX}
                y2={y}
                stroke="#E2E8F0"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
            );
          })}

          {areaPath && <path d={areaPath} fill="url(#dmcAreaGrad)" />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#059669"
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {coords.map((c, idx) => {
            const isHovered = hoveredIndex === idx;
            return (
              <g key={`${c.point.label}-${idx}`}>
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={isHovered ? 5 : 3.25}
                  fill={isHovered ? '#047857' : '#FFFFFF'}
                  stroke="#059669"
                  strokeWidth={2}
                />
                <rect
                  x={c.x - 16}
                  y={0}
                  width={32}
                  height={height}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(idx)}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
