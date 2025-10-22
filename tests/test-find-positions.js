const { Connection, PublicKey } = require('@solana/web3.js');
const { getCurrentPosition, getAccountOwner } = require('@jup-ag/lend/borrow');

const RPC_URL = 'https://api.mainnet-beta.solana.com';
const VAULT_ID = 34;
const USER_WALLET = 'YOUR_WALLET_HERE'; // Replace with actual wallet

async function testFindPositions() {
  console.log('Testing position finding logic...\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const userPublicKey = new PublicKey(USER_WALLET);

  console.log(`Vault ID: ${VAULT_ID}`);
  console.log(`User: ${userPublicKey.toString()}\n`);

  // Test a few position IDs
  const testPositionIds = [0, 1, 2, 335, 336, 337];

  console.log('Testing position IDs:', testPositionIds.join(', '));
  console.log('---');

  for (const positionId of testPositionIds) {
    try {
      console.log(`\nPosition ${positionId}:`);

      // Try to get position data
      const positionData = await getCurrentPosition({
        vaultId: VAULT_ID,
        positionId,
        connection,
      });

      console.log('  ✅ Position exists');
      console.log('  Collateral:', positionData.collateralAmountUi);
      console.log('  Debt:', positionData.debtAmountUi);

      // Check owner
      const owner = await getAccountOwner({
        vaultId: VAULT_ID,
        positionId,
        connection,
      });

      console.log('  Owner:', owner.toString());

      if (owner.equals(userPublicKey)) {
        console.log('  🎯 THIS IS YOUR POSITION!');
      }

    } catch (error) {
      console.log('  ❌ Position does not exist or error:', error.message);
    }
  }
}

testFindPositions().catch(console.error);
