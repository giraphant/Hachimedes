const { Connection, PublicKey } = require('@solana/web3.js');
const { borrowPda } = require('@jup-ag/lend');
const { getPositionMint } = borrowPda;

const RPC_URL = 'https://api.mainnet-beta.solana.com';
const VAULT_ID = 34;
const USER_WALLET = '1SAZXLn2nNJ3Qp9y5RnZVq4cLiGj1sH2rvKPDmjCK8B';

/**
 * 优化的方法：不需要枚举所有 position IDs
 * 而是检查用户的每个 token account，看看是否匹配 position mint 的 PDA 模式
 */
async function testOptimizedNFTDiscovery() {
  console.log('Testing Optimized Position NFT Discovery\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const userPublicKey = new PublicKey(USER_WALLET);

  console.log(`Vault ID: ${VAULT_ID}`);
  console.log(`User: ${userPublicKey.toString()}\n`);

  // Step 1: Get all user's token accounts
  console.log('Step 1: Fetching user token accounts...');
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(userPublicKey, {
    programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  });

  console.log(`Found ${tokenAccounts.value.length} token accounts\n`);

  // Step 2: For each token account with balance > 0, check if it's a position NFT
  console.log('Step 2: Checking which are position NFTs...\n');

  const userPositions = [];
  const maxPositionIdToCheck = 1000; // Reasonable upper bound

  for (const tokenAccount of tokenAccounts.value) {
    const mint = tokenAccount.account.data.parsed.info.mint;
    const amount = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;

    // Skip if no balance
    if (amount <= 0) continue;

    // Try to match this mint against position mints for this vault
    // We still need to enumerate position IDs, but only for mints with non-zero balance
    for (let positionId = 0; positionId < maxPositionIdToCheck; positionId++) {
      const positionMint = getPositionMint(VAULT_ID, positionId);

      if (positionMint.toString() === mint) {
        console.log(`✓ Found Position ${positionId}:`);
        console.log(`  Mint: ${mint}`);
        console.log(`  NFT Balance: ${amount}`);
        console.log(`  Token Account: ${tokenAccount.pubkey.toString()}\n`);
        userPositions.push(positionId);
        break; // Found it, move to next token account
      }
    }
  }

  console.log('=== Results ===');
  console.log(`Found ${userPositions.length} positions:`, userPositions);

  if (userPositions.length > 0) {
    console.log('\n✅ Success! You can use these position IDs in the app.');
  } else {
    console.log('\n❌ No positions found.');
  }
}

testOptimizedNFTDiscovery().catch(console.error);
