import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LEDGER_FILE = path.join(DATA_DIR, 'ledger.json');

const HANDLE_REGEX = /^[a-z0-9_]{3,24}$/;
const PIN_REGEX = /^\d{6}$/;
const ADDRESS_REGEX = /^dmc1[a-z0-9]{30,48}$/;

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

interface StoredWallet {
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
  tokenEpoch: number;
  passphraseHash: string | null;
  pinHash: string | null;
  recoveryHash: string | null;
  failedPinAttempts: number;
  pinLockedUntil: number | null;
  lastFaucetAt: number | null;
  createdAt: string;
}

interface StoredTransaction {
  id: string;
  sequence: number;
  txHash: string;
  kind: 'transfer' | 'faucet' | 'welcome';
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

interface StoredSecurityEvent {
  id: string;
  walletId: string;
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

interface LedgerState {
  nextSequence: number;
  wallets: StoredWallet[];
  transactions: StoredTransaction[];
  auditLog: StoredSecurityEvent[];
}

interface TokenPayload {
  walletId: string;
  address: string;
  epoch: number;
  exp: number;
}

interface AuthenticatedRequest extends Request {
  authWalletId?: string;
}

function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(secret, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifySecret(secret: string, storedHash: string | null): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const actualBuf = crypto.scryptSync(secret, salt, 64);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

function signToken(payload: TokenPayload): string {
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  if (!data || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.walletId || typeof parsed.epoch !== 'number' || typeof parsed.exp !== 'number') {
      return null;
    }
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function generateWalletAddress(): string {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const bytes = crypto.randomBytes(36);
  let suffix = '';
  for (let i = 0; i < 36; i++) {
    suffix += alphabet[bytes[i] % alphabet.length];
  }
  return `dmc1${suffix}`;
}

function generateFingerprint(address: string): string {
  return crypto.createHash('sha256').update(address).digest('hex').slice(0, 16).toUpperCase();
}

function generateMnemonic(): string {
  const words: string[] = [];
  for (let i = 0; i < 12; i++) {
    words.push(WORDLIST[crypto.randomInt(0, WORDLIST.length)]);
  }
  return words.join(' ');
}

function computeTxHash(
  sequence: number,
  fromAddress: string,
  toAddress: string,
  amountCents: number,
  createdAt: string,
): string {
  const nonce = crypto.randomBytes(12).toString('hex');
  return (
    '0x' +
    crypto
      .createHash('sha256')
      .update(`${sequence}|${fromAddress}|${toAddress}|${amountCents}|${createdAt}|${nonce}`)
      .digest('hex')
  );
}

function createInitialLedger(): LedgerState {
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
        keyFingerprint: generateFingerprint(faucetAddress),
        balanceCents: 100_000_000_00,
        dailyLimitCents: 10_000_000_00,
        perTxLimitCents: 1_000_000_00,
        isFrozen: false,
        tokenEpoch: 1,
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
        keyFingerprint: generateFingerprint(mayaAddress),
        balanceCents: 245_000,
        dailyLimitCents: 1_000_000,
        perTxLimitCents: 500_000,
        isFrozen: false,
        tokenEpoch: 1,
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
        keyFingerprint: generateFingerprint(arjunAddress),
        balanceCents: 180_000,
        dailyLimitCents: 1_000_000,
        perTxLimitCents: 500_000,
        isFrozen: false,
        tokenEpoch: 1,
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
        keyFingerprint: generateFingerprint(kiranAddress),
        balanceCents: 520_000,
        dailyLimitCents: 1_000_000,
        perTxLimitCents: 500_000,
        isFrozen: false,
        tokenEpoch: 1,
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

function loadLedger(): LedgerState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LEDGER_FILE)) {
    const initial = createInitialLedger();
    saveLedgerAtomic(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(LEDGER_FILE, 'utf8');
    const parsed = JSON.parse(raw) as LedgerState;
    if (!Array.isArray(parsed.wallets) || !Array.isArray(parsed.transactions)) {
      throw new Error('Invalid ledger shape');
    }
    return parsed;
  } catch {
    const initial = createInitialLedger();
    saveLedgerAtomic(initial);
    return initial;
  }
}

function saveLedgerAtomic(state: LedgerState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${LEDGER_FILE}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpFile, LEDGER_FILE);
}

let ledgerCache: LedgerState = loadLedger();
let mutexQueue: Promise<unknown> = Promise.resolve();

function withLedgerLock<T>(fn: (ledger: LedgerState) => T | Promise<T>): Promise<T> {
  const run = mutexQueue.then(async () => {
    const result = await fn(ledgerCache);
    saveLedgerAtomic(ledgerCache);
    return result;
  });
  mutexQueue = run.catch(() => undefined);
  return run;
}

function getDailySpentCents(ledger: LedgerState, address: string): number {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const cutoff = startOfDay.getTime();
  let sum = 0;
  for (const tx of ledger.transactions) {
    if (tx.fromAddress === address && new Date(tx.createdAt).getTime() >= cutoff) {
      sum += tx.amountCents;
    }
  }
  return sum;
}

function toPublicWallet(ledger: LedgerState, wallet: StoredWallet) {
  let totalReceivedCents = 0;
  let totalSentCents = 0;
  for (const tx of ledger.transactions) {
    if (tx.toAddress === wallet.address) totalReceivedCents += tx.amountCents;
    if (tx.fromAddress === wallet.address) totalSentCents += tx.amountCents;
  }
  return {
    id: wallet.id,
    address: wallet.address,
    handle: wallet.handle,
    displayName: wallet.displayName,
    keyFingerprint: wallet.keyFingerprint,
    balanceCents: wallet.balanceCents,
    dailyLimitCents: wallet.dailyLimitCents,
    perTxLimitCents: wallet.perTxLimitCents,
    dailySpentCents: getDailySpentCents(ledger, wallet.address),
    totalReceivedCents,
    totalSentCents,
    isFrozen: wallet.isFrozen,
    pinLockedUntil: wallet.pinLockedUntil && wallet.pinLockedUntil > Date.now() ? wallet.pinLockedUntil : null,
    createdAt: wallet.createdAt,
  };
}

function getWalletTransactions(ledger: LedgerState, address: string): StoredTransaction[] {
  return ledger.transactions
    .filter((tx) => tx.fromAddress === address || tx.toAddress === address)
    .sort((a, b) => b.sequence - a.sequence);
}

function getPeerDirectory(ledger: LedgerState, excludeWalletId: string) {
  return ledger.wallets
    .filter((w) => w.id !== excludeWalletId && w.kind !== 'faucet')
    .map((w) => ({
      id: w.id,
      address: w.address,
      handle: w.handle,
      displayName: w.displayName,
      keyFingerprint: w.keyFingerprint,
      kind: w.kind,
    }));
}

function getWalletAuditLog(ledger: LedgerState, walletId: string) {
  return ledger.auditLog
    .filter((e) => e.walletId === walletId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 40)
    .map(({ id, action, summary, createdAt }) => ({ id, action, summary, createdAt }));
}

function appendAudit(
  ledger: LedgerState,
  walletId: string,
  action: StoredSecurityEvent['action'],
  summary: string,
): void {
  ledger.auditLog.push({
    id: `evt_${crypto.randomUUID()}`,
    walletId,
    action,
    summary,
    createdAt: new Date().toISOString(),
  });
}

function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

function findWalletByIdentifier(ledger: LedgerState, identifier: string): StoredWallet | undefined {
  const cleaned = identifier.trim();
  if (cleaned.toLowerCase().startsWith('dmc1')) {
    return ledger.wallets.find((w) => w.address.toLowerCase() === cleaned.toLowerCase());
  }
  const handle = normalizeHandle(cleaned);
  return ledger.wallets.find((w) => w.handle.toLowerCase() === handle);
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please open or unlock your wallet.' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }
  const wallet = ledgerCache.wallets.find((w) => w.id === payload.walletId);
  if (!wallet || wallet.kind !== 'user' || wallet.tokenEpoch !== payload.epoch) {
    res.status(401).json({ error: 'Session was revoked or wallet no longer exists.' });
    return;
  }
  req.authWalletId = wallet.id;
  next();
}

function verifyTransferPin(wallet: StoredWallet, pin: string): { ok: true } | { ok: false; status: number; error: string } {
  const now = Date.now();
  if (wallet.pinLockedUntil && wallet.pinLockedUntil > now) {
    const remainingSec = Math.ceil((wallet.pinLockedUntil - now) / 1000);
    return {
      ok: false,
      status: 429,
      error: `PIN verification temporarily locked due to failed attempts. Try again in ${remainingSec}s.`,
    };
  }
  if (!PIN_REGEX.test(pin)) {
    return { ok: false, status: 400, error: 'Transfer PIN must be exactly 6 digits.' };
  }
  if (!verifySecret(pin, wallet.pinHash)) {
    wallet.failedPinAttempts += 1;
    if (wallet.failedPinAttempts >= 5) {
      wallet.pinLockedUntil = now + 60_000;
      wallet.failedPinAttempts = 0;
      appendAudit(
        ledgerCache,
        wallet.id,
        'PIN_LOCKOUT',
        '5 consecutive incorrect PIN attempts triggered a 60-second transfer lock.',
      );
      return {
        ok: false,
        status: 429,
        error: 'Too many incorrect PIN attempts. Transfers locked for 60 seconds.',
      };
    }
    const attemptsLeft = 5 - wallet.failedPinAttempts;
    return {
      ok: false,
      status: 403,
      error: `Incorrect Transfer PIN. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining before temporary lockout.`,
    };
  }
  wallet.failedPinAttempts = 0;
  wallet.pinLockedUntil = null;
  return { ok: true };
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, network: 'DemoCoin Mainnet Sandbox' });
  });

  app.post('/api/auth/register', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const rawHandle = typeof body.handle === 'string' ? body.handle : '';
    const passphrase = typeof body.passphrase === 'string' ? body.passphrase : '';
    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';

    const handle = normalizeHandle(rawHandle);

    if (displayName.length < 2 || displayName.length > 48) {
      res.status(400).json({ error: 'Display name must be between 2 and 48 characters.' });
      return;
    }
    if (!HANDLE_REGEX.test(handle)) {
      res.status(400).json({
        error: 'Handle must be 3–24 characters using lowercase letters, numbers, or underscores.',
      });
      return;
    }
    if (passphrase.length < 8 || passphrase.length > 128) {
      res.status(400).json({ error: 'Security passphrase must be between 8 and 128 characters.' });
      return;
    }
    if (!PIN_REGEX.test(pin)) {
      res.status(400).json({ error: 'Transfer PIN must be exactly 6 numeric digits.' });
      return;
    }

    try {
      const result = await withLedgerLock((ledger) => {
        if (ledger.wallets.some((w) => w.handle.toLowerCase() === handle)) {
          throw Object.assign(new Error('That @handle is already claimed on DemoCoin Network.'), {
            statusCode: 409,
          });
        }

        let address = generateWalletAddress();
        while (ledger.wallets.some((w) => w.address === address)) {
          address = generateWalletAddress();
        }

        const recoveryPhrase = generateMnemonic();
        const now = new Date().toISOString();
        const welcomeCents = 100_000; // 1,000.00 DMC welcome grant

        const newWallet: StoredWallet = {
          id: `wal_${crypto.randomUUID()}`,
          kind: 'user',
          address,
          handle,
          displayName,
          keyFingerprint: generateFingerprint(address),
          balanceCents: welcomeCents,
          dailyLimitCents: 1_000_000, // 10,000.00 DMC
          perTxLimitCents: 500_000, // 5,000.00 DMC
          isFrozen: false,
          tokenEpoch: 1,
          passphraseHash: hashSecret(passphrase),
          pinHash: hashSecret(pin),
          recoveryHash: hashSecret(recoveryPhrase),
          failedPinAttempts: 0,
          pinLockedUntil: null,
          lastFaucetAt: null,
          createdAt: now,
        };

        const faucetNode = ledger.wallets.find((w) => w.id === 'node_faucet');
        const sequence = ledger.nextSequence++;
        const welcomeTx: StoredTransaction = {
          id: `tx_${crypto.randomUUID()}`,
          sequence,
          txHash: computeTxHash(
            sequence,
            faucetNode ? faucetNode.address : 'dmc1faucet',
            address,
            welcomeCents,
            now,
          ),
          kind: 'welcome',
          fromAddress: faucetNode ? faucetNode.address : 'dmc1faucet',
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
        };

        ledger.wallets.push(newWallet);
        ledger.transactions.push(welcomeTx);
        appendAudit(
          ledger,
          newWallet.id,
          'WALLET_CREATED',
          `Wallet @${handle} created with 1,000.00 DMC initial balance.`,
        );

        const token = signToken({
          walletId: newWallet.id,
          address: newWallet.address,
          epoch: newWallet.tokenEpoch,
          exp: Date.now() + TOKEN_TTL_MS,
        });

        return {
          token,
          recoveryPhrase,
          dashboard: {
            wallet: toPublicWallet(ledger, newWallet),
            transactions: getWalletTransactions(ledger, newWallet.address),
            peers: getPeerDirectory(ledger, newWallet.id),
            auditLog: getWalletAuditLog(ledger, newWallet.id),
          },
        };
      });

      res.status(201).json(result);
    } catch (err: unknown) {
      const status =
        err && typeof err === 'object' && 'statusCode' in err ? Number(err.statusCode) : 500;
      const message = err instanceof Error ? err.message : 'Unable to create wallet.';
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
    const passphrase = typeof body.passphrase === 'string' ? body.passphrase : '';

    if (!identifier || !passphrase) {
      res.status(400).json({ error: 'Wallet handle/address and security passphrase are required.' });
      return;
    }

    try {
      const result = await withLedgerLock((ledger) => {
        const wallet = findWalletByIdentifier(ledger, identifier);
        if (!wallet || wallet.kind !== 'user' || !verifySecret(passphrase, wallet.passphraseHash)) {
          throw Object.assign(new Error('Invalid wallet identifier or security passphrase.'), {
            statusCode: 401,
          });
        }

        appendAudit(ledger, wallet.id, 'SIGN_IN', 'Wallet unlocked via passphrase authentication.');

        const token = signToken({
          walletId: wallet.id,
          address: wallet.address,
          epoch: wallet.tokenEpoch,
          exp: Date.now() + TOKEN_TTL_MS,
        });

        return {
          token,
          dashboard: {
            wallet: toPublicWallet(ledger, wallet),
            transactions: getWalletTransactions(ledger, wallet.address),
            peers: getPeerDirectory(ledger, wallet.id),
            auditLog: getWalletAuditLog(ledger, wallet.id),
          },
        };
      });

      res.json(result);
    } catch (err: unknown) {
      const status =
        err && typeof err === 'object' && 'statusCode' in err ? Number(err.statusCode) : 500;
      const message = err instanceof Error ? err.message : 'Sign-in failed.';
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/auth/recover', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
    const recoveryPhrase =
      typeof body.recoveryPhrase === 'string'
        ? body.recoveryPhrase.trim().toLowerCase().replace(/\s+/g, ' ')
        : '';
    const newPassphrase = typeof body.newPassphrase === 'string' ? body.newPassphrase : '';
    const newPin = typeof body.newPin === 'string' ? body.newPin.trim() : '';

    if (!identifier || !recoveryPhrase) {
      res.status(400).json({ error: 'Wallet handle/address and 12-word recovery phrase are required.' });
      return;
    }
    if (newPassphrase.length < 8 || newPassphrase.length > 128) {
      res.status(400).json({ error: 'New passphrase must be between 8 and 128 characters.' });
      return;
    }
    if (!PIN_REGEX.test(newPin)) {
      res.status(400).json({ error: 'New Transfer PIN must be exactly 6 numeric digits.' });
      return;
    }

    try {
      const result = await withLedgerLock((ledger) => {
        const wallet = findWalletByIdentifier(ledger, identifier);
        if (!wallet || wallet.kind !== 'user' || !verifySecret(recoveryPhrase, wallet.recoveryHash)) {
          throw Object.assign(new Error('Recovery phrase did not match that wallet.'), {
            statusCode: 401,
          });
        }

        wallet.passphraseHash = hashSecret(newPassphrase);
        wallet.pinHash = hashSecret(newPin);
        wallet.tokenEpoch += 1;
        wallet.failedPinAttempts = 0;
        wallet.pinLockedUntil = null;

        appendAudit(
          ledger,
          wallet.id,
          'RECOVERY_RESET',
          'Wallet credentials reset via 12-word recovery phrase; all prior sessions revoked.',
        );

        const token = signToken({
          walletId: wallet.id,
          address: wallet.address,
          epoch: wallet.tokenEpoch,
          exp: Date.now() + TOKEN_TTL_MS,
        });

        return {
          token,
          dashboard: {
            wallet: toPublicWallet(ledger, wallet),
            transactions: getWalletTransactions(ledger, wallet.address),
            peers: getPeerDirectory(ledger, wallet.id),
            auditLog: getWalletAuditLog(ledger, wallet.id),
          },
        };
      });

      res.json(result);
    } catch (err: unknown) {
      const status =
        err && typeof err === 'object' && 'statusCode' in err ? Number(err.statusCode) : 500;
      const message = err instanceof Error ? err.message : 'Recovery failed.';
      res.status(status).json({ error: message });
    }
  });

  app.get('/api/wallet/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const wallet = ledgerCache.wallets.find((w) => w.id === req.authWalletId);
    if (!wallet) {
      res.status(404).json({ error: 'Wallet not found.' });
      return;
    }
    res.json({
      wallet: toPublicWallet(ledgerCache, wallet),
      transactions: getWalletTransactions(ledgerCache, wallet.address),
      peers: getPeerDirectory(ledgerCache, wallet.id),
      auditLog: getWalletAuditLog(ledgerCache, wallet.id),
    });
  });

  app.get('/api/wallet/lookup', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q || q.length > 100) {
      res.status(400).json({ error: 'Enter a valid @handle or dmc1 address.' });
      return;
    }
    const target = findWalletByIdentifier(ledgerCache, q);
    if (!target || target.kind === 'faucet') {
      res.status(404).json({ error: 'No recipient wallet found for that handle or address.' });
      return;
    }
    if (target.id === req.authWalletId) {
      res.status(400).json({ error: 'You cannot send coins to your own wallet address.' });
      return;
    }
    res.json({
      peer: {
        id: target.id,
        address: target.address,
        handle: target.handle,
        displayName: target.displayName,
        keyFingerprint: target.keyFingerprint,
        kind: target.kind,
      },
    });
  });

  app.post('/api/transfers/send', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const recipientInput = typeof body.recipient === 'string' ? body.recipient.trim() : '';
    const amountRaw = typeof body.amount === 'number' ? body.amount : Number(body.amount);
    const memo = typeof body.memo === 'string' ? body.memo.trim().slice(0, 140) : '';
    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';

    if (!recipientInput || recipientInput.length > 100) {
      res.status(400).json({ error: 'Recipient @handle or dmc1 address is required.' });
      return;
    }
    if (!Number.isFinite(amountRaw) || amountRaw < 0.01 || amountRaw > 10_000_000) {
      res.status(400).json({ error: 'Enter a valid transfer amount (minimum 0.01 DMC).' });
      return;
    }
    const amountCents = Math.round(amountRaw * 100);
    if (amountCents < 1) {
      res.status(400).json({ error: 'Minimum transfer amount is 0.01 DMC.' });
      return;
    }

    try {
      const result = await withLedgerLock((ledger) => {
        const sender = ledger.wallets.find((w) => w.id === req.authWalletId);
        if (!sender) {
          throw Object.assign(new Error('Sender wallet not found.'), { statusCode: 404 });
        }
        if (sender.isFrozen) {
          throw Object.assign(
            new Error('Wallet is currently frozen. Unfreeze it in Security Center before sending.'),
            { statusCode: 403 },
          );
        }

        const pinCheck = verifyTransferPin(sender, pin);
        if (!pinCheck.ok) {
          throw Object.assign(new Error(pinCheck.error), { statusCode: pinCheck.status });
        }

        const recipient = findWalletByIdentifier(ledger, recipientInput);
        if (!recipient || recipient.kind === 'faucet') {
          throw Object.assign(
            new Error('Recipient wallet not found on the DemoCoin network.'),
            { statusCode: 404 },
          );
        }
        if (recipient.id === sender.id) {
          throw Object.assign(new Error('Cannot transfer DemoCoins to your own wallet.'), {
            statusCode: 400,
          });
        }
        if (amountCents > sender.perTxLimitCents) {
          throw Object.assign(
            new Error(
              `Amount exceeds your per-transaction security limit (${(sender.perTxLimitCents / 100).toFixed(2)} DMC).`,
            ),
            { statusCode: 400 },
          );
        }
        const dailySpent = getDailySpentCents(ledger, sender.address);
        if (dailySpent + amountCents > sender.dailyLimitCents) {
          const remaining = Math.max(0, sender.dailyLimitCents - dailySpent);
          throw Object.assign(
            new Error(
              `Amount exceeds your remaining daily transfer limit (${(remaining / 100).toFixed(2)} DMC remaining today).`,
            ),
            { statusCode: 400 },
          );
        }
        if (sender.balanceCents < amountCents) {
          throw Object.assign(new Error('Insufficient DemoCoin balance for this transfer.'), {
            statusCode: 400,
          });
        }

        const now = new Date().toISOString();
        const sequence = ledger.nextSequence++;
        sender.balanceCents -= amountCents;
        recipient.balanceCents += amountCents;

        const tx: StoredTransaction = {
          id: `tx_${crypto.randomUUID()}`,
          sequence,
          txHash: computeTxHash(sequence, sender.address, recipient.address, amountCents, now),
          kind: 'transfer',
          fromAddress: sender.address,
          fromHandle: sender.handle,
          fromName: sender.displayName,
          toAddress: recipient.address,
          toHandle: recipient.handle,
          toName: recipient.displayName,
          amountCents,
          feeCents: 0,
          memo: memo || 'Peer-to-peer DemoCoin transfer',
          status: 'confirmed',
          createdAt: now,
        };

        ledger.transactions.push(tx);
        appendAudit(
          ledger,
          sender.id,
          'TRANSFER_SENT',
          `Sent ${(amountCents / 100).toFixed(2)} DMC to @${recipient.handle} (Tx #${sequence}).`,
        );

        return {
          transaction: tx,
          dashboard: {
            wallet: toPublicWallet(ledger, sender),
            transactions: getWalletTransactions(ledger, sender.address),
            peers: getPeerDirectory(ledger, sender.id),
            auditLog: getWalletAuditLog(ledger, sender.id),
          },
        };
      });

      res.json(result);
    } catch (err: unknown) {
      const status =
        err && typeof err === 'object' && 'statusCode' in err ? Number(err.statusCode) : 500;
      const message = err instanceof Error ? err.message : 'Transfer failed.';
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/wallet/faucet', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await withLedgerLock((ledger) => {
        const wallet = ledger.wallets.find((w) => w.id === req.authWalletId);
        if (!wallet) {
          throw Object.assign(new Error('Wallet not found.'), { statusCode: 404 });
        }
        const nowMs = Date.now();
        if (wallet.lastFaucetAt && nowMs - wallet.lastFaucetAt < 15_000) {
          const waitSec = Math.ceil((15_000 - (nowMs - wallet.lastFaucetAt)) / 1000);
          throw Object.assign(
            new Error(`Faucet cooldown active. You can request more DemoCoins in ${waitSec}s.`),
            { statusCode: 429 },
          );
        }

        const faucet = ledger.wallets.find((w) => w.id === 'node_faucet');
        const amountCents = 25_000; // 250.00 DMC
        const now = new Date().toISOString();
        const sequence = ledger.nextSequence++;

        wallet.balanceCents += amountCents;
        wallet.lastFaucetAt = nowMs;
        if (faucet && faucet.balanceCents >= amountCents) {
          faucet.balanceCents -= amountCents;
        }

        const tx: StoredTransaction = {
          id: `tx_${crypto.randomUUID()}`,
          sequence,
          txHash: computeTxHash(
            sequence,
            faucet ? faucet.address : 'dmc1faucet',
            wallet.address,
            amountCents,
            now,
          ),
          kind: 'faucet',
          fromAddress: faucet ? faucet.address : 'dmc1faucet',
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
        appendAudit(ledger, wallet.id, 'FAUCET_CLAIMED', 'Claimed +250.00 DMC from DemoCoin Faucet.');

        return {
          transaction: tx,
          dashboard: {
            wallet: toPublicWallet(ledger, wallet),
            transactions: getWalletTransactions(ledger, wallet.address),
            peers: getPeerDirectory(ledger, wallet.id),
            auditLog: getWalletAuditLog(ledger, wallet.id),
          },
        };
      });

      res.json(result);
    } catch (err: unknown) {
      const status =
        err && typeof err === 'object' && 'statusCode' in err ? Number(err.statusCode) : 500;
      const message = err instanceof Error ? err.message : 'Faucet claim failed.';
      res.status(status).json({ error: message });
    }
  });

  app.patch('/api/wallet/security', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const currentPin = typeof body.currentPin === 'string' ? body.currentPin.trim() : '';

    try {
      const result = await withLedgerLock((ledger) => {
        const wallet = ledger.wallets.find((w) => w.id === req.authWalletId);
        if (!wallet) {
          throw Object.assign(new Error('Wallet not found.'), { statusCode: 404 });
        }

        const pinCheck = verifyTransferPin(wallet, currentPin);
        if (!pinCheck.ok) {
          throw Object.assign(new Error(pinCheck.error), { statusCode: pinCheck.status });
        }

        if (typeof body.isFrozen === 'boolean' && body.isFrozen !== wallet.isFrozen) {
          wallet.isFrozen = body.isFrozen;
          appendAudit(
            ledger,
            wallet.id,
            body.isFrozen ? 'WALLET_FROZEN' : 'WALLET_UNFROZEN',
            body.isFrozen
              ? 'Emergency wallet freeze enabled; outgoing transfers blocked.'
              : 'Wallet freeze lifted after PIN verification.',
          );
        }

        if (typeof body.perTxLimit === 'number' || typeof body.dailyLimit === 'number') {
          const nextPerTx =
            typeof body.perTxLimit === 'number'
              ? Math.round(body.perTxLimit * 100)
              : wallet.perTxLimitCents;
          const nextDaily =
            typeof body.dailyLimit === 'number'
              ? Math.round(body.dailyLimit * 100)
              : wallet.dailyLimitCents;

          if (
            !Number.isFinite(nextPerTx) ||
            !Number.isFinite(nextDaily) ||
            nextPerTx < 5_000 ||
            nextPerTx > 5_000_000 ||
            nextDaily < 10_000 ||
            nextDaily > 10_000_000
          ) {
            throw Object.assign(
              new Error('Limits must be between 50–50,000 DMC (per-tx) and 100–100,000 DMC (daily).'),
              { statusCode: 400 },
            );
          }
          if (nextPerTx > nextDaily) {
            throw Object.assign(
              new Error('Per-transaction limit cannot exceed your daily transfer limit.'),
              { statusCode: 400 },
            );
          }

          wallet.perTxLimitCents = nextPerTx;
          wallet.dailyLimitCents = nextDaily;
          appendAudit(
            ledger,
            wallet.id,
            'LIMITS_UPDATED',
            `Updated transfer caps to ${(nextPerTx / 100).toFixed(0)} DMC/tx and ${(nextDaily / 100).toFixed(0)} DMC/day.`,
          );
        }

        if (typeof body.newPin === 'string' && body.newPin.trim().length > 0) {
          const newPin = body.newPin.trim();
          if (!PIN_REGEX.test(newPin)) {
            throw Object.assign(new Error('New Transfer PIN must be exactly 6 numeric digits.'), {
              statusCode: 400,
            });
          }
          wallet.pinHash = hashSecret(newPin);
          appendAudit(ledger, wallet.id, 'PIN_CHANGED', '6-digit Transfer PIN rotated.');
        }

        return {
          dashboard: {
            wallet: toPublicWallet(ledger, wallet),
            transactions: getWalletTransactions(ledger, wallet.address),
            peers: getPeerDirectory(ledger, wallet.id),
            auditLog: getWalletAuditLog(ledger, wallet.id),
          },
        };
      });

      res.json(result);
    } catch (err: unknown) {
      const status =
        err && typeof err === 'object' && 'statusCode' in err ? Number(err.statusCode) : 500;
      const message = err instanceof Error ? err.message : 'Unable to update security settings.';
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/auth/logout-all', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await withLedgerLock((ledger) => {
        const wallet = ledger.wallets.find((w) => w.id === req.authWalletId);
        if (!wallet) return;
        wallet.tokenEpoch += 1;
        appendAudit(
          ledger,
          wallet.id,
          'SESSIONS_REVOKED',
          'All active sessions invalidated via emergency sign-out.',
        );
      });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to revoke sessions.' });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DemoCoin Wallet server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start DemoCoin Wallet server:', err);
  process.exit(1);
});
