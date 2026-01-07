// SECURE ACCESS: These variables pull from your Replit Secrets vault
const HELIUS_KEY = import.meta.env.VITE_HELIUS_API_KEY;
const GECKO_KEY = import.meta.env.VITE_COINGECKO_API_KEY;

/** * 1. LIVE PRICE FETCH (BRONZE TIER)
 * Fetches the current SOL price from CoinGecko.
 */
export const getSolanaPrice = async () => {
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd`,
      {
        headers: { 'x-cg-demo-api-key': GECKO_KEY }
      }
    );
    const data = await response.json();
    return data.solana.usd; // Returns the price as a number (e.g., 142.50)
  } catch (error) {
    console.error("CoinGecko Error:", error);
    return "Error";
  }
};

/** * 2. NEW TOKEN PULSE
 * Uses Helius to find the most recent tokens launched on Solana.
 */
export const getLatestTokens = async () => {
  try {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "my-id",
        method: "getAssetByProof", // Basic method to check connectivity
        params: { /* We will refine these params for Raydium pools next */ }
      }),
    });
    return await response.json();
  } catch (error) {
    console.error("Helius Error:", error);
    return null;
  }
};
