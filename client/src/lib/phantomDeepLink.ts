/**
 * phantomDeepLink.ts
 *
 * Phantom Universal Links (deeplink) engine for ProtocolHub.
 *
 * HOW IT WORKS
 * ─────────────────────────────────────────────────────────────────
 * Desktop (Phantom extension present):
 *   → wallet adapter handles connect/sign as normal extension popups.
 *     User never leaves the site.
 *
 * Mobile (or no extension):
 *   → Connect:   navigate → phantom.app/ul/v1/connect
 *                Phantom opens, user approves, redirected back to site
 *   → Sign/Send: navigate → phantom.app/ul/v1/signAndSendTransaction
 *                Phantom opens, user signs, redirected back to site
 *
 * Persistence:
 *   → pubkey, session, and phantomPubkey stored in localStorage.
 *   → On every page load ConnectPanel checks localStorage first —
 *     wallet stays "connected" indefinitely until user disconnects.
 *   → The nacl dapp keypair is also persisted so Phantom recognises
 *     the same dapp identity across sessions.
 *
 * PACKAGES REQUIRED (already in most Solana frontends):
 *   npm install tweetnacl bs58
 */

import nacl from 'tweetnacl';
import bs58 from 'bs58';

// ─── Storage keys ──────────────────────────────────────────────────────────

export const STORAGE = {
  WALLET_PUBKEY:   'ph_pubkey',        // connected wallet's base58 pubkey
  SESSION:         'ph_session',       // Phantom session token (for re-signing)
  PHANTOM_PUBKEY:  'ph_phantom_pub',   // Phantom's ephemeral encryption pubkey
  DAPP_SECRET:     'ph_dapp_secret',   // our nacl box secret key (persisted)
  PENDING_ACTION:  'ph_pending',       // 'mint' — indicates we're mid-flow
  MINT_STEP:       'ph_mint_step',     // for UI state restoration on redirect
} as const;

export const APP_URL      = 'https://protocolhub.site';
export const CLUSTER      = 'mainnet-beta';

// ─── Dapp keypair ─────────────────────────────────────────────────────────
// We persist the dapp keypair so that Phantom recognises the same dapp
// identity across sessions. Without this, every page reload would create
// a fresh keypair and Phantom would treat it as a brand-new dapp.

export function getDappKeypair(): nacl.BoxKeyPair {
  try {
    const stored = localStorage.getItem(STORAGE.DAPP_SECRET);
    if (stored) {
      return nacl.box.keyPair.fromSecretKey(bs58.decode(stored));
    }
  } catch { /* fall through to generate */ }

  const kp = nacl.box.keyPair();
  localStorage.setItem(STORAGE.DAPP_SECRET, bs58.encode(kp.secretKey));
  return kp;
}

// ─── Shared secret helper ─────────────────────────────────────────────────

function sharedSecret(phantomPubB58: string): Uint8Array {
  const dapp = getDappKeypair();
  return nacl.box.before(bs58.decode(phantomPubB58), dapp.secretKey);
}

// ─── Encrypt / Decrypt ────────────────────────────────────────────────────

function encrypt(payload: object, ss: Uint8Array): { nonce: string; data: string } {
  const nonce = nacl.randomBytes(24);
  const box   = nacl.box.after(
    Buffer.from(JSON.stringify(payload)),
    nonce,
    ss,
  );
  return { nonce: bs58.encode(nonce), data: bs58.encode(box) };
}

function decrypt(data: string, nonce: string, ss: Uint8Array): any {
  const plain = nacl.box.open.after(
    bs58.decode(data),
    bs58.decode(nonce),
    ss,
  );
  if (!plain) throw new Error('Phantom: decryption failed');
  return JSON.parse(Buffer.from(plain).toString('utf8'));
}

// ─── Device detection ─────────────────────────────────────────────────────

export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function hasPhantomExtension(): boolean {
  return !!(window as any).phantom?.solana?.isPhantom;
}

/** Use deeplinks when on mobile OR when Phantom extension is absent. */
export function useDeepLinks(): boolean {
  return isMobileDevice() || !hasPhantomExtension();
}

// ─── Persistent wallet state ──────────────────────────────────────────────

export interface StoredWallet {
  pubkey:       string;   // user's wallet public key (base58)
  session:      string;   // Phantom session token
  phantomPubkey: string;  // Phantom's encryption public key (base58)
}

export function getStoredWallet(): StoredWallet | null {
  const pubkey       = localStorage.getItem(STORAGE.WALLET_PUBKEY);
  const session      = localStorage.getItem(STORAGE.SESSION);
  const phantomPubkey = localStorage.getItem(STORAGE.PHANTOM_PUBKEY);
  if (pubkey && session && phantomPubkey) return { pubkey, session, phantomPubkey };
  return null;
}

export function storeWallet(w: StoredWallet): void {
  localStorage.setItem(STORAGE.WALLET_PUBKEY, w.pubkey);
  localStorage.setItem(STORAGE.SESSION,       w.session);
  localStorage.setItem(STORAGE.PHANTOM_PUBKEY, w.phantomPubkey);
}

export function clearWallet(): void {
  // Remove wallet state but keep dapp keypair (preserves site identity)
  localStorage.removeItem(STORAGE.WALLET_PUBKEY);
  localStorage.removeItem(STORAGE.SESSION);
  localStorage.removeItem(STORAGE.PHANTOM_PUBKEY);
  localStorage.removeItem(STORAGE.PENDING_ACTION);
  localStorage.removeItem(STORAGE.MINT_STEP);
}

// ─── CONNECT ──────────────────────────────────────────────────────────────

/**
 * Build the Phantom connect deep link URL.
 * Navigate the user here; after approval Phantom redirects back to
 *   APP_URL + '?phantom_action=connect' + encrypted params
 */
export function buildConnectUrl(): string {
  const dapp = getDappKeypair();
  const params = new URLSearchParams({
    app_url:                    APP_URL,
    dapp_encryption_public_key: bs58.encode(dapp.publicKey),
    redirect_link:              `${APP_URL}/?phantom_action=connect`,
    cluster:                    CLUSTER,
  });
  return `https://phantom.app/ul/v1/connect?${params}`;
}

/**
 * Parse the URL params Phantom appends to your redirect_link after connect.
 * Returns the wallet pubkey + session, or null on error/cancel.
 */
export function parseConnectResponse(params: URLSearchParams): StoredWallet | null {
  const phantomPubkey = params.get('phantom_encryption_public_key');
  const nonce         = params.get('nonce');
  const data          = params.get('data');
  const errorCode     = params.get('errorCode');

  if (errorCode || !phantomPubkey || !nonce || !data) return null;

  try {
    const ss        = sharedSecret(phantomPubkey);
    const decrypted = decrypt(data, nonce, ss);
    return {
      pubkey:        decrypted.public_key as string,
      session:       decrypted.session    as string,
      phantomPubkey,
    };
  } catch {
    return null;
  }
}

// ─── SIGN AND SEND TRANSACTION ────────────────────────────────────────────

/**
 * Build the Phantom signAndSendTransaction deep link URL.
 *
 * @param serializedTx  - tx.serialize({ requireAllSignatures: false })
 * @param wallet        - stored wallet state (session + phantomPubkey)
 *
 * Navigate here; after signing Phantom redirects back to
 *   APP_URL + '?phantom_action=sign' + encrypted signature
 */
export function buildSignAndSendUrl(
  serializedTx: Uint8Array,
  wallet: StoredWallet,
): string {
  const dapp    = getDappKeypair();
  const ss      = sharedSecret(wallet.phantomPubkey);
  const payload = { session: wallet.session, transaction: bs58.encode(serializedTx) };
  const { nonce, data } = encrypt(payload, ss);

  const params = new URLSearchParams({
    dapp_encryption_public_key: bs58.encode(dapp.publicKey),
    nonce,
    redirect_link: `${APP_URL}/?phantom_action=sign`,
    payload: data,
  });

  return `https://phantom.app/ul/v1/signAndSendTransaction?${params}`;
}

/**
 * Parse the URL params Phantom appends after signAndSendTransaction.
 * Returns the on-chain signature, or null on error/cancel.
 */
export function parseSignResponse(
  params: URLSearchParams,
  wallet: StoredWallet,
): { signature: string } | null {
  const nonce     = params.get('nonce');
  const data      = params.get('data');
  const errorCode = params.get('errorCode');

  if (errorCode || !nonce || !data) return null;

  try {
    const ss        = sharedSecret(wallet.phantomPubkey);
    const decrypted = decrypt(data, nonce, ss);
    return { signature: decrypted.signature as string };
  } catch {
    return null;
  }
}
