import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, Copy, X } from 'lucide-react';
import { formatDmc, formatTimestamp } from '../lib/format';
import type { TransactionRecord } from '../types/wallet';

interface TransactionReceiptModalProps {
  transaction: TransactionRecord | null;
  walletAddress: string;
  onClose: () => void;
}

export function TransactionReceiptModal({
  transaction,
  walletAddress,
  onClose,
}: TransactionReceiptModalProps) {
  const [copiedHash, setCopiedHash] = useState(false);

  if (!transaction) return null;

  const isOutgoing = transaction.fromAddress === walletAddress;

  const handleCopyHash = async () => {
    try {
      await navigator.clipboard.writeText(transaction.txHash);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
                isOutgoing
                  ? 'border-slate-200 bg-slate-50 text-slate-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              {isOutgoing ? (
                <ArrowUpRight className="h-5 w-5" />
              ) : (
                <ArrowDownLeft className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 id="receipt-modal-title" className="text-base font-semibold text-slate-900">
                Transaction Receipt
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                Ledger Entry #{transaction.sequence} · Confirmed · {formatTimestamp(transaction.createdAt)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="py-5 text-center border-b border-slate-100">
          <div className="text-xs font-medium text-slate-500">
            {isOutgoing ? 'Sent to Peer' : 'Received into Wallet'}
          </div>
          <div
            className={`mt-1 font-mono text-3xl font-semibold tabular-nums ${
              isOutgoing ? 'text-slate-900' : 'text-emerald-700'
            }`}
          >
            {formatDmc(transaction.amountCents, { showSign: true, isOutgoing })}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Network Fee: <span className="font-mono tabular-nums">0.00 DMC</span>
          </div>
        </div>

        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-slate-500 shrink-0">From</dt>
            <dd className="text-right">
              <div className="font-medium text-slate-900">
                {transaction.fromName} (@{transaction.fromHandle})
              </div>
              <div className="font-mono text-xs text-slate-500 break-all">
                {transaction.fromAddress}
              </div>
            </dd>
          </div>

          <div className="flex items-start justify-between gap-4">
            <dt className="text-slate-500 shrink-0">To</dt>
            <dd className="text-right">
              <div className="font-medium text-slate-900">
                {transaction.toName} (@{transaction.toHandle})
              </div>
              <div className="font-mono text-xs text-slate-500 break-all">
                {transaction.toAddress}
              </div>
            </dd>
          </div>

          <div className="flex items-start justify-between gap-4">
            <dt className="text-slate-500 shrink-0">Memo</dt>
            <dd className="text-right text-slate-800">{transaction.memo}</dd>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <dt className="text-xs text-slate-500 mb-1">Cryptographic Transaction Hash</dt>
            <dd className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="font-mono text-xs text-slate-700 truncate">
                {transaction.txHash}
              </span>
              <button
                type="button"
                onClick={handleCopyHash}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedHash ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </button>
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
