import { Connection, PublicKey } from '@solana/web3.js';
import { getVaultsProgram } from '@jup-ag/lend/borrow';

/**
 * 查找用户在指定 vault 的所有 positions
 * 使用 getProgramAccounts 直接查询 position accounts
 */
export async function findUserPositions(
  connection: Connection,
  vaultId: number,
  userPublicKey: PublicKey
): Promise<number[]> {
  console.log(`Searching for positions in vault ${vaultId} for user ${userPublicKey.toString()}...`);

  try {
    const program = getVaultsProgram({ connection, signer: userPublicKey });

    // 使用 getProgramAccounts 查询所有 position accounts
    // 过滤条件：vault_id 匹配 + owner 匹配
    const positions = await program.account.position.all([
      {
        memcmp: {
          offset: 8, // 跳过 8 字节的 discriminator
          bytes: userPublicKey.toBase58(), // owner 字段
        },
      },
      {
        memcmp: {
          offset: 8 + 32, // discriminator (8) + owner (32)
          bytes: Buffer.from([vaultId]).toString('base64'), // vault_id 字段 (假设是 u8)
        },
      },
    ]);

    console.log(`Found ${positions.length} positions`);

    // 从 position accounts 中提取 position IDs
    const userPositions = positions.map((pos) => {
      // position ID 存储在 account data 中的 nftId 字段
      return pos.account.nftId;
    });

    console.log(`Position IDs:`, userPositions);
    return userPositions.sort((a, b) => a - b);
  } catch (error) {
    console.error('Error finding positions:', error);
    console.error('Error details:', error);
    return [];
  }
}

// checkPositionOwnership function removed - not used anywhere in the codebase
