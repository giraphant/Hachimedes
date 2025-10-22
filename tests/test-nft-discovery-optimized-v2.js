const { Connection, PublicKey } = require('@solana/web3.js');
const { borrowPda } = require('@jup-ag/lend');

const RPC_URL = 'https://api.mainnet-beta.solana.com';
const VAULT_ID = 34;
const USER_WALLET = '1SAZXLn2nNJ3Qp9y5RnZVq4cLiGj1sH2rvKPDmjCK8B';

const { getPositionMint } = borrowPda;

/**
 * 测试优化后的 NFT 发现功能
 * 支持四位数、五位数的 position IDs
 */
async function testOptimizedNFTDiscovery() {
  console.log('Testing Optimized Position NFT Discovery (支持四位数 Position ID)\n');
  console.time('Total search time');

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

  // Filter NFTs with balance
  const nftsToFind = tokenAccounts.value
    .filter((acc) => acc.account.data.parsed.info.tokenAmount.uiAmount > 0)
    .map((acc) => ({
      mint: acc.account.data.parsed.info.mint,
      amount: acc.account.data.parsed.info.tokenAmount.uiAmount,
    }));

  console.log(`Need to find ${nftsToFind.length} position NFTs\n`);

  if (nftsToFind.length === 0) {
    console.log('No NFTs with balance found');
    return;
  }

  // Step 2: Batch search strategy
  const userPositions = [];
  const foundMints = new Set();

  const batches = [
    { start: 0, end: 1000, name: '0-1K' },
    { start: 1000, end: 5000, name: '1K-5K' },
    { start: 5000, end: 10000, name: '5K-10K' },
    { start: 10000, end: 100000, name: '10K-100K' },
  ];

  for (const batch of batches) {
    if (foundMints.size === nftsToFind.length) {
      console.log('\n✅ All positions found, stopping search\n');
      break;
    }

    console.log(`\n🔍 Searching batch ${batch.name}...`);
    console.time(`  Batch ${batch.name}`);

    for (let positionId = batch.start; positionId < batch.end; positionId++) {
      const positionMint = getPositionMint(VAULT_ID, positionId);
      const mintStr = positionMint.toString();

      const matchedNft = nftsToFind.find((nft) => nft.mint === mintStr);

      if (matchedNft && !foundMints.has(mintStr)) {
        console.log(`  ✓ Position ${positionId}:`);
        console.log(`    Mint: ${mintStr}`);
        console.log(`    NFT Balance: ${matchedNft.amount}`);
        userPositions.push(positionId);
        foundMints.add(mintStr);

        if (foundMints.size === nftsToFind.length) {
          console.log(`\n  🎯 All ${nftsToFind.length} positions found!`);
          break;
        }
      }
    }

    console.timeEnd(`  Batch ${batch.name}`);
    console.log(`  Progress: ${foundMints.size}/${nftsToFind.length} found`);
  }

  console.timeEnd('Total search time');

  console.log('\n=== Results ===');
  console.log(`Found ${userPositions.length} positions:`, userPositions);

  if (foundMints.size < nftsToFind.length) {
    console.log('\n⚠️  Warning: Some NFTs not found in range 0-100,000');
  } else {
    console.log('\n✅ Success! All positions found.');
  }
}

testOptimizedNFTDiscovery().catch(console.error);
