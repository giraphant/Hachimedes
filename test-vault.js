const { PublicKey, Connection } = require('@solana/web3.js');
const { Program } = require('@coral-xyz/anchor');

const VAULTS_PROGRAM_ID = new PublicKey('Ho32sUQ4NzuAQgkPkHuNDG3G18rgHmYtXFA8EBmqQrAu');
const connection = new Connection('https://leonore-805z4o-fast-mainnet.helius-rpc.com');
const vaultId = 34;

async function testVaultAccounts() {
  console.log('Testing Vault', vaultId, 'accounts...\n');

  // Derive PDAs
  const [vaultState] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_state'), Buffer.from([vaultId & 0xFF, (vaultId >> 8) & 0xFF])],
    VAULTS_PROGRAM_ID
  );

  const [vaultConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_config'), Buffer.from([vaultId & 0xFF, (vaultId >> 8) & 0xFF])],
    VAULTS_PROGRAM_ID
  );

  const [vaultMetadata] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_metadata'), Buffer.from([vaultId & 0xFF, (vaultId >> 8) & 0xFF])],
    VAULTS_PROGRAM_ID
  );

  console.log('VaultState PDA:', vaultState.toString());
  console.log('VaultConfig PDA:', vaultConfig.toString());
  console.log('VaultMetadata PDA:', vaultMetadata.toString());
  console.log('\nChecking accounts...\n');

  // Check each account
  const accounts = [
    { name: 'VaultState', address: vaultState },
    { name: 'VaultConfig', address: vaultConfig },
    { name: 'VaultMetadata', address: vaultMetadata },
  ];

  for (const { name, address } of accounts) {
    try {
      const info = await connection.getAccountInfo(address);
      if (info) {
        console.log(`✅ ${name}: EXISTS (${info.data.length} bytes)`);
      } else {
        console.log(`❌ ${name}: NOT FOUND`);
      }
    } catch (error) {
      console.log(`❌ ${name}: ERROR -`, error.message);
    }
  }
}

testVaultAccounts().catch(console.error);
