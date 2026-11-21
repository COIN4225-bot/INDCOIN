import { Capacitor } from '@capacitor/core';
import type { PeerSummary, TransactionRecord, WalletDashboardData } from '../types/wallet';
import { nativeLedgerApi } from './nativeLedger';

export interface AuthResponse {
  token: string;
  recoveryPhrase?: string;
  dashboard: WalletDashboardData;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || '';

function useNativeStandalone(): boolean {
  return Capacitor.isNativePlatform() && !API_BASE;
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof data.error === 'string' ? data.error : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export function createWallet(payload: {
  displayName: string;
  handle: string;
  passphrase: string;
  pin: string;
}): Promise<AuthResponse> {
  if (useNativeStandalone()) return nativeLedgerApi.createWallet(payload);
  return requestJson<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function loginWallet(payload: {
  identifier: string;
  passphrase: string;
}): Promise<AuthResponse> {
  if (useNativeStandalone()) return nativeLedgerApi.loginWallet(payload);
  return requestJson<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function recoverWallet(payload: {
  identifier: string;
  recoveryPhrase: string;
  newPassphrase: string;
  newPin: string;
}): Promise<AuthResponse> {
  if (useNativeStandalone()) return nativeLedgerApi.recoverWallet(payload);
  return requestJson<AuthResponse>('/api/auth/recover', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchDashboard(token: string): Promise<WalletDashboardData> {
  if (useNativeStandalone()) return nativeLedgerApi.fetchDashboard(token);
  return requestJson<WalletDashboardData>('/api/wallet/me', { method: 'GET' }, token);
}

export function lookupPeer(token: string, query: string): Promise<{ peer: PeerSummary }> {
  if (useNativeStandalone()) return nativeLedgerApi.lookupPeer(token, query);
  return requestJson<{ peer: PeerSummary }>(
    `/api/wallet/lookup?q=${encodeURIComponent(query)}`,
    { method: 'GET' },
    token,
  );
}

export function sendTransfer(
  token: string,
  payload: { recipient: string; amount: number; memo: string; pin: string },
): Promise<{ transaction: TransactionRecord; dashboard: WalletDashboardData }> {
  if (useNativeStandalone()) return nativeLedgerApi.sendTransfer(token, payload);
  return requestJson<{ transaction: TransactionRecord; dashboard: WalletDashboardData }>(
    '/api/transfers/send',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function claimFaucet(
  token: string,
): Promise<{ transaction: TransactionRecord; dashboard: WalletDashboardData }> {
  if (useNativeStandalone()) return nativeLedgerApi.claimFaucet(token);
  return requestJson<{ transaction: TransactionRecord; dashboard: WalletDashboardData }>(
    '/api/wallet/faucet',
    { method: 'POST' },
    token,
  );
}

export function updateSecuritySettings(
  token: string,
  payload: {
    currentPin: string;
    isFrozen?: boolean;
    perTxLimit?: number;
    dailyLimit?: number;
    newPin?: string;
  },
): Promise<{ dashboard: WalletDashboardData }> {
  if (useNativeStandalone()) return nativeLedgerApi.updateSecuritySettings(token, payload);
  return requestJson<{ dashboard: WalletDashboardData }>(
    '/api/wallet/security',
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function revokeAllSessions(token: string): Promise<{ ok: boolean }> {
  if (useNativeStandalone()) return nativeLedgerApi.revokeAllSessions(token);
  return requestJson<{ ok: boolean }>('/api/auth/logout-all', { method: 'POST' }, token);
}

