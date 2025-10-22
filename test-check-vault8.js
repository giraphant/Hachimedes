const { Connection } = require('@solana/web3.js');
const { getCurrentVault } = require('@jup-ag/lend/borrow');

const RPC_URL = 'https://api.mainnet-beta.solana.com';

async function checkVault8() {
  const connection = new Connection(RPC_URL, 'confirmed');

  console.log('Checking Vault 8 (JLP/USDC) details...\n');

  try {
    const vaultData = await getCurrentVault({
      vaultId: 8,
      connection,
    });

    console.log('Vault 8 Details:');
    console.log(JSON.stringify(vaultData, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkVault8().catch(console.error);
