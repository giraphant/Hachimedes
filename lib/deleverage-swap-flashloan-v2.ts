import { Connection, PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import { getFlashBorrowIx, getFlashPaybackIx } from '@jup-ag/lend/flashloan';
import { getOperateIx } from '@jup-ag/lend/borrow';
import { createJupiterApiClient } from '@jup-ag/api';
import BN from 'bn.js';

export interface DeleverageSwapFlashloanParams {
  withdrawMint: PublicKey; // JLP
  withdrawAmount: number; // 要取出的 JLP 数量（原始值，带小数）
  repayMint: PublicKey; // USDS
  userPublicKey: PublicKey;
  vaultId: number;
  positionId: number;
  connection: Connection;
  slippageBps?: number;
}

/**
 * 使用 Flash Loan 构建 Deleverage + Swap 交易 (优化版)
 *
 * 尝试的优化策略：
 * 1. 只使用 Operate 指令中的主指令（跳过预处理指令）
 * 2. 使用最小化的 Swap 参数
 * 3. 尽可能复用 address lookup tables
 */
export async function buildDeleverageSwapFlashloanTransactionV2(params: DeleverageSwapFlashloanParams) {
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

  console.log('Building optimized flash loan deleverage + swap transaction...');
  console.log('VaultId:', vaultId);
  console.log('PositionId:', positionId);
  console.log('Withdraw Amount:', withdrawAmount, 'JLP');

  try {
    // 转换为链上数量
    const withdrawAmountRaw = Math.floor(withdrawAmount * 1e6);

    // Step 1: 获取闪电贷借款指令
    console.log('Step 1: Getting flash borrow instruction...');
    const flashBorrowIx = await getFlashBorrowIx({
      amount: new BN(withdrawAmountRaw),
      asset: withdrawMint,
      signer: userPublicKey,
      connection,
    });

    // Step 2: 获取 Jupiter Swap 指令（尝试最小化参数）
    console.log('Step 2: Getting minimal swap quote...');
    const jupiterApi = createJupiterApiClient();

    const quoteResponse = await jupiterApi.quoteGet({
      inputMint: withdrawMint.toString(),
      outputMint: repayMint.toString(),
      amount: withdrawAmountRaw,
      slippageBps,
      // 尝试更紧凑的参数
      onlyDirectRoutes: false,
      maxAccounts: 20, // 限制最大账户数
    });

    if (!quoteResponse) {
      throw new Error('Failed to get swap quote from Jupiter');
    }

    console.log('Quote received:', {
      inputAmount: quoteResponse.inAmount,
      outputAmount: quoteResponse.outAmount,
      priceImpactPct: quoteResponse.priceImpactPct,
    });

    const swapResult = await jupiterApi.swapInstructionsPost({
      swapRequest: {
        quoteResponse,
        userPublicKey: userPublicKey.toString(),
        wrapAndUnwrapSol: true,
        // 不使用动态compute unit
        useSharedAccounts: true, // 尝试使用共享账户
      },
    });

    const {
      setupInstructions = [],
      swapInstruction,
      cleanupInstruction,
      addressLookupTableAddresses = [],
    } = swapResult;

    if (!swapInstruction) {
      throw new Error('No swap instruction returned from Jupiter');
    }

    const deserializeInstruction = (instructionData: any): TransactionInstruction => {
      return new TransactionInstruction({
        programId: new PublicKey(instructionData.programId),
        keys: instructionData.accounts.map((key: any) => ({
          pubkey: new PublicKey(key.pubkey),
          isSigner: key.isSigner,
          isWritable: key.isWritable,
        })),
        data: Buffer.from(instructionData.data, 'base64'),
      });
    };

    const swapInstructions: TransactionInstruction[] = [
      ...setupInstructions.map(deserializeInstruction),
      deserializeInstruction(swapInstruction),
    ];

    if (cleanupInstruction) {
      swapInstructions.push(deserializeInstruction(cleanupInstruction));
    }

    console.log('Swap instructions:', swapInstructions.length);

    // Step 3: 获取还款指令
    // 重要优化：对于已存在的 Position，SDK 返回的 ixs 包括：
    // - initPositionIx: null（position 已存在）
    // - otherIxs: [initTick, initBranch等] - 这些在 position 已存在时不需要！
    // - operateIx: 主操作指令（这是我们唯一需要的）
    console.log('Step 3: Getting repay instruction...');
    const repayAmountRaw = parseInt(quoteResponse.outAmount);

    const repayResult = await getOperateIx({
      vaultId,
      positionId,
      colAmount: new BN(0),
      debtAmount: new BN(-repayAmountRaw),
      connection,
      signer: userPublicKey,
    });

    console.log('Repay instructions from SDK:', repayResult.ixs.length);

    // 打印每条指令的详细信息
    repayResult.ixs.forEach((ix, idx) => {
      console.log(`  Instruction ${idx}:`, {
        programId: ix.programId.toString(),
        accounts: ix.keys.length,
        dataLength: ix.data.length,
      });
    });

    // 使用所有指令（包括必要的 init 指令）
    // 注意：还款后 position tick 会改变，新 tick 可能需要初始化
    const repayIxs = repayResult.ixs;

    console.log('Using all repay instructions (including necessary inits)');

    // Step 4: 获取闪电贷还款指令
    console.log('Step 4: Getting flash payback instruction...');
    const flashPaybackIx = await getFlashPaybackIx({
      amount: new BN(withdrawAmountRaw),
      asset: withdrawMint,
      signer: userPublicKey,
      connection,
    });

    // Step 5: 组合所有指令（只使用主要指令）
    const allInstructions: TransactionInstruction[] = [
      flashBorrowIx,
      ...swapInstructions,
      ...repayIxs, // 只使用主指令
      flashPaybackIx,
    ];

    console.log('Instruction breakdown:');
    console.log('  FlashBorrow: 1');
    console.log('  Swap:', swapInstructions.length);
    console.log('  Repay:', repayIxs.length);
    console.log('  FlashPayback: 1');
    console.log('Total instructions:', allInstructions.length);

    // Step 6: 获取 address lookup tables
    const addressLookupTableAccounts: any[] = [];

    if (addressLookupTableAddresses.length > 0) {
      const swapLookupTables = await Promise.all(
        addressLookupTableAddresses.map(async (address) => {
          const result = await connection.getAddressLookupTable(new PublicKey(address));
          return result.value;
        })
      );

      const validSwapLuts = swapLookupTables.filter((lut): lut is any => lut !== null);
      console.log('Swap lookup tables:', validSwapLuts.length);

      addressLookupTableAccounts.push(...validSwapLuts);
    }

    // 如果有 Repay 的 lookup tables，也添加进去
    if (repayResult.addressLookupTableAccounts && repayResult.addressLookupTableAccounts.length > 0) {
      addressLookupTableAccounts.push(...repayResult.addressLookupTableAccounts);
    }

    console.log('Total lookup tables:', addressLookupTableAccounts.length);

    // Step 7: 构建 versioned transaction
    const latestBlockhash = await connection.getLatestBlockhash('finalized');

    const messageV0 = new TransactionMessage({
      payerKey: userPublicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: allInstructions,
    }).compileToV0Message(addressLookupTableAccounts);

    const transaction = new VersionedTransaction(messageV0);

    // 检查交易大小
    const serializedTx = transaction.serialize();
    console.log('\n=== Transaction Size ===');
    console.log('Size:', serializedTx.length, 'bytes');
    console.log('Limit: 1232 bytes');
    console.log('Difference:', serializedTx.length - 1232, 'bytes');

    if (serializedTx.length > 1232) {
      console.warn(`⚠️  Transaction size (${serializedTx.length} bytes) exceeds limit by ${serializedTx.length - 1232} bytes`);
    } else {
      console.log('✅ Transaction size is under the limit!');
    }

    console.log('Optimized flash loan deleverage + swap transaction built successfully');

    return {
      transaction,
      positionId: positionId,
      swapQuote: {
        inputAmount: quoteResponse.inAmount,
        outputAmount: quoteResponse.outAmount,
        priceImpactPct: quoteResponse.priceImpactPct,
      },
    };
  } catch (error) {
    console.error('Error building optimized flash loan deleverage + swap transaction:', error);
    throw error;
  }
}
