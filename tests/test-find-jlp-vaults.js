const { Connection, PublicKey } = require('@solana/web3.js');
const { borrowPda } = require('@jup-ag/lend');

const RPC_URL = 'https://api.mainnet-beta.solana.com';

// Token mint addresses
const TOKENS = {
  JLP: '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4',
  USDS: 'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  pyUSD: '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo',
  SOL: 'So11111111111111111111111111111111111111112',
};

/**
 * 查找包含 JLP 和特定债务代币的 vaults
 */
async function findJLPVaults() {
  const connection = new Connection(RPC_URL, 'confirmed');

  console.log('Searching for JLP vaults...\n');

  const jlpMintHex = Buffer.from(new PublicKey(TOKENS.JLP).toBytes()).toString('hex');
  const usdcMintHex = Buffer.from(new PublicKey(TOKENS.USDC).toBytes()).toString('hex');

  // 检查前 50 个 vaults
  for (let vaultId = 1; vaultId <= 50; vaultId++) {
    try {
      const vaultConfigPda = borrowPda.getVaultConfig(vaultId);
      const configAccount = await connection.getAccountInfo(vaultConfigPda);

      if (!configAccount) continue;

      const dataHex = configAccount.data.toString('hex');

      // 检查是否包含 JLP 和其他代币
      const hasJLP = dataHex.includes(jlpMintHex);
      const hasUSDC = dataHex.includes(usdcMintHex);

      // 查找所有匹配的代币
      const foundTokens = [];
      for (const [symbol, mint] of Object.entries(TOKENS)) {
        const mintHex = Buffer.from(new PublicKey(mint).toBytes()).toString('hex');
        if (dataHex.includes(mintHex)) {
          foundTokens.push(symbol);
        }
      }

      if (foundTokens.length > 0) {
        console.log(`Vault ${vaultId}: ${foundTokens.join(' + ')}`);
      }

      if (hasJLP && hasUSDC) {
        console.log(`  🎯 Found JLP/USDC vault!`);
      }

      // 延迟避免 rate limit
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error) {
      // Skip
    }
  }
}

findJLPVaults().catch(console.error);
