import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { keypairIdentity, publicKey } from "@metaplex-foundation/umi";
import { updateV1, fetchMetadataFromSeeds, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";

async function main() {
  const umi = createUmi("https://api.mainnet-beta.solana.com");
  const keypairBytes = JSON.parse(process.env.UPDATE_AUTHORITY_KEYPAIR || "[]");
  const kp = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(keypairBytes));
  umi.use(keypairIdentity(kp));
  umi.use(mplTokenMetadata());
  const mint = publicKey("FfijWgeLocQpCfEFdwQazYSmoeMgmWxMy6p7xt7tRRav");
  const metadata = await fetchMetadataFromSeeds(umi, { mint });
  await updateV1(umi, {
    mint, authority: umi.identity,
    data: { ...metadata, uri: "https://protocolhub.site/api/nft/metadata/0" },
  }).sendAndConfirm(umi);
  console.log("Done!");
}
main().catch(console.error);
