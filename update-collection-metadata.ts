import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import { mplTokenMetadata, updateV1, fetchMetadataFromSeeds } from '@metaplex-foundation/mpl-token-metadata';
import bs58 from 'bs58';

const COLLECTION_NFT = 'FfijWgeLocQpCfEFdwQazYSmoeMgmWxMy6p7xt7tRRav';
const IMAGE_URL      = 'https://purple-petite-rooster-763.mypinata.cloud/ipfs/bafybeidb4z3iootvdvys35ls5s72qma6xvakraz3sam2apnoteg3vbrjwy';
const METADATA_URI   = 'https://inku.riker.replit.dev/api/nft/metadata/0';

async function main() {
  const KEYPAIR = process.env.UPDATE_AUTHORITY_KEYPAIR!;
  const RPC     = `https://api.mainnet-beta.solana.com`;

  const raw         = KEYPAIR.trim();
  const secretBytes = raw.startsWith('[')
    ? new Uint8Array(JSON.parse(raw))
    : bs58.decode(raw);

  const umi = createUmi(RPC).use(mplTokenMetadata());
  const updateAuthority = umi.eddsa.createKeypairFromSecretKey(secretBytes);
  umi.use(keypairIdentity(updateAuthority));

  const mint     = umiPublicKey(COLLECTION_NFT);
  const metadata = await fetchMetadataFromSeeds(umi, { mint });

  console.log('Updating collection NFT metadata...');

  await updateV1(umi, {
    mint,
    authority: umi.identity,
    data: {
      ...metadata,
      name:   'ProtocolHub Genesis (PGEN)',
      symbol: 'PGEN',
      uri:    METADATA_URI,
      sellerFeeBasisPoints: 600,
    },
  }).sendAndConfirm(umi, { confirm: { commitment: 'finalized' } });

  console.log('✅ Collection NFT metadata updated!');
  console.log('   Image will show on Solscan within ~30 minutes');
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
