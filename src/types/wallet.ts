export type TransactionDirection = 'sent' | 'received';
export type TransactionKind = 'transfer' | 'faucet' | 'welcome';

export interface WalletPublic {
  id: string;
  address: string;
  handle: string;
  displayName: string;
  keyFingerprint: string;
  balanceCents: number;
  dailyLimitCents: number;
  perTxLimitCents: number;
  dailySpentCents: number;
  totalReceivedCents: number;
  totalSentCents: number;
  isFrozen: boolean;
  pinLockedUntil: number | null;
  createdAt: string;
}

export interface PeerSummary {
  id: string;
  address: string;
  handle: string;
  displayName: string;
  keyFingerprint: string;
  kind: 'user' | 'network_peer' | 'faucet';
}

export interface TransactionRecord {
  id: string;
  sequence: number;
  txHash: string;
  kind: TransactionKind;
  fromAddress: string;
  fromHandle: string;
  fromName: string;
  toAddress: string;
  toHandle: string;
  toName: string;
  amountCents: number;
  feeCents: number;
  memo: string;
  status: 'confirmed';
  createdAt: string;
}

export interface SecurityEvent {
  id: string;
  action:
    | 'WALLET_CREATED'
    | 'SIGN_IN'
    | 'TRANSFER_SENT'
    | 'FAUCET_CLAIMED'
    | 'WALLET_FROZEN'
    | 'WALLET_UNFROZEN'
    | 'LIMITS_UPDATED'
    | 'PIN_CHANGED'
    | 'SESSIONS_REVOKED'
    | 'RECOVERY_RESET'
    | 'PIN_LOCKOUT';
  summary: string;
  createdAt: string;
}

export interface WalletDashboardData {
  wallet: WalletPublic;
  transactions: TransactionRecord[];
  peers: PeerSummary[];
  auditLog: SecurityEvent[];
}
