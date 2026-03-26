// client/src/hooks/useWalletAccess.ts
// Manages wallet connection (Phantom / Solflare) and NFT access state.
// Treasury address is fetched from /api/nft/config so FOUNDER_WALLET
// stays in Replit secrets and never touches the client bundle.

import { useState, useEffect, useCallback } from 'react';

export type AccessStatus =
  | 'loading' | 'disconnected' | 'checking'
  | 'active'  | 'none'         | 'revoked' | 'expired';

export interface AccessRecord {
  hasAccess:    boolean;
  status:       AccessStatus;
  wallet:       string | null;
  tier?:        string;
  mintAddress?: string;
  mintNumber?:  number;
  expiresAt?:   string;
  daysLeft?:    number;
  reason?:      string;
  revokedAt?:   string;
  appealEmail?: string;
  expiredAt?:   string;
}

export interface NftPrice {
  usdPrice:     number;
  solPrice:     number;
  solUsd:       number;
  minted:       number;
  remaining:    number;
  isEarlyPrice: boolean;
}

export interface MintSimulation {
  estimatedFeeSol: number;
  estimatedFeeUsd: number;
  totalUsd:        number;
  totalSol:        number;
  nftPriceUsd:     number;
  nftPriceSol:     number;
  solUsd:          number;
}

type WalletProvider = {
  isPhantom?:              boolean;
  isSolflare?:             boolean;
  publicKey:               { toString(): string } | null;
  connect:                 (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect:              () => Promise<void>;
  signTransaction?:        (tx: any) => Promise<any>;
  signAndSendTransaction?: (tx: any) => Promise<{ signature: string }>;
};

declare global {
  interface Window {
    solana?:   WalletProvider;
    solflare?: WalletProvider;
    phantom?:  { solana?: WalletProvider };
  }
}

function getProvider(): WalletProvider | null {
  if (typeof window === 'undefined') return null;
  const phantom  = window.phantom?.solana || window.solana;
  const solflare = window.solflare;
  if (phantom?.isPhantom)   return phantom;
  if (solflare?.isSolflare) return solflare;
  if (phantom)              return phantom;
  return null;
}

export function useWalletAccess() {
  const [provider,     setProvider]     = useState<WalletProvider | null>(null);
  const [wallet,       setWallet]       = useState<string | null>(null);
  const [access,       setAccess]       = useState<AccessRecord>({ hasAccess: false, status: 'loading', wallet: null });
  const [nftPrice,     setNftPrice]     = useState<NftPrice | null>(null);
  const [mintSim,      setMintSim]      = useState<MintSimulation | null>(null);
  const [treasuryAddr, setTreasuryAddr] = useState<string | null>(null);
  const [connecting,   setConnecting]   = useState(false);
  const [mintState,    setMintState]    = useState<'idle' | 'simulating' | 'signing' | 'confirming' | 'success' | 'error'>('idle');
  const [mintError,    setMintError]    = useState<string | null>(null);

  // Fetch treasury address from server (FOUNDER_WALLET env var lives here)
  useEffect(() => {
    fetch('/api/nft/config')
      .then(r => r.json())
      .then(d => setTreasuryAddr(d.treasuryAddress ?? null))
      .catch(() => {});
  }, []);

  // Init provider and attempt silent reconnect
  useEffect(() => {
    const prov = getProvider();
    setProvider(prov);

    if (prov?.publicKey) {
      const addr = prov.publicKey.toString();
      setWallet(addr);
      checkAccess(addr);
    } else if (prov) {
      prov.connect({ onlyIfTrusted: true })
        .then(res => { const addr = res.publicKey.toString(); setWallet(addr); checkAccess(addr); })
        .catch(() => setAccess(prev => ({ ...prev, status: 'disconnected' })));
    } else {
      setAccess(prev => ({ ...prev, status: 'disconnected' }));
    }
  }, []);

  // Fetch NFT price
  useEffect(() => {
    fetch('/api/nft/price').then(r => r.json()).then(setNftPrice).catch(() => {});
  }, []);

  const checkAccess = useCallback(async (addr: string) => {
    setAccess(prev => ({ ...prev, status: 'checking', wallet: addr }));
    try {
      const res  = await fetch(`/api/nft/check/${addr}`);
      const data = await res.json();
      setAccess({ ...data, wallet: addr, status: data.status || (data.hasAccess ? 'active' : 'none') });
    } catch {
      setAccess({ hasAccess: false, status: 'none', wallet: addr });
    }
  }, []);

  const connect = useCallback(async () => {
    const prov = getProvider();
    if (!prov) { window.open('https://phantom.app/', '_blank'); return; }
    setConnecting(true);
    try {
      const res  = await prov.connect();
      const addr = res.publicKey.toString();
      setWallet(addr); setProvider(prov);
      await checkAccess(addr);
    } catch {
      setAccess(prev => ({ ...prev, status: 'disconnected' }));
    } finally { setConnecting(false); }
  }, [checkAccess]);

  const disconnect = useCallback(async () => {
    if (provider) await provider.disconnect().catch(() => {});
    setWallet(null);
    setAccess({ hasAccess: false, status: 'disconnected', wallet: null });
  }, [provider]);

  const simulateMint = useCallback(async (addr: string) => {
    setMintState('simulating');
    try {
      const res  = await fetch('/api/protocol/simulate-mint', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: addr }),
      });
      setMintSim(await res.json());
    } catch {}
    finally { setMintState('idle'); }
  }, []);

  const executeMint = useCallback(async () => {
    if (!provider || !wallet || !treasuryAddr) return;
    setMintError(null);
    try {
      setMintState('signing');
      const { Connection, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } =
        await import('@solana/web3.js');

      const solPrice = mintSim?.totalSol ?? nftPrice?.solPrice ?? 0.2;
      const lamports = Math.round(solPrice * LAMPORTS_PER_SOL);
      const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
      const { blockhash } = await connection.getLatestBlockhash();

      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: new PublicKey(wallet) })
        .add(SystemProgram.transfer({
          fromPubkey: new PublicKey(wallet),
          toPubkey:   new PublicKey(treasuryAddr),  // ← FOUNDER_WALLET from server env
          lamports,
        }));

      let txSignature: string;
      if (provider.signAndSendTransaction) {
        txSignature = (await provider.signAndSendTransaction(tx)).signature;
      } else if (provider.signTransaction) {
        const signed = await provider.signTransaction(tx);
        txSignature  = await connection.sendRawTransaction(signed.serialize());
      } else {
        throw new Error('Wallet does not support signing');
      }

      setMintState('confirming');
      const confirmData = await fetch('/api/nft/confirm-mint', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, txSignature, tier: 'bronze' }),
      }).then(r => r.json());

      if (!confirmData.success) throw new Error(confirmData.error || 'Confirmation failed');
      setMintState('success');
      setTimeout(() => checkAccess(wallet), 1500);

    } catch (e: any) {
      setMintState('error');
      setMintError(e?.message || 'Transaction failed. Please try again.');
    }
  }, [provider, wallet, treasuryAddr, mintSim, nftPrice, checkAccess]);

  const submitAppeal = useCallback(async (message: string) => {
    if (!wallet) return { success: false };
    try {
      return await fetch('/api/nft/appeal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, message }),
      }).then(r => r.json());
    } catch { return { success: false }; }
  }, [wallet]);

  return {
    wallet, access, nftPrice, mintSim, connecting,
    mintState, mintError, hasProvider: !!getProvider(),
    connect, disconnect, simulateMint, executeMint, submitAppeal, checkAccess,
  };
}