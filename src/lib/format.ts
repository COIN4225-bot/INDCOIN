import type { TransactionRecord } from '../types/wallet';

export function formatDmc(cents: number, options?: { showSign?: boolean; isOutgoing?: boolean }): string {
  const absVal = Math.abs(cents) / 100;
  const formatted = absVal.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (options?.showSign) {
    return `${options.isOutgoing ? '-' : '+'}${formatted} DMC`;
  }
  return `${formatted} DMC`;
}

export function formatDmcNumber(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function truncateAddress(address: string, start = 10, end = 6): string {
  if (address.length <= start + end + 3) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function exportTransactionsCsv(
  transactions: TransactionRecord[],
  walletAddress: string,
  handle?: string,
): { filename: string; count: number } {
  const headers = [
    'Sequence',
    'Timestamp (ISO)',
    'Local Date',
    'Direction',
    'Type',
    'Counterparty Name',
    'Counterparty Handle',
    'From Handle',
    'From Address',
    'To Handle',
    'To Address',
    'Amount (DMC)',
    'Signed Amount (DMC)',
    'Fee (DMC)',
    'Memo',
    'Status',
    'Transaction Hash',
  ];

  const escapeCsv = (val: string | number): string => {
    let str = String(val);
    if (typeof val === 'string' && /^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = transactions.map((tx) => {
    const isOutgoing = tx.fromAddress === walletAddress;
    const direction = isOutgoing ? 'Sent' : 'Received';
    const amountStr = (tx.amountCents / 100).toFixed(2);
    const signedAmount = Number(
      ((isOutgoing ? -tx.amountCents : tx.amountCents) / 100).toFixed(2),
    );
    return [
      tx.sequence,
      tx.createdAt,
      formatTimestamp(tx.createdAt),
      direction,
      tx.kind,
      isOutgoing ? tx.toName : tx.fromName,
      isOutgoing ? tx.toHandle : tx.fromHandle,
      tx.fromHandle,
      tx.fromAddress,
      tx.toHandle,
      tx.toAddress,
      amountStr,
      signedAmount,
      (tx.feeCents / 100).toFixed(2),
      tx.memo,
      tx.status,
      tx.txHash,
    ]
      .map(escapeCsv)
      .join(',');
  });

  const dateStamp = new Date().toISOString().slice(0, 10);
  const label = handle ? handle.replace(/[^a-z0-9_-]/gi, '') : walletAddress.slice(0, 10);
  const filename = `democoin-ledger-${label}-${dateStamp}.csv`;

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { filename, count: transactions.length };
}

