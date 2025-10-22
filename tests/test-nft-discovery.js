const { Connection, PublicKey } = require('@solana/web3.js');
const { borrowPda } = require('@jup-ag/lend');
const { getPositionMint } = borrowPda;

const RPC_URL = 'https://api.mainnet-beta.solana.com';
const VAULT_ID = 34;
const USER_WALLET = '1SAZXLn2nNJ3Qp9y5RnZVq4cLiGj1sH2rvKPDmjCK8B';

async function testNFTDiscovery() {
  console.log('Testing Position NFT Discovery\n');

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

  // Step 2: Check which position IDs the user holds
  console.log('Step 2: Checking for position NFTs (0-500)...\n');

  const userPositions = [];
  const maxToCheck = 500; // Check first 500 positions

  for (let positionId = 0; positionId < maxToCheck; positionId++) {
    // Calculate the expected position mint PDA
    const positionMint = getPositionMint(VAULT_ID, positionId);

    // Check if user has a token account for this mint
    const tokenAccount = tokenAccounts.value.find(
      (acc) => acc.account.data.parsed.info.mint === positionMint.toString()
    );

    if (tokenAccount) {
      const amount = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;
      if (amount > 0) {
        console.log(`✓ Position ${positionId}:`);
        console.log(`  Mint: ${positionMint.toString()}`);
        console.log(`  NFT Balance: ${amount}`);
        console.log(`  Token Account: ${tokenAccount.pubkey.toString()}\n`);
        userPositions.push(positionId);
      }
    }

    // Progress indicator every 100 positions
    if ((positionId + 1) % 100 === 0) {
      console.log(`Checked ${positionId + 1} positions...`);
    }
  }

  console.log('\n=== Results ===');
  console.log(`Found ${userPositions.length} positions:`, userPositions);

  if (userPositions.length > 0) {
    console.log('\n✅ Success! You can use these position IDs in the app.');
  } else {
    console.log('\n❌ No positions found. Either:');
    console.log('   1. You don\'t have any positions in this vault');
    console.log('   2. Your position ID is > 500 (increase maxToCheck)');
  }
}

testNFTDiscovery().catch(console.error);
