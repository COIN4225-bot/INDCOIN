import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Camera,
  Check,
  Copy,
  Download,
  History,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Share2,
  Shield,
  ShieldAlert,
  Snowflake,
  Unlock,
  UserCheck,
  X,
} from 'lucide-react';
import {
  claimFaucet,
  fetchDashboard,
  lookupPeer,
  revokeAllSessions,
  sendTransfer,
  updateSecuritySettings,
} from '../lib/api';
import {
  exportTransactionsCsv,
  formatDmc,
  formatDmcNumber,
  formatTimestamp,
  truncateAddress,
} from '../lib/format';
import type { PeerSummary, TransactionRecord, WalletDashboardData } from '../types/wallet';
import { BalanceChart } from './BalanceChart';
import { QrCodeSvg } from './QrCodeSvg';
import { QrScannerPanel, type ScannedQrPayload } from './QrScannerPanel';
import { TransactionReceiptModal } from './TransactionReceiptModal';

type NavSection = 'overview' | 'transfer' | 'transactions' | 'security';
type TxFilter = 'all' | 'received' | 'sent' | 'faucet';

interface WalletDashboardProps {
  token: string;
  data: WalletDashboardData;
  onDataChange: (next: WalletDashboardData) => void;
  onLockWallet: () => void;
}

export function WalletDashboard({
  token,
  data,
  onDataChange,
  onLockWallet,
}: WalletDashboardProps) {
  const { wallet, transactions, peers, auditLog } = data;

  const [section, setSection] = useState<NavSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<TransactionRecord | null>(null);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Faucet & global notice state
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<{
    tone: 'success' | 'error';
    text: string;
    tx?: TransactionRecord;
  } | null>(null);

  // Send P2P state
  const [recipientInput, setRecipientInput] = useState('');
  const [verifiedPeer, setVerifiedPeer] = useState<PeerSummary | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [memoInput, setMemoInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [sending, setSending] = useState(false);

  // Receive QR & Scanner state
  const [receiveMode, setReceiveMode] = useState<'myqr' | 'scan'>('myqr');
  const [requestAmount, setRequestAmount] = useState('');
  const [requestMemo, setRequestMemo] = useState('');
  const [sharedMyAddr, setSharedMyAddr] = useState(false);
  const [scannedPayload, setScannedPayload] = useState<ScannedQrPayload | null>(null);
  const [scannedPeer, setScannedPeer] = useState<PeerSummary | null>(null);
  const [copiedScanned, setCopiedScanned] = useState(false);
  const [sharedScanned, setSharedScanned] = useState(false);

  // Transactions filter state
  const [txFilter, setTxFilter] = useState<TxFilter>('all');
  const [txSearch, setTxSearch] = useState('');

  // Security Center state
  const [freezePin, setFreezePin] = useState('');
  const [freezeBusy, setFreezeBusy] = useState(false);
  const [perTxInput, setPerTxInput] = useState(String(Math.round(wallet.perTxLimitCents / 100)));
  const [dailyLimitInput, setDailyLimitInput] = useState(
    String(Math.round(wallet.dailyLimitCents / 100)),
  );
  const [limitsPin, setLimitsPin] = useState('');
  const [limitsBusy, setLimitsBusy] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [revokingSessions, setRevokingSessions] = useState(false);

  const sectionLabel: Record<NavSection, string> = {
    overview: 'Overview',
    transfer: 'Send & Receive',
    transactions: 'Transactions',
    security: 'Security Center',
  };

  const paymentUri = useMemo(() => {
    const params = new URLSearchParams();
    const amt = Number(requestAmount);
    if (requestAmount.trim() && Number.isFinite(amt) && amt > 0) {
      params.set('amount', amt.toFixed(2));
    }
    if (requestMemo.trim()) {
      params.set('memo', requestMemo.trim());
    }
    const qs = params.toString();
    return qs ? `democoin:${wallet.address}?${qs}` : `democoin:${wallet.address}`;
  }, [wallet.address, requestAmount, requestMemo]);

  const filteredTransactions = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    return transactions.filter((tx) => {
      const isOutgoing = tx.fromAddress === wallet.address;
      if (txFilter === 'received' && isOutgoing) return false;
      if (txFilter === 'sent' && !isOutgoing) return false;
      if (txFilter === 'faucet' && tx.kind !== 'faucet' && tx.kind !== 'welcome') return false;
      if (!q) return true;
      return (
        tx.fromHandle.toLowerCase().includes(q) ||
        tx.toHandle.toLowerCase().includes(q) ||
        tx.fromName.toLowerCase().includes(q) ||
        tx.toName.toLowerCase().includes(q) ||
        tx.fromAddress.toLowerCase().includes(q) ||
        tx.toAddress.toLowerCase().includes(q) ||
        tx.memo.toLowerCase().includes(q) ||
        tx.txHash.toLowerCase().includes(q)
      );
    });
  }, [transactions, wallet.address, txFilter, txSearch]);

  const dailyPct = Math.min(
    100,
    Math.round((wallet.dailySpentCents / Math.max(wallet.dailyLimitCents, 1)) * 100),
  );

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const handleCopyPaymentUri = async () => {
    try {
      await navigator.clipboard.writeText(paymentUri);
      setCopiedUri(true);
      setTimeout(() => setCopiedUri(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const handleShareText = async (
    title: string,
    text: string,
    onDone: () => void,
  ) => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text });
        onDone();
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      onDone();
    } catch {
      // Clipboard blocked
    }
  };

  const handleQrDetected = async (payload: ScannedQrPayload) => {
    setScannedPayload(payload);
    setScannedPeer(null);
    setReceiveMode('myqr');

    const localMatch = peers.find(
      (p) =>
        p.address.toLowerCase() === payload.address.toLowerCase() ||
        p.handle.toLowerCase() === payload.address.replace(/^@/, '').toLowerCase(),
    );
    if (localMatch) {
      setScannedPeer(localMatch);
      return;
    }
    try {
      const res = await lookupPeer(token, payload.address);
      setScannedPeer(res.peer);
    } catch {
      // External or unrecognized address still remains captured for copy/share
    }
  };

  const handleApplyScannedToSend = () => {
    if (!scannedPayload) return;
    const target = scannedPeer ? `@${scannedPeer.handle}` : scannedPayload.address;
    setRecipientInput(target);
    if (scannedPeer) {
      setVerifiedPeer(scannedPeer);
      setLookupError(null);
    } else {
      void handleLookupPeer(target);
    }
    if (scannedPayload.amount) setAmountInput(scannedPayload.amount);
    if (scannedPayload.memo) setMemoInput(scannedPayload.memo);
    setBannerMessage({
      tone: 'success',
      text: `Loaded scanned wallet ${scannedPeer ? `@${scannedPeer.handle}` : truncateAddress(scannedPayload.address)} into Send DemoCoins.`,
    });
  };

  const handleExportCsv = (list: TransactionRecord[]) => {
    if (list.length === 0) return;
    const { filename, count } = exportTransactionsCsv(list, wallet.address, wallet.handle);
    setBannerMessage({
      tone: 'success',
      text: `Exported ${count} transaction${count === 1 ? '' : 's'} to ${filename}.`,
    });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const next = await fetchDashboard(token);
      onDataChange(next);
    } catch (err) {
      setBannerMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Unable to refresh wallet state.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleClaimFaucet = async () => {
    setFaucetLoading(true);
    setBannerMessage(null);
    try {
      const res = await claimFaucet(token);
      onDataChange(res.dashboard);
      setBannerMessage({
        tone: 'success',
        text: 'Received +250.00 DMC from DemoCoin Treasury Faucet.',
        tx: res.transaction,
      });
    } catch (err) {
      setBannerMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Unable to claim DemoCoins.',
      });
    } finally {
      setFaucetLoading(false);
    }
  };

  const handleLookupPeer = async (rawValue: string) => {
    const val = rawValue.trim();
    if (!val) {
      setVerifiedPeer(null);
      setLookupError(null);
      return;
    }
    const localMatch = peers.find(
      (p) =>
        p.address.toLowerCase() === val.toLowerCase() ||
        p.handle.toLowerCase() === val.replace(/^@/, '').toLowerCase(),
    );
    if (localMatch) {
      setVerifiedPeer(localMatch);
      setLookupError(null);
      return;
    }
    try {
      const res = await lookupPeer(token, val);
      setVerifiedPeer(res.peer);
      setLookupError(null);
    } catch (err) {
      setVerifiedPeer(null);
      setLookupError(err instanceof Error ? err.message : 'Peer not found.');
    }
  };

  const handleSelectPeer = (peer: PeerSummary) => {
    setRecipientInput(`@${peer.handle}`);
    setVerifiedPeer(peer);
    setLookupError(null);
  };

  const handleSendSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBannerMessage(null);
    setSending(true);
    try {
      const res = await sendTransfer(token, {
        recipient: recipientInput.trim(),
        amount: Number(amountInput),
        memo: memoInput.trim(),
        pin: pinInput.trim(),
      });
      onDataChange(res.dashboard);
      setBannerMessage({
        tone: 'success',
        text: `Sent ${formatDmc(res.transaction.amountCents)} to @${res.transaction.toHandle}.`,
        tx: res.transaction,
      });
      setAmountInput('');
      setMemoInput('');
      setPinInput('');
    } catch (err) {
      setBannerMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Transfer failed.',
      });
    } finally {
      setSending(false);
    }
  };

  const handleToggleFreeze = async (e: FormEvent) => {
    e.preventDefault();
    setBannerMessage(null);
    setFreezeBusy(true);
    try {
      const res = await updateSecuritySettings(token, {
        currentPin: freezePin,
        isFrozen: !wallet.isFrozen,
      });
      onDataChange(res.dashboard);
      setFreezePin('');
      setBannerMessage({
        tone: 'success',
        text: res.dashboard.wallet.isFrozen
          ? 'Wallet frozen. Outgoing transfers are now blocked.'
          : 'Wallet unfrozen. Outgoing transfers are enabled.',
      });
    } catch (err) {
      setBannerMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Failed to update freeze status.',
      });
    } finally {
      setFreezeBusy(false);
    }
  };

  const handleUpdateLimits = async (e: FormEvent) => {
    e.preventDefault();
    setBannerMessage(null);
    setLimitsBusy(true);
    try {
      const res = await updateSecuritySettings(token, {
        currentPin: limitsPin,
        perTxLimit: Number(perTxInput),
        dailyLimit: Number(dailyLimitInput),
      });
      onDataChange(res.dashboard);
      setLimitsPin('');
      setBannerMessage({
        tone: 'success',
        text: 'Transfer security limits updated and logged.',
      });
    } catch (err) {
      setBannerMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Failed to update limits.',
      });
    } finally {
      setLimitsBusy(false);
    }
  };

  const handleChangePin = async (e: FormEvent) => {
    e.preventDefault();
    setBannerMessage(null);
    setPinBusy(true);
    try {
      const res = await updateSecuritySettings(token, {
        currentPin: oldPin,
        newPin,
      });
      onDataChange(res.dashboard);
      setOldPin('');
      setNewPin('');
      setBannerMessage({
        tone: 'success',
        text: '6-digit Transfer PIN updated successfully.',
      });
    } catch (err) {
      setBannerMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Unable to rotate Transfer PIN.',
      });
    } finally {
      setPinBusy(false);
    }
  };

  const handleRevokeAll = async () => {
    setRevokingSessions(true);
    try {
      await revokeAllSessions(token);
      onLockWallet();
    } catch (err) {
      setBannerMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Failed to revoke sessions.',
      });
      setRevokingSessions(false);
    }
  };

  const navItems: { id: NavSection; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'transfer', label: 'Send & Receive', icon: ArrowLeftRight },
    { id: 'transactions', label: 'Transactions', icon: History },
    { id: 'security', label: 'Security Center', icon: Shield },
  ];

  const renderNavContent = () => (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="px-4 py-5 border-b border-slate-200">
          <div className="font-display text-lg font-bold tracking-tight text-slate-900">
            DemoCoin Wallet
          </div>
          <div className="text-xs text-slate-500 mt-0.5">P2P DemoCoin Network</div>
        </div>

        <nav className="p-3 space-y-1" aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSection(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-200 p-4 space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-900 truncate">{wallet.displayName}</div>
          <div className="font-mono text-xs text-slate-500 truncate">@{wallet.handle}</div>
          <button
            type="button"
            onClick={handleCopyAddress}
            className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-mono text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <span className="truncate">{truncateAddress(wallet.address, 8, 6)}</span>
            {copiedAddr ? (
              <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={onLockWallet}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          Lock & Switch Wallet
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-slate-200 bg-white">
        <div className="sticky top-0 h-screen">{renderNavContent()}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-64 max-w-[80vw] bg-white border-r border-slate-200 h-full">
            {renderNavContent()}
          </aside>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on left, max 2 primary actions on right */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-8 py-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open navigation menu"
                className="lg:hidden rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2 text-sm min-w-0">
                <span className="text-slate-500 hidden sm:inline whitespace-nowrap">
                  DemoCoin Wallet
                </span>
                <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                  /
                </span>
                <h1 className="font-display font-semibold text-slate-900 truncate">
                  {sectionLabel[section]}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                aria-label="Refresh ledger"
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setSection('transfer')}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Receive
              </button>
              <button
                type="button"
                onClick={() => setSection('transfer')}
                className="rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Send Coins
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-8 py-6 sm:py-8 space-y-6">
          {/* Frozen Wallet Security Alert */}
          {wallet.isFrozen && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3.5 text-sm text-amber-900"
            >
              <div className="flex items-center gap-2.5">
                <Snowflake className="h-4 w-4 shrink-0 text-amber-700" />
                <span>
                  <strong>Wallet Frozen:</strong> Outgoing transfers are disabled by your security
                  lock.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSection('security')}
                className="text-xs font-semibold text-amber-950 underline underline-offset-4 hover:text-amber-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Manage in Security Center
              </button>
            </div>
          )}

          {/* Action Feedback Banner */}
          {bannerMessage && (
            <div
              role="alert"
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-5 py-3.5 text-sm ${
                bannerMessage.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-red-200 bg-red-50 text-red-900'
              }`}
            >
              <span>{bannerMessage.text}</span>
              <div className="flex items-center gap-3">
                {bannerMessage.tx && (
                  <button
                    type="button"
                    onClick={() => setSelectedTx(bannerMessage.tx ?? null)}
                    className="text-xs font-semibold underline underline-offset-4 cursor-pointer"
                  >
                    View Receipt
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setBannerMessage(null)}
                  aria-label="Dismiss notice"
                  className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* OVERVIEW VIEW */}
          {section === 'overview' && (
            <div className="space-y-6">
              {/* Balance & KPI Card */}
              <section className="rounded-xl border border-slate-200 bg-white">
                <div className="p-6 flex flex-wrap items-start justify-between gap-6 border-b border-slate-100">
                  <div>
                    <div className="text-xs font-medium text-slate-500">
                      Available DemoCoin Balance · Key {wallet.keyFingerprint}
                    </div>
                    <div className="mt-1.5 font-mono text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 tabular-nums">
                      {formatDmcNumber(wallet.balanceCents)}{' '}
                      <span className="text-lg font-medium text-slate-500">DMC</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="font-mono text-slate-700">@{wallet.handle}</span>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={handleCopyAddress}
                        className="inline-flex items-center gap-1.5 font-mono text-slate-600 hover:text-slate-900 cursor-pointer"
                      >
                        <span>{truncateAddress(wallet.address, 12, 8)}</span>
                        {copiedAddr ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleClaimFaucet}
                      disabled={faucetLoading}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {faucetLoading ? 'Crediting...' : 'Claim +250 DMC Faucet'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSection('transfer')}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      New P2P Transfer
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                  <div className="p-5">
                    <div className="text-xs text-slate-500">Total Received</div>
                    <div className="mt-1 font-mono text-lg font-semibold text-emerald-700 tabular-nums">
                      +{formatDmc(wallet.totalReceivedCents)}
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="text-xs text-slate-500">Total Sent</div>
                    <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                      {formatDmc(wallet.totalSentCents)}
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Daily Limit Used</span>
                      <span className="font-mono tabular-nums">{dailyPct}%</span>
                    </div>
                    <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                      {formatDmcNumber(wallet.dailySpentCents)} /{' '}
                      {formatDmcNumber(wallet.dailyLimitCents)} DMC
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-emerald-600 transition-all"
                        style={{ width: `${dailyPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Chart + Quick Send Split */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                <div className="lg:col-span-7">
                  <BalanceChart
                    transactions={transactions}
                    walletAddress={wallet.address}
                    currentBalanceCents={wallet.balanceCents}
                  />
                </div>

                <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Quick P2P Transfer</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pick a peer or enter a @handle to send DemoCoins
                    </p>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {peers.slice(0, 4).map((peer) => (
                        <button
                          key={peer.id}
                          type="button"
                          onClick={() => handleSelectPeer(peer)}
                          className={`rounded-md border px-2.5 py-1 text-xs font-mono transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            verifiedPeer?.id === peer.id
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          @{peer.handle}
                        </button>
                      ))}
                    </div>

                    <form onSubmit={handleSendSubmit} className="mt-4 space-y-3">
                      <div>
                        <label htmlFor="quick-rec" className="block text-xs font-medium text-slate-700 mb-1">
                          Recipient (@handle or dmc1 address)
                        </label>
                        <input
                          id="quick-rec"
                          type="text"
                          required
                          value={recipientInput}
                          onChange={(e) => {
                            setRecipientInput(e.target.value);
                            setLookupError(null);
                          }}
                          onBlur={() => handleLookupPeer(recipientInput)}
                          placeholder="@maya or dmc1..."
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="quick-amt" className="block text-xs font-medium text-slate-700 mb-1">
                            Amount (DMC)
                          </label>
                          <input
                            id="quick-amt"
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            value={amountInput}
                            onChange={(e) => setAmountInput(e.target.value)}
                            placeholder="50.00"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-900 tabular-nums focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                          />
                        </div>
                        <div>
                          <label htmlFor="quick-pin" className="block text-xs font-medium text-slate-700 mb-1">
                            6-Digit PIN
                          </label>
                          <input
                            id="quick-pin"
                            type="password"
                            inputMode="numeric"
                            required
                            minLength={6}
                            maxLength={6}
                            pattern="\d{6}"
                            value={pinInput}
                            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="••••••"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-900 tabular-nums focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={sending || wallet.isFrozen}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {sending ? 'Signing & Settling...' : 'Send DemoCoins'}
                      </button>
                    </form>
                  </div>
                </div>
              </div>

              {/* Recent Transactions */}
              <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Recent Transactions</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Click any entry to inspect its cryptographic receipt
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleExportCsv(transactions)}
                      disabled={transactions.length === 0}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => setSection('transactions')}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      View All ({transactions.length})
                    </button>
                  </div>
                </div>

                {transactions.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No transactions recorded yet. Send DemoCoins to a peer or claim from the faucet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-100 bg-slate-50/70 text-xs font-medium text-slate-500">
                        <tr>
                          <th className="px-6 py-3">Counterparty</th>
                          <th className="px-4 py-3">Memo</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-6 py-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {transactions.slice(0, 5).map((tx) => {
                          const isOutgoing = tx.fromAddress === wallet.address;
                          return (
                            <tr
                              key={tx.id}
                              onClick={() => setSelectedTx(tx)}
                              className="h-12 hover:bg-slate-50 transition-colors cursor-pointer"
                            >
                              <td className="px-6 py-2.5">
                                <div className="flex items-center gap-2.5">
                                  <span
                                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                                      isOutgoing
                                        ? 'border-slate-200 bg-slate-50 text-slate-600'
                                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    }`}
                                  >
                                    {isOutgoing ? (
                                      <ArrowUpRight className="h-3.5 w-3.5" />
                                    ) : (
                                      <ArrowDownLeft className="h-3.5 w-3.5" />
                                    )}
                                  </span>
                                  <div>
                                    <div className="font-medium text-slate-900">
                                      {isOutgoing ? tx.toName : tx.fromName}
                                    </div>
                                    <div className="font-mono text-xs text-slate-500">
                                      {isOutgoing ? 'Sent to' : 'Received from'} @
                                      {isOutgoing ? tx.toHandle : tx.fromHandle}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-slate-600 max-w-xs truncate">
                                {tx.memo}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap tabular-nums">
                                {formatTimestamp(tx.createdAt)}
                              </td>
                              <td
                                className={`px-6 py-2.5 text-right font-mono font-semibold whitespace-nowrap tabular-nums ${
                                  isOutgoing ? 'text-slate-900' : 'text-emerald-700'
                                }`}
                              >
                                {formatDmc(tx.amountCents, { showSign: true, isOutgoing })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* SEND & RECEIVE VIEW */}
          {section === 'transfer' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Send P2P Panel */}
              <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-base font-semibold text-slate-900">Send DemoCoins (P2P)</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Available: <span className="font-mono font-medium text-slate-800 tabular-nums">{formatDmc(wallet.balanceCents)}</span> ·
                    Per-tx cap: <span className="font-mono tabular-nums">{formatDmc(wallet.perTxLimitCents)}</span>
                  </p>
                </div>

                {/* Network Peer Directory Quick Pick */}
                <div className="mt-4">
                  <div className="text-xs font-medium text-slate-700 mb-2">
                    Network Peer Directory
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {peers.map((peer) => {
                      const isSelected = verifiedPeer?.id === peer.id;
                      return (
                        <button
                          key={peer.id}
                          type="button"
                          onClick={() => handleSelectPeer(peer)}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'border-emerald-600 bg-emerald-50/70'
                              : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 truncate">
                              {peer.displayName}
                            </div>
                            <div className="font-mono text-xs text-slate-500 truncate">
                              @{peer.handle} · {truncateAddress(peer.address, 8, 4)}
                            </div>
                          </div>
                          {isSelected && <UserCheck className="h-4 w-4 text-emerald-700 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <form onSubmit={handleSendSubmit} className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="send-recipient" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Recipient @handle or dmc1 Address
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="send-recipient"
                        type="text"
                        required
                        value={recipientInput}
                        onChange={(e) => {
                          setRecipientInput(e.target.value);
                          setLookupError(null);
                        }}
                        onBlur={() => handleLookupPeer(recipientInput)}
                        placeholder="@maya or dmc1..."
                        className="flex-1 rounded-lg border border-slate-200 px-3.5 py-2.5 font-mono text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                      />
                      <button
                        type="button"
                        onClick={() => handleLookupPeer(recipientInput)}
                        className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Verify Peer
                      </button>
                    </div>
                    {verifiedPeer && (
                      <p className="mt-1.5 text-xs text-emerald-700">
                        Verified recipient: <strong>{verifiedPeer.displayName}</strong> (@
                        {verifiedPeer.handle}) · Key {verifiedPeer.keyFingerprint}
                      </p>
                    )}
                    {lookupError && <p className="mt-1.5 text-xs text-red-700">{lookupError}</p>}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="send-amount" className="text-xs font-medium text-slate-700">
                        Amount (DMC)
                      </label>
                      <div className="flex items-center gap-1.5">
                        {[25, 100, 250, 500].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setAmountInput(String(preset))}
                            className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-700 hover:bg-slate-100 cursor-pointer tabular-nums"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      id="send-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 font-mono text-base font-medium text-slate-900 tabular-nums focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                    />
                  </div>

                  <div>
                    <label htmlFor="send-memo" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Memo / Reference Note (Optional)
                    </label>
                    <input
                      id="send-memo"
                      type="text"
                      maxLength={140}
                      value={memoInput}
                      onChange={(e) => setMemoInput(e.target.value)}
                      placeholder="Design invoice, coffee split, peer settlement..."
                      className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                    />
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <label htmlFor="send-pin" className="block text-xs font-semibold text-slate-800 mb-1.5">
                      Authorize With 6-Digit Transfer PIN
                    </label>
                    <input
                      id="send-pin"
                      type="password"
                      inputMode="numeric"
                      required
                      minLength={6}
                      maxLength={6}
                      pattern="\d{6}"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Enter your 6-digit PIN"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm tracking-widest text-slate-900 placeholder:tracking-normal focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 tabular-nums"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-1">
                    <span className="text-xs text-slate-500 tabular-nums">
                      Fee: 0.00 DMC · Instant atomic confirmation
                    </span>
                    <button
                      type="submit"
                      disabled={sending || wallet.isFrozen}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Send className="h-4 w-4" />
                      {sending ? 'Sending...' : 'Confirm & Send'}
                    </button>
                  </div>
                </form>
              </section>

              {/* Receive P2P Panel */}
              <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6 space-y-5">
                <div className="border-b border-slate-100 pb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Receive DemoCoins</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Share your QR code or scan a wallet QR via camera
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setReceiveMode('myqr')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        receiveMode === 'myqr'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <QrCode className="h-3.5 w-3.5" />
                      My QR
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiveMode('scan')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        receiveMode === 'scan'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Camera className="h-3.5 w-3.5" />
                      Scan QR
                    </button>
                  </div>
                </div>

                {receiveMode === 'scan' ? (
                  <QrScannerPanel onDetected={handleQrDetected} />
                ) : (
                  <>
                    <div className="flex flex-col items-center">
                      <QrCodeSvg
                        value={paymentUri}
                        size={196}
                        label={`DemoCoin QR code for ${wallet.address}`}
                      />
                      <div className="mt-3 text-center">
                        <div className="font-mono text-sm font-semibold text-slate-900">
                          @{wallet.handle}
                        </div>
                        <div className="mt-1 font-mono text-xs text-slate-500 break-all max-w-xs">
                          {wallet.address}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="req-amt" className="block text-xs font-medium text-slate-700 mb-1">
                          Request Amount
                        </label>
                        <input
                          id="req-amt"
                          type="number"
                          step="0.01"
                          min="0"
                          value={requestAmount}
                          onChange={(e) => setRequestAmount(e.target.value)}
                          placeholder="Optional DMC"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-900 tabular-nums focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="req-memo" className="block text-xs font-medium text-slate-700 mb-1">
                          Request Note
                        </label>
                        <input
                          id="req-memo"
                          type="text"
                          maxLength={60}
                          value={requestMemo}
                          onChange={(e) => setRequestMemo(e.target.value)}
                          placeholder="Optional note"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCopyAddress}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {copiedAddr ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copiedAddr ? 'Copied' : 'Copy Address'}
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyPaymentUri}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {copiedUri ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copiedUri ? 'Copied URI' : 'Copy URI'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handleShareText(
                            'DemoCoin Wallet Address',
                            `Send DemoCoins to @${wallet.handle}: ${paymentUri}`,
                            () => {
                              setSharedMyAddr(true);
                              setTimeout(() => setSharedMyAddr(false), 1800);
                            },
                          )
                        }
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {sharedMyAddr ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Share2 className="h-3.5 w-3.5" />
                        )}
                        {sharedMyAddr ? 'Shared' : 'Share'}
                      </button>
                    </div>
                  </>
                )}

                {/* Captured Scanned QR Wallet Address Card */}
                {scannedPayload && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-emerald-900">
                          Captured Wallet Address
                        </div>
                        {scannedPeer ? (
                          <div className="text-xs text-emerald-800 mt-0.5">
                            {scannedPeer.displayName} (@{scannedPeer.handle})
                          </div>
                        ) : (
                          <div className="text-xs text-emerald-800 mt-0.5">
                            Scanned QR payload
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setScannedPayload(null);
                          setScannedPeer(null);
                        }}
                        aria-label="Clear captured address"
                        className="p-1 text-emerald-700 hover:text-emerald-950 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="rounded-md border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 break-all">
                      {scannedPayload.address}
                    </div>

                    {(scannedPayload.amount || scannedPayload.memo) && (
                      <div className="text-xs text-emerald-900 tabular-nums">
                        {scannedPayload.amount ? `Requested: ${scannedPayload.amount} DMC` : ''}
                        {scannedPayload.amount && scannedPayload.memo ? ' · ' : ''}
                        {scannedPayload.memo ? `Note: ${scannedPayload.memo}` : ''}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(scannedPayload.address);
                            setCopiedScanned(true);
                            setTimeout(() => setCopiedScanned(false), 1800);
                          } catch {
                            // Clipboard blocked
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {copiedScanned ? (
                          <Check className="h-3.5 w-3.5 text-emerald-700" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copiedScanned ? 'Copied' : 'Copy'}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void handleShareText(
                            'Shared DemoCoin Address',
                            scannedPeer
                              ? `${scannedPeer.displayName} (@${scannedPeer.handle}): ${scannedPayload.address}`
                              : scannedPayload.raw,
                            () => {
                              setSharedScanned(true);
                              setTimeout(() => setSharedScanned(false), 1800);
                            },
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {sharedScanned ? (
                          <Check className="h-3.5 w-3.5 text-emerald-700" />
                        ) : (
                          <Share2 className="h-3.5 w-3.5" />
                        )}
                        {sharedScanned ? 'Shared' : 'Share'}
                      </button>

                      <button
                        type="button"
                        onClick={handleApplyScannedToSend}
                        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Use in Send
                      </button>
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-100 pt-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-800">Need test DemoCoins?</div>
                    <div className="text-xs text-slate-500">Request +250.00 DMC from Treasury</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClaimFaucet}
                    disabled={faucetLoading}
                    className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {faucetLoading ? 'Crediting...' : 'Claim +250 DMC'}
                  </button>
                </div>
              </section>
            </div>
          )}

          {/* TRANSACTIONS VIEW */}
          {section === 'transactions' && (
            <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Transaction Ledger</h2>
                  <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                    {filteredTransactions.length} of {transactions.length} confirmed records
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                    {(['all', 'received', 'sent', 'faucet'] as TxFilter[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setTxFilter(f)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          txFilter === f
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="search"
                      value={txSearch}
                      onChange={(e) => setTxSearch(e.target.value)}
                      placeholder="Search handle, memo, hash..."
                      className="w-52 rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleExportCsv(filteredTransactions)}
                    disabled={filteredTransactions.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download CSV
                  </button>
                </div>
              </div>

              {filteredTransactions.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-sm text-slate-600">
                    No transactions match your current filter or search query.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setTxFilter('all');
                      setTxSearch('');
                    }}
                    className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-100 bg-slate-50/70 text-xs font-medium text-slate-500">
                      <tr>
                        <th className="px-6 py-3">Seq</th>
                        <th className="px-4 py-3">Counterparty</th>
                        <th className="px-4 py-3">Memo</th>
                        <th className="px-4 py-3">Tx Hash</th>
                        <th className="px-4 py-3">Timestamp</th>
                        <th className="px-6 py-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTransactions.map((tx) => {
                        const isOutgoing = tx.fromAddress === wallet.address;
                        return (
                          <tr
                            key={tx.id}
                            onClick={() => setSelectedTx(tx)}
                            className="h-12 hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            <td className="px-6 py-2.5 font-mono text-xs text-slate-500 tabular-nums">
                              #{tx.sequence}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-slate-900">
                                {isOutgoing ? tx.toName : tx.fromName}
                              </div>
                              <div className="font-mono text-xs text-slate-500">
                                {isOutgoing ? 'To' : 'From'} @{isOutgoing ? tx.toHandle : tx.fromHandle}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-slate-600 max-w-xs truncate">
                              {tx.memo}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                              {tx.txHash.slice(0, 12)}...
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap tabular-nums">
                              {formatTimestamp(tx.createdAt)}
                            </td>
                            <td
                              className={`px-6 py-2.5 text-right font-mono font-semibold whitespace-nowrap tabular-nums ${
                                isOutgoing ? 'text-slate-900' : 'text-emerald-700'
                              }`}
                            >
                              {formatDmc(tx.amountCents, { showSign: true, isOutgoing })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* SECURITY CENTER VIEW */}
          {section === 'security' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Emergency Wallet Freeze */}
                <section className="rounded-xl border border-slate-200 bg-white p-6">
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                        wallet.isFrozen
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {wallet.isFrozen ? (
                        <Snowflake className="h-5 w-5" />
                      ) : (
                        <Unlock className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        Emergency Wallet Freeze
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Status:{' '}
                        <span className="font-semibold text-slate-800">
                          {wallet.isFrozen
                            ? 'Frozen (Outgoing transfers blocked)'
                            : 'Active (PIN-verified transfers allowed)'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleToggleFreeze} className="mt-5 space-y-3">
                    <div>
                      <label htmlFor="freeze-pin" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Verify 6-Digit Transfer PIN
                      </label>
                      <input
                        id="freeze-pin"
                        type="password"
                        inputMode="numeric"
                        required
                        minLength={6}
                        maxLength={6}
                        pattern="\d{6}"
                        value={freezePin}
                        onChange={(e) => setFreezePin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Enter 6-digit PIN"
                        className="w-full rounded-lg border border-slate-200 px-3.5 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={freezeBusy}
                      className={`rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        wallet.isFrozen
                          ? 'bg-emerald-700 hover:bg-emerald-800'
                          : 'bg-amber-700 hover:bg-amber-800'
                      }`}
                    >
                      {freezeBusy
                        ? 'Updating...'
                        : wallet.isFrozen
                          ? 'Unfreeze Wallet'
                          : 'Freeze Outgoing Transfers'}
                    </button>
                  </form>
                </section>

                {/* Session Revocation */}
                <section className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                        <ShieldAlert className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">
                          Session & Device Protection
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Bearer tokens are stored strictly in memory and never written to browser
                          storage.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                      <div>
                        Key Fingerprint:{' '}
                        <span className="font-mono font-medium text-slate-900">
                          {wallet.keyFingerprint}
                        </span>
                      </div>
                      <div>
                        Created:{' '}
                        <span className="tabular-nums">{formatTimestamp(wallet.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">
                      Revokes all active sessions immediately
                    </span>
                    <button
                      type="button"
                      disabled={revokingSessions}
                      onClick={handleRevokeAll}
                      className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-800 hover:bg-red-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {revokingSessions ? 'Revoking...' : 'Sign Out All Devices'}
                    </button>
                  </div>
                </section>

                {/* Spending Caps */}
                <section className="rounded-xl border border-slate-200 bg-white p-6">
                  <h2 className="text-base font-semibold text-slate-900">Transfer Caps</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Server-enforced maximums per transaction and per UTC day.
                  </p>

                  <form onSubmit={handleUpdateLimits} className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="cap-tx" className="block text-xs font-medium text-slate-700 mb-1">
                          Per-Transaction Max (DMC)
                        </label>
                        <input
                          id="cap-tx"
                          type="number"
                          min={50}
                          max={50000}
                          required
                          value={perTxInput}
                          onChange={(e) => setPerTxInput(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="cap-daily" className="block text-xs font-medium text-slate-700 mb-1">
                          Daily Max (DMC)
                        </label>
                        <input
                          id="cap-daily"
                          type="number"
                          min={100}
                          max={100000}
                          required
                          value={dailyLimitInput}
                          onChange={(e) => setDailyLimitInput(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="cap-pin" className="block text-xs font-medium text-slate-700 mb-1">
                        Confirm With 6-Digit PIN
                      </label>
                      <input
                        id="cap-pin"
                        type="password"
                        inputMode="numeric"
                        required
                        minLength={6}
                        maxLength={6}
                        pattern="\d{6}"
                        value={limitsPin}
                        onChange={(e) => setLimitsPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Enter 6-digit PIN"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={limitsBusy}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {limitsBusy ? 'Saving...' : 'Save Security Limits'}
                    </button>
                  </form>
                </section>

                {/* Rotate PIN */}
                <section className="rounded-xl border border-slate-200 bg-white p-6">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-slate-500" />
                    <h2 className="text-base font-semibold text-slate-900">
                      Rotate 6-Digit Transfer PIN
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Update the numeric PIN required to authorize outgoing P2P transfers.
                  </p>

                  <form onSubmit={handleChangePin} className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="old-pin" className="block text-xs font-medium text-slate-700 mb-1">
                          Current PIN
                        </label>
                        <input
                          id="old-pin"
                          type="password"
                          inputMode="numeric"
                          required
                          minLength={6}
                          maxLength={6}
                          pattern="\d{6}"
                          value={oldPin}
                          onChange={(e) => setOldPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="••••••"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="new-pin" className="block text-xs font-medium text-slate-700 mb-1">
                          New 6-Digit PIN
                        </label>
                        <input
                          id="new-pin"
                          type="password"
                          inputMode="numeric"
                          required
                          minLength={6}
                          maxLength={6}
                          pattern="\d{6}"
                          value={newPin}
                          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="••••••"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={pinBusy}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {pinBusy ? 'Updating PIN...' : 'Update Transfer PIN'}
                    </button>
                  </form>
                </section>
              </div>

              {/* Security Audit Log */}
              <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="text-base font-semibold text-slate-900">Security Audit Log</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Server-recorded authentication, transfer authorization, and policy events
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  {auditLog.map((evt) => (
                    <div
                      key={evt.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 text-sm"
                    >
                      <div>
                        <span className="font-mono text-xs font-semibold text-slate-700">
                          {evt.action}
                        </span>
                        <span className="mx-2 text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-slate-700">{evt.summary}</span>
                      </div>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {formatTimestamp(evt.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>

      <TransactionReceiptModal
        transaction={selectedTx}
        walletAddress={wallet.address}
        onClose={() => setSelectedTx(null)}
      />
    </div>
  );
}
