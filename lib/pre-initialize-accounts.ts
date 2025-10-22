import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { getOperateIx } from '@jup-ag/lend/borrow';
import BN from 'bn.js';

export interface PreInitializeParams {
  withdrawMint: PublicKey;
  withdrawAmount: number;
  repayMint: PublicKey;
  userPublicKey: PublicKey;
  vaultId: number;
  positionId: number;
  connection: Connection;
}

/**
 * 预初始化所有需要的账户
 *
 * 在执行 Deleverage + Swap 之前，先初始化：
 * - Withdraw 操作需要的 Tick/TickIdLiquidation 账户
 * - Repay 操作需要的 Tick/Branch/TickIdLiquidation 账户
 *
 * 初始化后，主交易就只需要 3 条主 Operate 指令，能够在 1232 bytes 内完成
 */
export async function buildPreInitializeTransaction(params: PreInitializeParams) {
  const {
    withdrawMint,
    withdrawAmount,
    repayMint,
    userPublicKey,
    vaultId,
    positionId,
    connection,
  } = params;

  console.log('Building pre-initialization transaction...');

  try {
    const withdrawAmountRaw = Math.floor(withdrawAmount * 1e6);

    // 辅助函数：延迟
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // 获取 Withdraw 的所有指令（包括 init）
    const withdrawResult = await getOperateIx({
      vaultId,
      positionId,
      colAmount: new BN(-withdrawAmountRaw),
      debtAmount: new BN(0),
      connection,
      signer: userPublicKey,
    });

    await sleep(800); // 延迟 800ms 避免 RPC rate limit

    // 获取 Repay 的所有指令（包括 init）
    // 使用一个小金额来获取需要初始化的账户
    const repayResult = await getOperateIx({
      vaultId,
      positionId,
      colAmount: new BN(0),
      debtAmount: new BN(-1000), // 小金额，只是为了获取 init 指令
      connection,
      signer: userPublicKey,
    });

    // 收集所有的 init 指令（跳过最后的主 operate 指令）
    const initInstructions = [
      ...withdrawResult.ixs.slice(0, -1), // Withdraw 的 init 指令
      ...repayResult.ixs.slice(0, -1),    // Repay 的 init 指令
    ];

    console.log('Pre-initialization instructions:');
    console.log('  From Withdraw:', withdrawResult.ixs.length - 1);
    console.log('  From Repay:', repayResult.ixs.length - 1);
    console.log('  Total init instructions:', initInstructions.length);

    if (initInstructions.length === 0) {
      return null; // 所有账户都已初始化
    }

    // 获取 lookup tables
    const addressLookupTableAccounts: any[] = [];
    if (withdrawResult.addressLookupTableAccounts) {
      addressLookupTableAccounts.push(...withdrawResult.addressLookupTableAccounts);
    }
    if (repayResult.addressLookupTableAccounts) {
      addressLookupTableAccounts.push(...repayResult.addressLookupTableAccounts);
    }

    await sleep(800); // 延迟 800ms 避免 RPC rate limit

    // 构建 versioned transaction
    const latestBlockhash = await connection.getLatestBlockhash('finalized');

    const messageV0 = new TransactionMessage({
      payerKey: userPublicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: initInstructions,
    }).compileToV0Message(addressLookupTableAccounts);

    const transaction = new VersionedTransaction(messageV0);

    console.log('Pre-initialization transaction built successfully');
    console.log('Please execute this transaction first, then retry the main operation');

    return {
      transaction,
      initCount: initInstructions.length,
    };
  } catch (error) {
    console.error('Error building pre-initialization transaction:', error);
    throw error;
  }
}
