/**
 * ProtocolHub — Protocol Genesis NFT Collection
 * Candy Machine v3 Deploy Script
 *
 * Uses hiddenSettings with DYNAMIC metadata URI.
 * Each NFT points to your own server which returns live data.
 * Points balance, tier, and tenure update automatically.
 *
 * Supply:   25,000
 * Early:    First 2,000 @ 40 USDC
 * Public:   Remaining   @ 70 USDC
 * Payment:  USDC (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)
 * Royalty:  6%
 */

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  keypairIdentity,
  generateSigner,
  some,
  none,
  publicKey as umiPublicKey,
} from '@metaplex-foundation/umi';
import {
  create,
  mplCandyMachine,
  fetchCandyMachine,
} from '@metaplex-foundation/mpl-candy-machine';
import {
  createNft,
  mplTokenMetadata,
} from '@metaplex-foundation/mpl-token-metadata';
import bs58 from 'bs58';

// ─── Config ───────────────────────────────────────────────────────────────────

const USDC_MINT          = umiPublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const toUSDC             = (n: number) => BigInt(n * 10 ** 6);

const EARLY_PRICE_USDC   = 40;
const PUBLIC_PRICE_USDC  = 70;
const EARLY_SUPPLY       = 2_000;
const TOTAL_SUPPLY       = 25_000;

const COLLECTION_NAME    = 'Protocol Genesis';
const COLLECTION_SYMBOL  = 'PGEN';
const SELLER_FEE_BASIS   = 600; // 6%

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API}`;
  const META_URI  = process.env.NFT_METADATA_URI;    // Pinata URI — used for collection NFT only
  const KEYPAIR   = process.env.UPDATE_AUTHORITY_KEYPAIR;
  const FOUNDER   = process.env.FOUNDER_WALLET;
  const DOMAIN    = process.env.SITE_DOMAIN || 'inku.riker.replit.dev';

  if (!RPC)      throw new Error('QN_HTTP_A not set');
  if (!META_URI) throw new Error('NFT_METADATA_URI not set');
  if (!KEYPAIR)  throw new Error('UPDATE_AUTHORITY_KEYPAIR not set');
  if (!FOUNDER)  throw new Error('FOUNDER_WALLET not set');

  // Dynamic metadata base URL — each NFT gets its own endpoint
  // NFT #1 → https://yourdomain.com/api/nft/metadata/1
  // Your server reads DB and returns live points/tier for that token
  const DYNAMIC_META_BASE = `https://${DOMAIN}/api/nft/metadata`;

  console.log('\n  Protocol Genesis — Candy Machine v3 deploy');
  console.log(`    Supply     : ${TOTAL_SUPPLY.toLocaleString()}`);
  console.log(`    Early tier : ${EARLY_SUPPLY.toLocaleString()} x $${EARLY_PRICE_USDC} USDC`);
  console.log(`    Public tier: ${(TOTAL_SUPPLY - EARLY_SUPPLY).toLocaleString()} x $${PUBLIC_PRICE_USDC} USDC`);
  console.log(`    Metadata   : DYNAMIC — ${DYNAMIC_META_BASE}/$ID$`);
  console.log(`    Royalty    : ${SELLER_FEE_BASIS / 100}%\n`);

  // Build UMI
  const umi = createUmi(RPC)
    .use(mplTokenMetadata())
    .use(mplCandyMachine());

  // Load keypair
  let secretBytes: Uint8Array;
  try {
    const raw = KEYPAIR.trim();
    secretBytes = raw.startsWith('[')
      ? new Uint8Array(JSON.parse(raw))
      : bs58.decode(raw);
  } catch {
    throw new Error('Could not parse UPDATE_AUTHORITY_KEYPAIR');
  }

  const updateAuthority   = umi.eddsa.createKeypairFromSecretKey(secretBytes);
  umi.use(keypairIdentity(updateAuthority));

  const authority         = updateAuthority.publicKey;
  const destinationWallet = umiPublicKey(FOUNDER);

  console.log(`  Authority : ${authority}`);
  console.log(`  Revenue   : ${destinationWallet}\n`);

  // Step 1: Collection NFT — uses Pinata URI (static, just for the collection itself)
  console.log('  Using existing collection NFT...');
  // SKIP - already created
  const collectionMint = { publicKey: umiPublicKey('FfijWgeLocQpCfEFdwQazYSmoeMgmWxMy6p7xt7tRRav'), secretKey: new Uint8Array(64) };

  await createNft(umi, {
    mint:      collectionMint,
    authority: umi.identity,
    name:      COLLECTION_NAME,
    symbol:    COLLECTION_SYMBOL,
    uri:       META_URI,
    sellerFeeBasisPoints: {
      basisPoints: BigInt(SELLER_FEE_BASIS),
      identifier:  '%',
      decimals:    2,
    },
    isCollection: true,
    creators: [{ address: authority, verified: true, share: 100 }],
  }).sendAndConfirm(umi, { confirm: { commitment: 'finalized' } });

  console.log(`  Collection NFT : ${collectionMint.publicKey}\n`);

  // Step 2: Candy Machine — uses DYNAMIC URI per token
  // hiddenSettings name template: "Protocol Genesis #$ID$"
  // hiddenSettings uri template:  "https://yourdomain.com/api/nft/metadata/$ID$"
  // Metaplex replaces $ID$ with the mint number at mint time
  console.log('  Creating Candy Machine v3...');
  const candyMachine = generateSigner(umi);

  const hidden = some({
    name: `${COLLECTION_NAME} #$ID$`,
    uri:  `${DYNAMIC_META_BASE}/$ID$`,
    hash: new Uint8Array(32),
  });

  const _cmTx = create(umi, {
    candyMachine,
    collectionMint:            collectionMint.publicKey,
    collectionUpdateAuthority: umi.identity,
    tokenStandard:             0,
    sellerFeeBasisPoints: {
      basisPoints: BigInt(SELLER_FEE_BASIS),
      identifier:  '%',
      decimals:    2,
    },
    itemsAvailable:     BigInt(TOTAL_SUPPLY),
    creators:           [{ address: authority, verified: true, percentageShare: 100 }],
    hiddenSettings:     hidden,
    configLineSettings: none(),
    guards: {},
    groups: [
      {
        label: 'early',
        guards: {
          splTokenPayment: some({
            amount:         toUSDC(EARLY_PRICE_USDC),
            mint:           USDC_MINT,
            destinationAta: destinationWallet,
          }),
          redeemedAmount: some({
            maximum: BigInt(EARLY_SUPPLY),
          }),
        },
      },
      {
        label: 'public',
        guards: {
          splTokenPayment: some({
            amount:         toUSDC(PUBLIC_PRICE_USDC),
            mint:           USDC_MINT,
            destinationAta: destinationWallet,
          }),
        },
      },
    ],
  });
await _cmTx.sendAndConfirm(umi, { confirm: { commitment: 'finalized' } });
 : ${candyMachine.publicKey}\n`);

  // Step 3: Verify
  const cm = await fetchCandyMachine(umi, candyMachine.publicKey);
  console.log(`  Items available : ${cm.data.itemsAvailable}`);
  console.log(`  Items redeemed  : ${cm.itemsRedeemed}`);

  console.log(`
  Protocol Genesis is live on Solana mainnet!

  Collection NFT : ${collectionMint.publicKey}
  Candy Machine  : ${candyMachine.publicKey}
  Revenue wallet : ${destinationWallet}
  Metadata API   : ${DYNAMIC_META_BASE}/$ID$

  NEXT STEPS:
  1. Paste Collection NFT into Replit secret: NFT_COLLECTION_ID
  2. Metadata updates automatically from your DB — no uploads needed
  3. Points, tier and tenure show live on Magic Eden
`);
}

main().catch(err => {
  console.error('Deploy failed:', err.message || err);
  process.exit(1);
});
