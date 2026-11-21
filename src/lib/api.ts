import type { PeerSummary, TransactionRecord, WalletDashboardData } from '../types/wallet';

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

async function requestJson<T>(
  url: string,
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

  const res = await fetch(url, {
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
  return requestJson<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function loginWallet(payload: {
  identifier: string;
  passphrase: string;
}): Promise<AuthResponse> {
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
  return requestJson<AuthResponse>('/api/auth/recover', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchDashboard(token: string): Promise<WalletDashboardData> {
  return requestJson<WalletDashboardData>('/api/wallet/me', { method: 'GET' }, token);
}

export function lookupPeer(token: string, query: string): Promise<{ peer: PeerSummary }> {
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
  return requestJson<{ ok: boolean }>('/api/auth/logout-all', { method: 'POST' }, token);
}
