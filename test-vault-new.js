const { PublicKey, Connection } = require('@solana/web3.js');

const VAULTS_PROGRAM_ID = new PublicKey('jupr81YtYssSyPt8jbnGuiWon5f6x9TcDEFxYe3Bdzi');
const connection = new Connection('https://leonore-805z4o-fast-mainnet.helius-rpc.com');
const vaultId = 34;

async function testVaultAccounts() {
  console.log('Testing Vault', vaultId, 'with NEW program ID...\n');

  const [vaultState] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_state'), Buffer.from([vaultId & 0xFF, (vaultId >> 8) & 0xFF])],
    VAULTS_PROGRAM_ID
  );

  const [vaultConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_config'), Buffer.from([vaultId & 0xFF, (vaultId >> 8) & 0xFF])],
    VAULTS_PROGRAM_ID
  );

  console.log('VaultState PDA:', vaultState.toString());
  console.log('VaultConfig PDA:', vaultConfig.toString());
  console.log('\nChecking accounts...\n');

  const accounts = [
    { name: 'VaultState', address: vaultState },
    { name: 'VaultConfig', address: vaultConfig },
  ];

  for (const { name, address } of accounts) {
    try {
      const info = await connection.getAccountInfo(address);
      if (info) {
        const owner = info.owner.toString();
        console.log('✅', name + ':', 'EXISTS (' + info.data.length + ' bytes, owner:', owner + ')');
      } else {
        console.log('❌', name + ':', 'NOT FOUND');
      }
    } catch (error) {
      console.log('❌', name + ':', 'ERROR -', error.message);
    }
  }
}

testVaultAccounts().catch(console.error);
