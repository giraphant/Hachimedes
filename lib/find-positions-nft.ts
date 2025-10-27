import { Connection, PublicKey } from '@solana/web3.js';
import { borrowPda } from '@jup-ag/lend';

const { getPositionMint } = borrowPda;

/**
 * 通过查询用户持有的 Position NFTs 来查找 positions
 *
 * 优化策略：
 * 1. 获取用户所有 token accounts (1 次 RPC 调用)
 * 2. 分批搜索 position IDs，优先检查常用范围
 * 3. 支持高位数的 position IDs (最大 100,000)
 *
 * 优势：
 * - 只需要 1 次 RPC 调用获取用户 token accounts
 * - 本地计算 position mints 并匹配，无需额外 RPC
 * - 分批搜索策略：优先找到低位数 positions，避免不必要的枚举
 * - 支持四位数、五位数的 position IDs
 */
export async function findUserPositionsByNFT(
  connection: Connection,
  vaultId: number,
  userPublicKey: PublicKey,
  maxPositionsToCheck: number = 100000, // 提高到 10 万
  onProgress?: (current: number, total: number) => void
): Promise<number[]> {
  console.log(`Searching for position NFTs in vault ${vaultId} for user ${userPublicKey.toString()}...`);

  try {
    // Step 1: 获取用户的所有 token accounts (1 次 RPC 调用)
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(userPublicKey, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    });

    console.log(`Found ${tokenAccounts.value.length} token accounts`);

    // 过滤出有余额的 NFTs
    const nftsToFind = tokenAccounts.value
      .filter((acc) => acc.account.data.parsed.info.tokenAmount.uiAmount > 0)
      .map((acc) => ({
        mint: acc.account.data.parsed.info.mint,
        amount: acc.account.data.parsed.info.tokenAmount.uiAmount,
        tokenAccount: acc.pubkey.toString(),
      }));

    console.log(`Need to find ${nftsToFind.length} position NFTs`);

    if (nftsToFind.length === 0) {
      console.log('No NFTs with balance found');
      return [];
    }

    const userPositions: number[] = [];
    const foundMints = new Set<string>();

    // Step 2: 分批搜索策略
    // 批次定义：优先检查常用范围，然后扩展到更大范围
    const batches = [
      { start: 0, end: 1000, name: '0-1K' },         // 大多数用户在这个范围
      { start: 1000, end: 5000, name: '1K-5K' },     // 四位数范围
      { start: 5000, end: 10000, name: '5K-10K' },   // 高四位数
      { start: 10000, end: maxPositionsToCheck, name: `10K-${maxPositionsToCheck/1000}K` }, // 五位数+
    ];

    for (const batch of batches) {
      if (foundMints.size === nftsToFind.length) {
        console.log('All positions found, stopping search');
        break;
      }

      console.log(`\nSearching batch ${batch.name}...`);

      // 分成更小的块，每 500 个 IDs 让出主线程一次
      const chunkSize = 500;
      let shouldBreakBatch = false;

      for (let chunkStart = batch.start; chunkStart < batch.end; chunkStart += chunkSize) {
        if (shouldBreakBatch) break;

        const chunkEnd = Math.min(chunkStart + chunkSize, batch.end);

        // 让出主线程，允许 UI 更新（加载图标能转）
        await new Promise(resolve => setTimeout(resolve, 0));

        for (let positionId = chunkStart; positionId < chunkEnd; positionId++) {
          const positionMint = getPositionMint(vaultId, positionId);
          const mintStr = positionMint.toString();

          // 检查这个 mint 是否匹配用户持有的 NFT
          const matchedNft = nftsToFind.find((nft) => nft.mint === mintStr);

          if (matchedNft && !foundMints.has(mintStr)) {
            console.log(`✓ Found position ${positionId} (NFT balance: ${matchedNft.amount})`);
            userPositions.push(positionId);
            foundMints.add(mintStr);

            // 如果找到了所有 NFTs，提前退出
            if (foundMints.size === nftsToFind.length) {
              console.log(`All ${nftsToFind.length} positions found!`);
              shouldBreakBatch = true;
              break;
            }
          }

          // 进度回调
          if (onProgress && positionId % 100 === 0) {
            onProgress(positionId, maxPositionsToCheck);
          }
        }
      }

      console.log(`Batch ${batch.name} complete. Found ${foundMints.size}/${nftsToFind.length} positions so far.`);
    }

    // 如果还有未找到的 NFTs，报告一下
    if (foundMints.size < nftsToFind.length) {
      const unfoundNfts = nftsToFind.filter((nft) => !foundMints.has(nft.mint));
      console.warn(`Warning: ${unfoundNfts.length} NFT(s) not found in range 0-${maxPositionsToCheck}`);
      unfoundNfts.forEach((nft) => {
        console.warn(`  Unfound NFT mint: ${nft.mint}`);
      });
    }

    console.log(`\nTotal found: ${userPositions.length} positions:`, userPositions);
    return userPositions.sort((a, b) => a - b);
  } catch (error) {
    console.error('Error finding positions by NFT:', error);
    throw error;
  }
}
