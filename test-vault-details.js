const { Connection, PublicKey } = require('@solana/web3.js');
const { borrowPda } = require('@jup-ag/lend');

const RPC_URL = 'https://api.mainnet-beta.solana.com';

// Token mint addresses
const TOKENS = {
  JLP: '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4',
  USDS: 'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDG: 'USDGVfE1c1bZ7DCs2u68HvdcTXMBQMG5obcbZxRPpipv', // Hypothetical
  SOL: 'So11111111111111111111111111111111111111112',
};

/**
 * 查询特定 vault 的详细信息
 */
async function getVaultDetails(vaultIds) {
  const connection = new Connection(RPC_URL, 'confirmed');

  for (const vaultId of vaultIds) {
    try {
      console.log(`\n=== Vault ${vaultId} ===`);

      const vaultConfigPda = borrowPda.getVaultConfig(vaultId);
      console.log(`Config PDA: ${vaultConfigPda.toString()}`);

      // 获取 vault config account
      const configAccount = await connection.getAccountInfo(vaultConfigPda);

      if (!configAccount) {
        console.log(`❌ Vault ${vaultId} config not found`);
        continue;
      }

      console.log(`Data length: ${configAccount.data.length} bytes`);
      console.log(`Owner: ${configAccount.owner.toString()}`);

      // 解析前几个字节看能否推断出代币地址
      // Vault config 通常包含 collateral mint 和 debt mint
      const data = configAccount.data;

      // 尝试查找已知的 token mint addresses
      const dataStr = data.toString('hex');

      for (const [symbol, mint] of Object.entries(TOKENS)) {
        const mintHex = Buffer.from(new PublicKey(mint).toBytes()).toString('hex');
        if (dataStr.includes(mintHex)) {
          console.log(`✓ Found ${symbol} (${mint})`);
        }
      }

      // 等待一下避免 rate limit
      await new Promise(resolve => setTimeout(resolve, 300));

    } catch (error) {
      console.error(`Error getting vault ${vaultId}:`, error.message);
    }
  }
}

// 查询 vault 34 附近的 vaults (可能是类似配置的)
const vaultsToCheck = [
  34, // JLP/USDS (已知)
  35, // 可能是 JLP/USDC?
  36, // 可能是 JLP/USDG?
  37,
  38,
  39,
  40,
];

getVaultDetails(vaultsToCheck).catch(console.error);
