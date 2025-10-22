import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { getOperateIx } from '@jup-ag/lend/borrow';
import BN from 'bn.js';
import { buildDeleverageSwapMainTransaction } from './deleverage-swap-main-only';

export interface DeleverageSwapTwoStepParams {
  withdrawMint: PublicKey;
  withdrawAmount: number;
  repayMint: PublicKey;
  userPublicKey: PublicKey;
  vaultId: number;
  positionId: number;
  connection: Connection;
  slippageBps?: number;
}

export interface TwoStepResult {
  needsInitialization: boolean;
  initTransaction?: VersionedTransaction;
  initInstructionCount?: number;
  mainTransaction: VersionedTransaction;
  positionId: number;
  swapQuote: {
    inputAmount: string;
    outputAmount: string;
    priceImpactPct: string;
  };
}

/**
 * 智能两步交易构建器
 *
 * 自动检测是否需要初始化账户：
 * - 如果需要：返回初始化交易 + 主交易
 * - 如果不需要：只返回主交易
 */
export async function buildDeleverageSwapTwoStep(
  params: DeleverageSwapTwoStepParams
): Promise<TwoStepResult> {
  const {
    withdrawMint,
    withdrawAmount,
    repayMint,
    userPublicKey,
    vaultId,
    positionId,
    connection,
    slippageBps = 50,
  } = params;

  console.log('\n════════════════════════════════════════');
  console.log('  Smart Two-Step Transaction Builder');
  console.log('════════════════════════════════════════\n');

  try {
    const withdrawAmountRaw = Math.floor(withdrawAmount * 1e6);

    // 辅助函数：延迟
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Step 1: 检测是否需要初始化
    console.log('🔍 Checking if account initialization is needed...\n');

    // 顺序执行，避免 RPC rate limit
    console.log('⏳ Getting withdraw instructions...');
    const withdrawResult = await getOperateIx({
      vaultId,
      positionId,
      colAmount: new BN(-withdrawAmountRaw),
      debtAmount: new BN(0),
      connection,
      signer: userPublicKey,
    });

    await sleep(800); // 延迟 800ms

    console.log('⏳ Getting repay instructions...');
    const repayResult = await getOperateIx({
      vaultId,
      positionId,
      colAmount: new BN(0),
      debtAmount: new BN(-1000), // 小金额用于检测
      connection,
      signer: userPublicKey,
    });

    const withdrawInitCount = withdrawResult.ixs.length - 1;
    const repayInitCount = repayResult.ixs.length - 1;
    const totalInitCount = withdrawInitCount + repayInitCount;

    console.log('Withdraw init instructions:', withdrawInitCount);
    console.log('Repay init instructions:', repayInitCount);
    console.log('Total init instructions needed:', totalInitCount);

    let initTransaction: VersionedTransaction | undefined;

    if (totalInitCount > 0) {
      // 需要初始化
      console.log('\n⚠️  Account initialization required');
      console.log('Building initialization transaction...\n');

      const initInstructions = [
        ...withdrawResult.ixs.slice(0, -1),
        ...repayResult.ixs.slice(0, -1),
      ];

      const addressLookupTableAccounts: any[] = [];
      const seenKeys = new Set<string>();

      for (const lut of [...withdrawResult.addressLookupTableAccounts, ...repayResult.addressLookupTableAccounts]) {
        const key = lut.key.toString();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          addressLookupTableAccounts.push(lut);
        }
      }

      await sleep(800); // 延迟 800ms 避免 RPC rate limit

      const latestBlockhash = await connection.getLatestBlockhash('finalized');

      const { TransactionMessage } = await import('@solana/web3.js');
      const messageV0 = new TransactionMessage({
        payerKey: userPublicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: initInstructions,
      }).compileToV0Message(addressLookupTableAccounts);

      initTransaction = new VersionedTransaction(messageV0);

      console.log('✅ Initialization transaction built');
      console.log('   Instructions:', initInstructions.length);
      console.log('   Size:', initTransaction.serialize().length, 'bytes\n');
    } else {
      console.log('\n✅ All accounts already initialized');
      console.log('   No initialization transaction needed\n');
    }

    // Step 2: 构建主交易（重用已获取的 withdraw 指令）
    console.log('Building main transaction (reusing cached instructions)...\n');

    const mainResult = await buildDeleverageSwapMainTransaction({
      withdrawMint,
      withdrawAmount,
      repayMint,
      userPublicKey,
      vaultId,
      positionId,
      connection,
      slippageBps,
      cachedWithdrawIxs: withdrawResult, // 传递缓存，避免重复 RPC 调用
    });

    console.log('\n════════════════════════════════════════');
    console.log('  Build Complete');
    console.log('════════════════════════════════════════');
    console.log('Needs initialization:', totalInitCount > 0 ? 'YES' : 'NO');
    if (totalInitCount > 0) {
      console.log('Step 1: Execute init transaction (' + totalInitCount + ' instructions)');
      console.log('Step 2: Execute main transaction (3 instructions)');
    } else {
      console.log('Step 1: Execute main transaction (3 instructions)');
    }
    console.log('════════════════════════════════════════\n');

    return {
      needsInitialization: totalInitCount > 0,
      initTransaction,
      initInstructionCount: totalInitCount > 0 ? totalInitCount : undefined,
      mainTransaction: mainResult.transaction,
      positionId: mainResult.positionId,
      swapQuote: mainResult.swapQuote,
    };
  } catch (error) {
    console.error('Error in two-step builder:', error);
    throw error;
  }
}
