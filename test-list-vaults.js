const { Connection } = require('@solana/web3.js');
const { borrowPda } = require('@jup-ag/lend');

const RPC_URL = 'https://api.mainnet-beta.solana.com';

/**
 * 列出 Jupiter Lend 上的所有 vaults
 */
async function listVaults() {
  console.log('Querying Jupiter Lend Vaults...\n');

  const connection = new Connection(RPC_URL, 'confirmed');

  // Jupiter Lend 的 vaults 通常从 0 开始编号
  // 我们检查前 100 个 vault IDs
  const maxVaultId = 100;

  const vaults = [];

  for (let vaultId = 0; vaultId < maxVaultId; vaultId++) {
    try {
      const vaultStatePda = borrowPda.getVaultState(vaultId);
      const vaultConfigPda = borrowPda.getVaultConfig(vaultId);

      // 尝试获取 vault state account
      const vaultStateAccount = await connection.getAccountInfo(vaultStatePda);

      if (vaultStateAccount) {
        // Vault 存在，获取配置
        const vaultConfigAccount = await connection.getAccountInfo(vaultConfigPda);

        vaults.push({
          id: vaultId,
          statePda: vaultStatePda.toString(),
          configPda: vaultConfigPda.toString(),
          stateDataLength: vaultStateAccount.data.length,
          configDataLength: vaultConfigAccount?.data.length || 0,
        });

        console.log(`✓ Vault ${vaultId}:`);
        console.log(`  State PDA: ${vaultStatePda.toString()}`);
        console.log(`  Config PDA: ${vaultConfigPda.toString()}`);
        console.log(`  State Data: ${vaultStateAccount.data.length} bytes`);
        console.log();
      }
    } catch (error) {
      // Vault 不存在或出错，跳过
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Found ${vaults.length} active vaults`);
  console.log('Vault IDs:', vaults.map(v => v.id).join(', '));

  return vaults;
}

listVaults().catch(console.error);
