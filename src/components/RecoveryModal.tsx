import { useState } from 'react';
import { Check, Copy, Download, ShieldAlert } from 'lucide-react';

interface RecoveryModalProps {
  recoveryPhrase: string;
  walletAddress: string;
  handle: string;
  onConfirmSaved: () => void;
}

export function RecoveryModal({
  recoveryPhrase,
  walletAddress,
  handle,
  onConfirmSaved,
}: RecoveryModalProps) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const words = recoveryPhrase.split(' ');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryPhrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  const handleDownloadBackup = () => {
    const content = [
      'DemoCoin Wallet — Recovery Backup',
      `Handle: @${handle}`,
      `Address: ${walletAddress}`,
      `Created: ${new Date().toISOString()}`,
      '',
      '12-Word Recovery Phrase (Keep private and offline):',
      recoveryPhrase,
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `democoin-recovery-${handle}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-modal-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h2 id="recovery-modal-title" className="text-lg font-semibold text-slate-900">
              Save Your 12-Word Recovery Phrase
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              This phrase is displayed once and only its cryptographic hash is stored. You need all
              12 words to reset your passphrase or Transfer PIN if forgotten.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          {words.map((word, idx) => (
            <div
              key={`${word}-${idx}`}
              className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <span className="font-mono text-xs text-slate-400 tabular-nums w-5">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <span className="font-mono font-medium text-slate-900">{word}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied Phrase' : 'Copy Phrase'}
          </button>
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Download Backup (.txt)
          </button>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4">
          <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
            />
            <span>
              I have saved my 12-word recovery phrase in a secure location and understand it cannot
              be retrieved again.
            </span>
          </label>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={!confirmed}
              onClick={onConfirmSaved}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Continue to Wallet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
