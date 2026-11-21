import type {
  PeerSummary,
  SecurityEvent,
  TransactionRecord,
  WalletDashboardData,
  WalletPublic,
} from '../types/wallet';

const DB_NAME = 'democoin_native_wallet_v1';
const STORE_NAME = 'ledger';
const LEDGER_KEY = 'state';

const HANDLE_REGEX = /^[a-z0-9_]{3,24}$/;
const PIN_REGEX = /^\d{6}$/;

const WORDLIST = [
  'anchor', 'atlas', 'aurora', 'beacon', 'birch', 'breeze', 'bridge', 'canyon',
  'cedar', 'cipher', 'citadel', 'cobalt', 'comet', 'compass', 'copper', 'coral',
  'crest', 'crystal', 'cypress', 'dawn', 'delta', 'echo', 'ember', 'emerald',
  'falcon', 'fjord', 'flint', 'forest', 'forge', 'frost', 'garnet', 'glacier',
  'granite', 'harbor', 'haven', 'horizon', 'ivory', 'jasper', 'juniper', 'keystone',
  'lagoon', 'lantern', 'larch', 'ledge', 'linden', 'lotus', 'marble', 'meadow',
  'meridian', 'mist', 'monarch', 'mosaic', 'nebula', 'north', 'oak', 'obsidian',
  'olive', 'onyx', 'opal', 'orbit', 'origin', 'osprey', 'pebble', 'summit',
];

interface NativeWalletRecord {
  id: string;
  kind: 'user' | 'network_peer' | 'faucet';
  address: string;
  handle: string;
  displayName: string;
  keyFingerprint: string;
  balanceCents: number;
  dailyLimitCents: number;
  perTxLimitCents: number;
  isFrozen: boolean;
  passphraseHash: string | null;
  pinHash: string | null;
  recoveryHash: string | null;
  failedPinAttempts: number;
  pinLockedUntil: number | null;
  lastFaucetAt: number | null;
  createdAt: string;
}

interface NativeAuditRecord extends SecurityEvent {
  walletId: string;
}

interface NativeLedgerState {
  nextSequence: number;
  wallets: NativeWalletRecord[];
  transactions: TransactionRecord[];
  auditLog: NativeAuditRecord[];
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return toHex(new Uint8Array(digest));
}

async function hashSecretPbkdf2(secret: string): Promise<string> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return `${toHex(saltBytes)}:${toHex(new Uint8Array(bits))}`;
}

async function verifySecretPbkdf2(secret: string, stored: string | null): Promise<boolean> {
  if (!stored || !stored.includes(':')) return false;
  const [saltHex, expectedHex] = stored.split(':');
  if (!saltHex || !expectedHex) return false;
  const saltBytes = new Uint8Array(saltHex.match(/.{2}/g)?.map((h) => parseInt(h, 16)) || []);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const actualHex = toHex(new Uint8Array(bits));
  if (actualHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHex.length; i++) {
    diff |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return diff === 0;
}

function generateAddress(): string {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const bytes = crypto.getRandomValues(new Uint8Array(36));
  let suffix = '';
  for (let i = 0; i < 36; i++) {
    suffix += alphabet[bytes[i] % alphabet.length];
  }
  return `dmc1${suffix}`;
}

function generateMnemonic(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes)
    .map((b) => WORDLIST[b % WORDLIST.length])
    .join(' ');
}

async function createInitialLedger(): Promise<NativeLedgerState> {
  const now = new Date().toISOString();
  const faucetAddress = 'dmc1faucet000000000000000000000000treasury';
  const mayaAddress = 'dmc1maya9x4k2m7p8q3v6n5w2z8c4r7t9y1l0studio';
  const arjunAddress = 'dmc1arjun5v8n2q4w7z9x3c6m1p8k5j2h4g7f0devx';
  const kiranAddress = 'dmc1kiran3m8p2v5x9q4w6z1c7n3r8t5y2b4l9payz';

  return {
    nextSequence: 1001,
    wallets: [
      {
        id: 'node_faucet',
        kind: 'faucet',
        address: faucetAddress,
        handle: 'faucet',
        displayName: 'DemoCoin Treasury Faucet',
        keyFingerprint: (await sha256Hex(faucetAddress)).slice(0, 16).toUpperCase(),
        balanceCents: 100_000_000_00,
        dailyLimitCents: 10_000_000_00,
        perTxLimitCents: 1_000_000_00,
        isFrozen: false,
        passphraseHash: null,
        pinHash: null,
        recoveryHash: null,
        failedPinAttempts: 0,
        pinLockedUntil: null,
        lastFaucetAt: null,
        createdAt: now,
      },
      {
        id: 'peer_maya',
        kind: 'network_peer',
        address: mayaAddress,
        handle: 'maya',
        displayName: 'Maya Lin Studio',
        keyFingerprint: (await sha256Hex(mayaAddress)).slice(0, 16).toUpperCase(),
        balanceCents: 245_000,
        dailyLimitCents: 1_000_000,
        perTxLimitCents: 500_000,
        isFrozen: false,
        passphraseHash: null,
        pinHash: null,
        recoveryHash: null,
        failedPinAttempts: 0,
        pinLockedUntil: null,
        lastFaucetAt: null,
        createdAt: now,
      },
      {
        id: 'peer_arjun',
        kind: 'network_peer',
        address: arjunAddress,
        handle: 'arjun',
        displayName: 'Arjun Patel',
        keyFingerprint: (await sha256Hex(arjunAddress)).slice(0, 16).toUpperCase(),
        balanceCents: 180_000,
        dailyLimitCents: 1_000_000,
        perTxLimitCents: 500_000,
        isFrozen: false,
        passphraseHash: null,
        pinHash: null,
        recoveryHash: null,
        failedPinAttempts: 0,
        pinLockedUntil: null,
        lastFaucetAt: null,
        createdAt: now,
      },
      {
        id: 'peer_kiran',
        kind: 'network_peer',
        address: kiranAddress,
        handle: 'kiran',
        displayName: 'Kiran Merchant Desk',
        keyFingerprint: (await sha256Hex(kiranAddress)).slice(0, 16).toUpperCase(),
        balanceCents: 520_000,
        dailyLimitCents: 1_000_000,
        perTxLimitCents: 500_000,
        isFrozen: false,
        passphraseHash: null,
        pinHash: null,
        recoveryHash: null,
        failedPinAttempts: 0,
        pinLockedUntil: null,
        lastFaucetAt: null,
        createdAt: now,
      },
    ],
    transactions: [],
    auditLog: [],
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadLedger(): Promise<NativeLedgerState> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(LEDGER_KEY);
    getReq.onsuccess = async () => {
      if (getReq.result) {
        resolve(getReq.result as NativeLedgerState);
      } else {
        const init = await createInitialLedger();
        await saveLedger(init);
        resolve(init);
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

async function saveLedger(state: NativeLedgerState): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const putReq = store.put(state, LEDGER_KEY);
    putReq.onsuccess = () => resolve();
    putReq.onerror = () => reject(putReq.error);
  });
}

const activeSessions = new Map<string, string>();

function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

function findWallet(ledger: NativeLedgerState, identifier: string): NativeWalletRecord | undefined {
  const cleaned = identifier.trim();
  if (cleaned.toLowerCase().startsWith('dmc1')) {
    return ledger.wallets.find((w) => w.address.toLowerCase() === cleaned.toLowerCase());
  }
  const h = normalizeHandle(cleaned);
  return ledger.wallets.find((w) => w.handle.toLowerCase() === h);
}

function buildDashboard(ledger: NativeLedgerState, wallet: NativeWalletRecord): WalletDashboardData {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const cutoff = startOfDay.getTime();
  let dailySpentCents = 0;
  let totalReceivedCents = 0;
  let totalSentCents = 0;

  for (const tx of ledger.transactions) {
    if (tx.toAddress === wallet.address) totalReceivedCents += tx.amountCents;
    if (tx.fromAddress === wallet.address) {
      totalSentCents += tx.amountCents;
      if (new Date(tx.createdAt).getTime() >= cutoff) dailySpentCents += tx.amountCents;
    }
  }

  const publicWallet: WalletPublic = {
    id: wallet.id,
    address: wallet.address,
    handle: wallet.handle,
    displayName: wallet.displayName,
    keyFingerprint: wallet.keyFingerprint,
    balanceCents: wallet.balanceCents,
    dailyLimitCents: wallet.dailyLimitCents,
    perTxLimitCents: wallet.perTxLimitCents,
    dailySpentCents,
    totalReceivedCents,
    totalSentCents,
    isFrozen: wallet.isFrozen,
    pinLockedUntil:
      wallet.pinLockedUntil && wallet.pinLockedUntil > Date.now() ? wallet.pinLockedUntil : null,
    createdAt: wallet.createdAt,
  };

  const transactions = ledger.transactions
    .filter((tx) => tx.fromAddress === wallet.address || tx.toAddress === wallet.address)
    .sort((a, b) => b.sequence - a.sequence);

  const peers: PeerSummary[] = ledger.wallets
    .filter((w) => w.id !== wallet.id && w.kind !== 'faucet')
    .map((w) => ({
      id: w.id,
      address: w.address,
      handle: w.handle,
      displayName: w.displayName,
      keyFingerprint: w.keyFingerprint,
      kind: w.kind,
    }));

  const auditLog = ledger.auditLog
    .filter((e) => e.walletId === wallet.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 40)
    .map(({ id, action, summary, createdAt }) => ({ id, action, summary, createdAt }));

  return { wallet: publicWallet, transactions, peers, auditLog };
}

function issueNativeSession(walletId: string): string {
  const token = `native_${crypto.randomUUID()}`;
  activeSessions.set(token, walletId);
  return token;
}

function requireNativeWallet(ledger: NativeLedgerState, token: string): NativeWalletRecord {
  const walletId = activeSessions.get(token);
  if (!walletId) throw new Error('Session expired or invalid. Please sign in again.');
  const wallet = ledger.wallets.find((w) => w.id === walletId);
  if (!wallet) throw new Error('Wallet not found.');
  return wallet;
}

async function verifyNativePin(ledger: NativeLedgerState, wallet: NativeWalletRecord, pin: string) {
  const now = Date.now();
  if (wallet.pinLockedUntil && wallet.pinLockedUntil > now) {
    const sec = Math.ceil((wallet.pinLockedUntil - now) / 1000);
    throw new Error(`PIN locked due to failed attempts. Try again in ${sec}s.`);
  }
  if (!PIN_REGEX.test(pin)) {
    throw new Error('Transfer PIN must be exactly 6 numeric digits.');
  }
  const ok = await verifySecretPbkdf2(pin, wallet.pinHash);
  if (!ok) {
    wallet.failedPinAttempts += 1;
    if (wallet.failedPinAttempts >= 5) {
      wallet.pinLockedUntil = now + 60_000;
      wallet.failedPinAttempts = 0;
      ledger.auditLog.push({
        id: `evt_${crypto.randomUUID()}`,
        walletId: wallet.id,
        action: 'PIN_LOCKOUT',
        summary: '5 consecutive incorrect PIN attempts triggered a 60-second transfer lock.',
        createdAt: new Date().toISOString(),
      });
      await saveLedger(ledger);
      throw new Error('Too many incorrect PIN attempts. Transfers locked for 60 seconds.');
    }
    await saveLedger(ledger);
    throw new Error(`Incorrect Transfer PIN. ${5 - wallet.failedPinAttempts} attempts left.`);
  }
  wallet.failedPinAttempts = 0;
  wallet.pinLockedUntil = null;
}

export const nativeLedgerApi = {
  async createWallet(payload: {
    displayName: string;
    handle: string;
    passphrase: string;
    pin: string;
  }) {
    const displayName = payload.displayName.trim();
    const handle = normalizeHandle(payload.handle);
    if (displayName.length < 2 || displayName.length > 48) {
      throw new Error('Display name must be between 2 and 48 characters.');
    }
    if (!HANDLE_REGEX.test(handle)) {
      throw new Error('Handle must be 3–24 characters using lowercase letters, numbers, or _.');
    }
    if (payload.passphrase.length < 8) {
      throw new Error('Security passphrase must be at least 8 characters.');
    }
    if (!PIN_REGEX.test(payload.pin.trim())) {
      throw new Error('Transfer PIN must be exactly 6 numeric digits.');
    }

    const ledger = await loadLedger();
    if (ledger.wallets.some((w) => w.handle.toLowerCase() === handle)) {
      throw new Error('That @handle is already claimed.');
    }

    const address = generateAddress();
    const recoveryPhrase = generateMnemonic();
    const now = new Date().toISOString();
    const welcomeCents = 100_000;

    const newWallet: NativeWalletRecord = {
      id: `wal_${crypto.randomUUID()}`,
      kind: 'user',
      address,
      handle,
      displayName,
      keyFingerprint: (await sha256Hex(address)).slice(0, 16).toUpperCase(),
      balanceCents: welcomeCents,
      dailyLimitCents: 1_000_000,
      perTxLimitCents: 500_000,
      isFrozen: false,
      passphraseHash: await hashSecretPbkdf2(payload.passphrase),
      pinHash: await hashSecretPbkdf2(payload.pin.trim()),
      recoveryHash: await hashSecretPbkdf2(recoveryPhrase),
      failedPinAttempts: 0,
      pinLockedUntil: null,
      lastFaucetAt: null,
      createdAt: now,
    };

    const faucet = ledger.wallets.find((w) => w.id === 'node_faucet');
    const seq = ledger.nextSequence++;
    const txHash =
      '0x' +
      (await sha256Hex(`${seq}|${faucet?.address || 'dmc1faucet'}|${address}|${welcomeCents}|${now}`));

    ledger.wallets.push(newWallet);
    ledger.transactions.push({
      id: `tx_${crypto.randomUUID()}`,
      sequence: seq,
      txHash,
      kind: 'welcome',
      fromAddress: faucet?.address || 'dmc1faucet',
      fromHandle: 'faucet',
      fromName: 'DemoCoin Treasury Faucet',
      toAddress: address,
      toHandle: handle,
      toName: displayName,
      amountCents: welcomeCents,
      feeCents: 0,
      memo: 'Initial DemoCoin wallet allocation',
      status: 'confirmed',
      createdAt: now,
    });
    ledger.auditLog.push({
      id: `evt_${crypto.randomUUID()}`,
      walletId: newWallet.id,
      action: 'WALLET_CREATED',
      summary: `Wallet @${handle} created with 1,000.00 DMC initial balance.`,
      createdAt: now,
    });
    await saveLedger(ledger);

    return {
      token: issueNativeSession(newWallet.id),
      recoveryPhrase,
      dashboard: buildDashboard(ledger, newWallet),
    };
  },

  async loginWallet(payload: { identifier: string; passphrase: string }) {
    const ledger = await loadLedger();
    const wallet = findWallet(ledger, payload.identifier);
    if (
      !wallet ||
      wallet.kind !== 'user' ||
      !(await verifySecretPbkdf2(payload.passphrase, wallet.passphraseHash))
    ) {
      throw new Error('Invalid wallet identifier or security passphrase.');
    }
    ledger.auditLog.push({
      id: `evt_${crypto.randomUUID()}`,
      walletId: wallet.id,
      action: 'SIGN_IN',
      summary: 'Wallet unlocked via passphrase authentication.',
      createdAt: new Date().toISOString(),
    });
    await saveLedger(ledger);
    return {
      token: issueNativeSession(wallet.id),
      dashboard: buildDashboard(ledger, wallet),
    };
  },

  async recoverWallet(payload: {
    identifier: string;
    recoveryPhrase: string;
    newPassphrase: string;
    newPin: string;
  }) {
    const phrase = payload.recoveryPhrase.trim().toLowerCase().replace(/\s+/g, ' ');
    const ledger = await loadLedger();
    const wallet = findWallet(ledger, payload.identifier);
    if (!wallet || wallet.kind !== 'user' || !(await verifySecretPbkdf2(phrase, wallet.recoveryHash))) {
      throw new Error('Recovery phrase did not match that wallet.');
    }
    if (payload.newPassphrase.length < 8) {
      throw new Error('New passphrase must be at least 8 characters.');
    }
    if (!PIN_REGEX.test(payload.newPin.trim())) {
      throw new Error('New Transfer PIN must be exactly 6 numeric digits.');
    }

    wallet.passphraseHash = await hashSecretPbkdf2(payload.newPassphrase);
    wallet.pinHash = await hashSecretPbkdf2(payload.newPin.trim());
    wallet.failedPinAttempts = 0;
    wallet.pinLockedUntil = null;
    ledger.auditLog.push({
      id: `evt_${crypto.randomUUID()}`,
      walletId: wallet.id,
      action: 'RECOVERY_RESET',
      summary: 'Wallet credentials reset via 12-word recovery phrase.',
      createdAt: new Date().toISOString(),
    });
    await saveLedger(ledger);

    return {
      token: issueNativeSession(wallet.id),
      dashboard: buildDashboard(ledger, wallet),
    };
  },

  async fetchDashboard(token: string) {
    const ledger = await loadLedger();
    const wallet = requireNativeWallet(ledger, token);
    return buildDashboard(ledger, wallet);
  },

  async lookupPeer(token: string, query: string): Promise<{ peer: PeerSummary }> {
    const ledger = await loadLedger();
    const caller = requireNativeWallet(ledger, token);
    const target = findWallet(ledger, query);
    if (!target || target.kind === 'faucet') {
      throw new Error('No recipient wallet found for that handle or address.');
    }
    if (target.id === caller.id) {
      throw new Error('You cannot send coins to your own wallet address.');
    }
    return {
      peer: {
        id: target.id,
        address: target.address,
        handle: target.handle,
        displayName: target.displayName,
        keyFingerprint: target.keyFingerprint,
        kind: target.kind,
      },
    };
  },

  async sendTransfer(
    token: string,
    payload: { recipient: string; amount: number; memo: string; pin: string },
  ) {
    const amountCents = Math.round(payload.amount * 100);
    if (!Number.isFinite(payload.amount) || amountCents < 1) {
      throw new Error('Enter a valid transfer amount (minimum 0.01 DMC).');
    }

    const ledger = await loadLedger();
    const sender = requireNativeWallet(ledger, token);
    if (sender.isFrozen) {
      throw new Error('Wallet is frozen. Unfreeze it in Security Center before sending.');
    }
    await verifyNativePin(ledger, sender, payload.pin.trim());

    const recipient = findWallet(ledger, payload.recipient);
    if (!recipient || recipient.kind === 'faucet') {
      throw new Error('Recipient wallet not found on the DemoCoin network.');
    }
    if (recipient.id === sender.id) {
      throw new Error('Cannot transfer DemoCoins to your own wallet.');
    }
    if (amountCents > sender.perTxLimitCents) {
      throw new Error(
        `Amount exceeds your per-transaction security limit (${(sender.perTxLimitCents / 100).toFixed(2)} DMC).`,
      );
    }
    const dashBefore = buildDashboard(ledger, sender);
    if (dashBefore.wallet.dailySpentCents + amountCents > sender.dailyLimitCents) {
      throw new Error('Amount exceeds your daily transfer limit.');
    }
    if (sender.balanceCents < amountCents) {
      throw new Error('Insufficient DemoCoin balance for this transfer.');
    }

    const now = new Date().toISOString();
    const seq = ledger.nextSequence++;
    sender.balanceCents -= amountCents;
    recipient.balanceCents += amountCents;

    const tx: TransactionRecord = {
      id: `tx_${crypto.randomUUID()}`,
      sequence: seq,
      txHash:
        '0x' +
        (await sha256Hex(`${seq}|${sender.address}|${recipient.address}|${amountCents}|${now}`)),
      kind: 'transfer',
      fromAddress: sender.address,
      fromHandle: sender.handle,
      fromName: sender.displayName,
      toAddress: recipient.address,
      toHandle: recipient.handle,
      toName: recipient.displayName,
      amountCents,
      feeCents: 0,
      memo: payload.memo.trim().slice(0, 140) || 'Peer-to-peer DemoCoin transfer',
      status: 'confirmed',
      createdAt: now,
    };

    ledger.transactions.push(tx);
    ledger.auditLog.push({
      id: `evt_${crypto.randomUUID()}`,
      walletId: sender.id,
      action: 'TRANSFER_SENT',
      summary: `Sent ${(amountCents / 100).toFixed(2)} DMC to @${recipient.handle} (Tx #${seq}).`,
      createdAt: now,
    });
    await saveLedger(ledger);
    return { transaction: tx, dashboard: buildDashboard(ledger, sender) };
  },

  async claimFaucet(token: string) {
    const ledger = await loadLedger();
    const wallet = requireNativeWallet(ledger, token);
    const nowMs = Date.now();
    if (wallet.lastFaucetAt && nowMs - wallet.lastFaucetAt < 15_000) {
      const waitSec = Math.ceil((15_000 - (nowMs - wallet.lastFaucetAt)) / 1000);
      throw new Error(`Faucet cooldown active. Try again in ${waitSec}s.`);
    }
    const faucet = ledger.wallets.find((w) => w.id === 'node_faucet');
    const amountCents = 25_000;
    const now = new Date().toISOString();
    const seq = ledger.nextSequence++;
    wallet.balanceCents += amountCents;
    wallet.lastFaucetAt = nowMs;

    const tx: TransactionRecord = {
      id: `tx_${crypto.randomUUID()}`,
      sequence: seq,
      txHash:
        '0x' +
        (await sha256Hex(`${seq}|${faucet?.address || 'dmc1faucet'}|${wallet.address}|${amountCents}|${now}`)),
      kind: 'faucet',
      fromAddress: faucet?.address || 'dmc1faucet',
      fromHandle: 'faucet',
      fromName: 'DemoCoin Treasury Faucet',
      toAddress: wallet.address,
      toHandle: wallet.handle,
      toName: wallet.displayName,
      amountCents,
      feeCents: 0,
      memo: 'DemoCoin Network Faucet credit',
      status: 'confirmed',
      createdAt: now,
    };

    ledger.transactions.push(tx);
    ledger.auditLog.push({
      id: `evt_${crypto.randomUUID()}`,
      walletId: wallet.id,
      action: 'FAUCET_CLAIMED',
      summary: 'Claimed +250.00 DMC from DemoCoin Faucet.',
      createdAt: now,
    });
    await saveLedger(ledger);
    return { transaction: tx, dashboard: buildDashboard(ledger, wallet) };
  },

  async updateSecuritySettings(
    token: string,
    payload: {
      currentPin: string;
      isFrozen?: boolean;
      perTxLimit?: number;
      dailyLimit?: number;
      newPin?: string;
    },
  ) {
    const ledger = await loadLedger();
    const wallet = requireNativeWallet(ledger, token);
    await verifyNativePin(ledger, wallet, payload.currentPin.trim());

    if (typeof payload.isFrozen === 'boolean' && payload.isFrozen !== wallet.isFrozen) {
      wallet.isFrozen = payload.isFrozen;
      ledger.auditLog.push({
        id: `evt_${crypto.randomUUID()}`,
        walletId: wallet.id,
        action: payload.isFrozen ? 'WALLET_FROZEN' : 'WALLET_UNFROZEN',
        summary: payload.isFrozen
          ? 'Emergency wallet freeze enabled; outgoing transfers blocked.'
          : 'Wallet freeze lifted after PIN verification.',
        createdAt: new Date().toISOString(),
      });
    }

    if (typeof payload.perTxLimit === 'number' || typeof payload.dailyLimit === 'number') {
      const nextPerTx =
        typeof payload.perTxLimit === 'number'
          ? Math.round(payload.perTxLimit * 100)
          : wallet.perTxLimitCents;
      const nextDaily =
        typeof payload.dailyLimit === 'number'
          ? Math.round(payload.dailyLimit * 100)
          : wallet.dailyLimitCents;
      if (nextPerTx > nextDaily) {
        throw new Error('Per-transaction limit cannot exceed your daily limit.');
      }
      wallet.perTxLimitCents = nextPerTx;
      wallet.dailyLimitCents = nextDaily;
      ledger.auditLog.push({
        id: `evt_${crypto.randomUUID()}`,
        walletId: wallet.id,
        action: 'LIMITS_UPDATED',
        summary: `Updated transfer caps to ${(nextPerTx / 100).toFixed(0)} DMC/tx and ${(nextDaily / 100).toFixed(0)} DMC/day.`,
        createdAt: new Date().toISOString(),
      });
    }

    if (typeof payload.newPin === 'string' && payload.newPin.trim()) {
      if (!PIN_REGEX.test(payload.newPin.trim())) {
        throw new Error('New Transfer PIN must be exactly 6 numeric digits.');
      }
      wallet.pinHash = await hashSecretPbkdf2(payload.newPin.trim());
      ledger.auditLog.push({
        id: `evt_${crypto.randomUUID()}`,
        walletId: wallet.id,
        action: 'PIN_CHANGED',
        summary: '6-digit Transfer PIN rotated.',
        createdAt: new Date().toISOString(),
      });
    }

    await saveLedger(ledger);
    return { dashboard: buildDashboard(ledger, wallet) };
  },

  async revokeAllSessions(token: string) {
    const ledger = await loadLedger();
    const wallet = requireNativeWallet(ledger, token);
    for (const [t, wId] of activeSessions.entries()) {
      if (wId === wallet.id) activeSessions.delete(t);
    }
    ledger.auditLog.push({
      id: `evt_${crypto.randomUUID()}`,
      walletId: wallet.id,
      action: 'SESSIONS_REVOKED',
      summary: 'All active sessions invalidated.',
      createdAt: new Date().toISOString(),
    });
    await saveLedger(ledger);
    return { ok: true };
  },
};
