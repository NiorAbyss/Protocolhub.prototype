import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, generateSigner, some, none, publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import { create, mplCandyMachine } from '@metaplex-foundation/mpl-candy-machine';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import bs58 from 'bs58';

const USDC_MINT      = umiPublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const toUSDC         = (n: number) => BigInt(n * 10 ** 6);
const EARLY_PRICE    = 40;
const PUBLIC_PRICE   = 70;
const EARLY_SUPPLY   = 2000;
const TOTAL_SUPPLY   = 25000;
const SELLER_FEE     = 600;
const COLLECTION_NFT = umiPublicKey('FfijWgeLocQpCfEFdwQazYSmoeMgmWxMy6p7xt7tRRav');

async function main() {
  const RPC     = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API}`;
  const KEYPAIR = process.env.UPDATE_AUTHORITY_KEYPAIR!;
  const FOUNDER = process.env.FOUNDER_WALLET!;
  const DOMAIN  = process.env.SITE_DOMAIN || 'inku.riker.replit.dev';

  if (!KEYPAIR) throw new Error('UPDATE_AUTHORITY_KEYPAIR not set');
  if (!FOUNDER) throw new Error('FOUNDER_WALLET not set');

  const raw = KEYPAIR.trim();
  const secretBytes = raw.startsWith('[')
    ? new Uint8Array(JSON.parse(raw))
    : bs58.decode(raw);

  const umi = createUmi(RPC).use(mplTokenMetadata()).use(mplCandyMachine());
  const updateAuthority = umi.eddsa.createKeypairFromSecretKey(secretBytes);
  umi.use(keypairIdentity(updateAuthority));

  const authority         = updateAuthority.publicKey;
  const destinationWallet = umiPublicKey(FOUNDER);
  const candyMachine      = generateSigner(umi);
  const metaBase          = `https://${DOMAIN}/api/nft/metadata`;

  console.log('\n  Creating Candy Machine v3...');
  console.log(`  Authority : ${authority}`);
  console.log(`  Revenue   : ${destinationWallet}`);
  console.log(`  Metadata  : ${metaBase}/$ID$\n`);

  // v6: create() returns a TransactionBuilder — await it then call sendAndConfirm separately
  const builder = await create(umi, {
    candyMachine,
    collectionMint:            COLLECTION_NFT,
    collectionUpdateAuthority: umi.identity,
    tokenStandard:             0,
    sellerFeeBasisPoints:      { basisPoints: BigInt(SELLER_FEE), identifier: '%', decimals: 2 },
    itemsAvailable:            BigInt(TOTAL_SUPPLY),
    creators:                  [{ address: authority, verified: true, percentageShare: 100 }],
    hiddenSettings: some({
      name: `Protocol Genesis #$ID$`,
      uri:  `${metaBase}/$ID$`,
      hash: new Uint8Array(32),
    }),
    configLineSettings: none(),
    guards: {},
    groups: [
      {
        label: 'early',
        guards: {
          splTokenPayment: some({ amount: toUSDC(EARLY_PRICE), mint: USDC_MINT, destinationAta: destinationWallet }),
          redeemedAmount:  some({ maximum: BigInt(EARLY_SUPPLY) }),
        },
      },
      {
        label: 'public',
        guards: {
          splTokenPayment: some({ amount: toUSDC(PUBLIC_PRICE), mint: USDC_MINT, destinationAta: destinationWallet }),
        },
      },
    ],
  });

  await builder.sendAndConfirm(umi, { confirm: { commitment: 'finalized' } });

  console.log(`\n  ✅ Candy Machine : ${candyMachine.publicKey}`);
  console.log(`  ✅ Collection NFT: ${COLLECTION_NFT}`);
  console.log('\n  👉 Add to Replit secrets:');
  console.log(`  NFT_COLLECTION_ID = ${COLLECTION_NFT}`);
  console.log('\n  Protocol Genesis is LIVE on Solana mainnet! 🚀\n');
}

main().catch(err => { console.error('Failed:', err.message || err); process.exit(1); });
