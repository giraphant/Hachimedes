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
    const program = getVaultsProgram(connection);

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
      // position ID 存储在 account data 中
      return pos.account.id; // 假设字段名为 id
    });

    console.log(`Position IDs:`, userPositions);
    return userPositions.sort((a, b) => a - b);
  } catch (error) {
    console.error('Error finding positions:', error);
    console.error('Error details:', error);
    return [];
  }
}

/**
 * 快速检查单个 position 是否属于用户
 */
export async function checkPositionOwnership(
  connection: Connection,
  vaultId: number,
  positionId: number,
  userPublicKey: PublicKey
): Promise<boolean> {
  try {
    const owner = await getAccountOwner({
      vaultId,
      positionId,
      connection,
    });

    return owner.equals(userPublicKey);
  } catch {
    return false;
  }
}
