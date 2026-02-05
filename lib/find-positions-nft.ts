import { Connection, PublicKey } from '@solana/web3.js';
import { borrowPda } from '@jup-ag/lend';

const { getPositionMint } = borrowPda;

/**
 * 通过查询用户持有的 Position NFTs 来查找 positions
 *
 * 优化策略：
 * 1. 获取用户所有 token accounts (1 次 RPC 调用)
 * 2. 分批搜索 position IDs，优先检查常用范围
 * 3. 一个账户在一个 vault 只有一个 position，找到就停止
 *
 * 优势：
 * - 只需要 1 次 RPC 调用获取用户 token accounts
 * - 本地计算 position mints 并匹配，无需额外 RPC
 * - 分批搜索策略：优先找到低位数 positions，避免不必要的枚举
 * - 找到第一个 position 立即停止（一个 vault 只有一个 position）
 */
export async function findUserPositionsByNFT(
  connection: Connection,
  vaultId: number,
  userPublicKey: PublicKey,
  maxPositionsToCheck: number = 1000,
  onProgress?: (current: number, total: number) => void
): Promise<number[]> {
  console.log(`Searching for position NFT in vault ${vaultId} for user ${userPublicKey.toString().slice(0, 8)}...`);

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

    console.log(`User has ${nftsToFind.length} NFT(s) with balance`);

    if (nftsToFind.length === 0) {
      console.log('No NFTs with balance found');
      return [];
    }

    const userPositions: number[] = [];

    // Step 2: 分层搜索策略
    // 先查 0-100（大部分 position 都在这个范围），查不到再扩到 100-1000
    const batches = [
      { start: 0, end: 100, name: '0-100' },
      { start: 100, end: Math.min(1000, maxPositionsToCheck), name: '100-1K' },
    ];

    for (const batch of batches) {
      // 🎯 一个账户在一个 vault 只有一个 position，找到就停止
      if (userPositions.length > 0) {
        console.log('✓ Position found, stopping search');
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

          if (matchedNft) {
            console.log(`✓ Found position ${positionId} for this vault!`);
            userPositions.push(positionId);
            // 🎯 一个 vault 只有一个 position，找到就退出
            shouldBreakBatch = true;
            break;
          }

          // 进度回调
          if (onProgress && positionId % 100 === 0) {
            onProgress(positionId, maxPositionsToCheck);
          }
        }
      }

      if (shouldBreakBatch) {
        console.log(`✓ Batch ${batch.name} complete - position found!`);
        break;
      } else {
        console.log(`✗ Batch ${batch.name} complete - no position found, continuing...`);
      }
    }

    if (userPositions.length === 0) {
      console.log(`\n✗ No position found for vault ${vaultId} in range 0-${maxPositionsToCheck}`);
    } else {
      console.log(`\n✓ Found position: ${userPositions[0]}`);
    }

    return userPositions;
  } catch (error) {
    console.error('Error finding positions by NFT:', error);
    throw error;
  }
}
