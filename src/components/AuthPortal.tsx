import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { createWallet, loginWallet, recoverWallet, type AuthResponse } from '../lib/api';

type AuthTab = 'create' | 'signin' | 'recover';

interface AuthPortalProps {
  onAuthenticated: (res: AuthResponse) => void;
}

export function AuthPortal({ onAuthenticated }: AuthPortalProps) {
  const [tab, setTab] = useState<AuthTab>('create');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  // Create Wallet state
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [pin, setPin] = useState('');
  const [showCreatePass, setShowCreatePass] = useState(false);

  // Sign In state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassphrase, setLoginPassphrase] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Recover state
  const [recoverIdentifier, setRecoverIdentifier] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [newPin, setNewPin] = useState('');

  const switchTab = (next: AuthTab) => {
    setTab(next);
    setError(null);
  };

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await createWallet({
        displayName,
        handle,
        passphrase,
        pin,
      });
      onAuthenticated(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create wallet.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignInSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await loginWallet({
        identifier: loginIdentifier,
        passphrase: loginPassphrase,
      });
      onAuthenticated(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await recoverWallet({
        identifier: recoverIdentifier,
        recoveryPhrase,
        newPassphrase,
        newPin,
      });
      onAuthenticated(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-4">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            DemoCoin Wallet
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#workspace" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Wallet Access
            </a>
            <a href="#security" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Security Model
            </a>
            <a href="#workflow" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              How It Works
            </a>
            <a href="#peers" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Network Peers
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => {
                switchTab(tab === 'create' ? 'signin' : 'create');
                document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {tab === 'create' ? 'Sign In' : 'Create Wallet'}
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-6xl px-6 py-10 lg:py-14">
        {/* Hero Split */}
        <section id="workspace" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left: Auth Card & Value Proposition */}
          <div className="lg:col-span-7 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
            <div>
              <p className="text-xs font-medium text-emerald-700">
                Peer-to-Peer DemoCoin Network · Zero-Fee Ledger · Scrypt Protected
              </p>
              <h1 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
                Send, Receive, aur Manage Demo Coins easily
              </h1>
              <p className="mt-3 text-sm sm:text-base text-slate-600 max-w-xl leading-relaxed">
                Create a personal DemoCoin wallet in seconds with a unique network address,
                6-digit Transfer PIN protection, 12-word recovery backup, and instant P2P transfers.
              </p>

              {/* Segmented Tab Switch */}
              <div className="mt-6 inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => switchTab('create')}
                  className={`rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    tab === 'create'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Create Wallet
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('signin')}
                  className={`rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    tab === 'signin'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('recover')}
                  className={`rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    tab === 'recover'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Recover Access
                </button>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                >
                  {error}
                </div>
              )}

              {tab === 'create' && (
                <form onSubmit={handleCreateSubmit} className="mt-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="create-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Display Name
                      </label>
                      <input
                        id="create-name"
                        type="text"
                        required
                        minLength={2}
                        maxLength={48}
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Aarav Sharma"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                      />
                    </div>
                    <div>
                      <label htmlFor="create-handle" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Wallet @handle
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-slate-400">
                          @
                        </span>
                        <input
                          id="create-handle"
                          type="text"
                          required
                          minLength={3}
                          maxLength={24}
                          pattern="[a-zA-Z0-9_]{3,24}"
                          value={handle}
                          onChange={(e) => setHandle(e.target.value.replace(/^@/, '').toLowerCase())}
                          placeholder="aarav_pay"
                          className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3.5 py-2.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="create-pass" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Security Passphrase (min 8 chars)
                      </label>
                      <div className="relative">
                        <input
                          id="create-pass"
                          type={showCreatePass ? 'text' : 'password'}
                          required
                          minLength={8}
                          maxLength={128}
                          value={passphrase}
                          onChange={(e) => setPassphrase(e.target.value)}
                          placeholder="Enter strong passphrase"
                          className="w-full rounded-lg border border-slate-200 bg-white px-3.5 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCreatePass((v) => !v)}
                          aria-label={showCreatePass ? 'Hide passphrase' : 'Show passphrase'}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                        >
                          {showCreatePass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="create-pin" className="block text-xs font-medium text-slate-700 mb-1.5">
                        6-Digit Transfer PIN
                      </label>
                      <input
                        id="create-pin"
                        type="password"
                        inputMode="numeric"
                        required
                        minLength={6}
                        maxLength={6}
                        pattern="\d{6}"
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="6 digits (e.g. 482910)"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm tracking-widest text-slate-900 placeholder:text-slate-400 placeholder:tracking-normal focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="pt-1 flex flex-wrap items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">
                      Includes 1,000.00 DMC welcome balance · 12-word backup phrase
                    </span>
                    <button
                      type="submit"
                      disabled={loading}
                      className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {loading ? 'Creating Wallet...' : 'Create DemoCoin Wallet'}
                    </button>
                  </div>
                </form>
              )}

              {tab === 'signin' && (
                <form onSubmit={handleSignInSubmit} className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="signin-id" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Wallet @handle or dmc1 Address
                    </label>
                    <input
                      id="signin-id"
                      type="text"
                      required
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      placeholder="@aarav_pay or dmc1..."
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="signin-pass" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Security Passphrase
                    </label>
                    <div className="relative">
                      <input
                        id="signin-pass"
                        type={showLoginPass ? 'text' : 'password'}
                        required
                        value={loginPassphrase}
                        onChange={(e) => setLoginPassphrase(e.target.value)}
                        placeholder="Enter wallet passphrase"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3.5 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPass((v) => !v)}
                        aria-label={showLoginPass ? 'Hide passphrase' : 'Show passphrase'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        {showLoginPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="pt-1 flex flex-wrap items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => switchTab('recover')}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-4 cursor-pointer"
                    >
                      Forgot passphrase? Use recovery phrase
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {loading ? 'Unlocking...' : 'Unlock Wallet'}
                    </button>
                  </div>
                </form>
              )}

              {tab === 'recover' && (
                <form onSubmit={handleRecoverSubmit} className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="rec-id" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Wallet @handle or dmc1 Address
                    </label>
                    <input
                      id="rec-id"
                      type="text"
                      required
                      value={recoverIdentifier}
                      onChange={(e) => setRecoverIdentifier(e.target.value)}
                      placeholder="@aarav_pay or dmc1..."
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="rec-phrase" className="block text-xs font-medium text-slate-700 mb-1.5">
                      12-Word Recovery Phrase
                    </label>
                    <textarea
                      id="rec-phrase"
                      required
                      rows={2}
                      value={recoveryPhrase}
                      onChange={(e) => setRecoveryPhrase(e.target.value)}
                      placeholder="Enter all 12 words separated by spaces"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="rec-pass" className="block text-xs font-medium text-slate-700 mb-1.5">
                        New Passphrase
                      </label>
                      <input
                        id="rec-pass"
                        type="password"
                        required
                        minLength={8}
                        value={newPassphrase}
                        onChange={(e) => setNewPassphrase(e.target.value)}
                        placeholder="New strong passphrase"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                      />
                    </div>
                    <div>
                      <label htmlFor="rec-pin" className="block text-xs font-medium text-slate-700 mb-1.5">
                        New 6-Digit PIN
                      </label>
                      <input
                        id="rec-pin"
                        type="password"
                        inputMode="numeric"
                        required
                        minLength={6}
                        maxLength={6}
                        pattern="\d{6}"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="6 digits"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 tabular-nums"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={loading}
                      className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {loading ? 'Verifying Phrase...' : 'Reset Credentials & Unlock'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Right: Architectural Vault Showcase */}
          <div className="lg:col-span-5 relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 min-h-[320px]">
            {!imgFailed ? (
              <img
                src="/src/assets/images/democoin_vault_visual_1795233947565.jpg"
                alt="Precision milled DemoCoin emblem beside translucent emerald security vault"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="h-full w-full object-cover lg:h-full"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-emerald-950 p-8">
                <ShieldCheck className="h-16 w-16 text-emerald-400" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white">
              <div className="text-xs font-medium text-emerald-300">
                Cryptographic Wallet Architecture
              </div>
              <p className="mt-1 text-base font-semibold leading-snug">
                Atomic peer-to-peer settlement with PIN-gated transfers and instant wallet freeze.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300 tabular-nums">
                <span>1,000.00 DMC Starter Grant</span>
                <span aria-hidden="true">·</span>
                <span>0.00 DMC P2P Fee</span>
                <span aria-hidden="true">·</span>
                <span>Scrypt Key Guard</span>
              </div>
            </div>
          </div>
        </section>

        {/* Security Architecture Strip */}
        <section id="security" className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
              <Lock className="h-4 w-4" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-900">
              Scrypt Passphrase & PIN Hashing
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              Every passphrase, 6-digit Transfer PIN, and 12-word recovery phrase is salted and
              derived server-side with Scrypt, with automatic lockout after repeated wrong PIN attempts.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-900">
              Transfer Caps & Emergency Freeze
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              Enforce custom per-transaction and daily spending caps on the server, or freeze all
              outgoing transfers immediately if you spot unexpected activity.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
              <KeyRound className="h-4 w-4" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-900">
              Signed Sessions & Audit Ledger
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              Session tokens stay strictly in memory and support one-click global revocation across
              all devices, backed by a chronological security event log.
            </p>
          </div>
        </section>

        {/* How It Works */}
        <section id="workflow" className="mt-12 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-xl font-bold text-slate-900">
              How DemoCoin P2P Transfers Work
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Built for testing multi-wallet P2P flows between your own accounts or pre-registered
              network peers.
            </p>
          </div>

          <div id="peers" className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-slate-100 pt-6">
            <div>
              <div className="font-mono text-xs font-semibold text-emerald-700">01. Create Wallet</div>
              <h3 className="mt-1.5 text-sm font-semibold text-slate-900">
                Claim your @handle & dmc1 address
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Your new wallet starts with 1,000.00 DMC and generates a unique 12-word recovery
                phrase for backup.
              </p>
            </div>
            <div>
              <div className="font-mono text-xs font-semibold text-emerald-700">02. Send & Receive</div>
              <h3 className="mt-1.5 text-sm font-semibold text-slate-900">
                Pay peers or share your QR code
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Send DemoCoins to @maya, @arjun, @kiran, or another wallet you create using your
                6-digit Transfer PIN.
              </p>
            </div>
            <div>
              <div className="font-mono text-xs font-semibold text-emerald-700">03. Track & Export</div>
              <h3 className="mt-1.5 text-sm font-semibold text-slate-900">
                Inspect receipts & security logs
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Every confirmed transfer records an immutable hash, sequence number, and timestamp
                with CSV export.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
