import { Connection, PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import { getOperateIx } from '@jup-ag/lend/borrow';
import { createJupiterApiClient } from '@jup-ag/api';
import BN from 'bn.js';

export interface DeleverageSwapParams {
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
 * 构建优化的 Deleverage + Swap 交易（无需 Flash Loan）
 *
 * 正确流程：
 * 1. Withdraw JLP from position（从仓位取出抵押）
 * 2. Swap JLP → USDS
 * 3. Repay debt with USDS（用 Swap 得到的 USDS 还债）
 *
 * 优化策略：
 * - 只使用主 Operate 指令，跳过已存在账户的 init 指令
 * - 使用 Jupiter Swap 优化参数（maxAccounts, useSharedAccounts）
 * - 复用 address lookup tables
 */
export async function buildDeleverageSwapTransactionOptimized(params: DeleverageSwapParams & { skipInitCheck?: boolean }) {
  const {
    withdrawMint,
    withdrawAmount,
    repayMint,
    userPublicKey,
    vaultId,
    positionId,
    connection,
    slippageBps = 50,
    skipInitCheck = false,
  } = params;

  console.log('Building optimized deleverage + swap transaction...');
  console.log('VaultId:', vaultId);
  console.log('PositionId:', positionId);
  console.log('Withdraw Amount:', withdrawAmount, 'JLP');

  try {
    // 转换为链上数量
    const withdrawAmountRaw = Math.floor(withdrawAmount * 1e6);

    // Step 1: 获取取款指令（取出 JLP）
    console.log('Step 1: Getting withdraw instruction...');
    const withdrawResult = await getOperateIx({
      vaultId,
      positionId,
      colAmount: new BN(-withdrawAmountRaw), // 负数 = 取款
      debtAmount: new BN(0),
      connection,
      signer: userPublicKey,
    });

    console.log('Withdraw instructions from SDK:', withdrawResult.ixs.length);
    withdrawResult.ixs.forEach((ix, idx) => {
      console.log(`  Withdraw instruction ${idx}:`, {
        programId: ix.programId.toString(),
        accounts: ix.keys.length,
        dataLength: ix.data.length,
      });
    });

    // 检查是否有 init 指令
    const hasWithdrawInit = withdrawResult.ixs.length > 1;
    const withdrawIxs = withdrawResult.ixs;
    console.log('Withdraw has init instructions:', hasWithdrawInit);

    // Step 2: 获取 Jupiter Swap 指令
    console.log('Step 2: Getting swap quote...');
    const jupiterApi = createJupiterApiClient();

    const quoteResponse = await jupiterApi.quoteGet({
      inputMint: withdrawMint.toString(),
      outputMint: repayMint.toString(),
      amount: withdrawAmountRaw,
      slippageBps,
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
        useSharedAccounts: true,
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
    console.log('Step 3: Getting repay instruction...');
    const repayAmountRaw = parseInt(quoteResponse.outAmount);

    const repayResult = await getOperateIx({
      vaultId,
      positionId,
      colAmount: new BN(0),
      debtAmount: new BN(-repayAmountRaw), // 负数 = 还款
      connection,
      signer: userPublicKey,
    });

    console.log('Repay instructions from SDK:', repayResult.ixs.length);
    repayResult.ixs.forEach((ix, idx) => {
      console.log(`  Repay instruction ${idx}:`, {
        programId: ix.programId.toString(),
        accounts: ix.keys.length,
        dataLength: ix.data.length,
      });
    });

    // 使用所有 Repay 指令（包括必要的 init）
    const repayIxs = repayResult.ixs;
    console.log('Using all repay instructions');

    // Step 4: 组合所有指令（包括必要的 init 指令）
    const allInstructions: TransactionInstruction[] = [
      ...withdrawIxs,      // Withdraw JLP (包含 init)
      ...swapInstructions, // Swap JLP → USDS
      ...repayIxs,         // Repay with USDS (包含 init)
    ];

    console.log('Instruction breakdown:');
    console.log('  Withdraw:', withdrawIxs.length);
    console.log('  Swap:', swapInstructions.length);
    console.log('  Repay:', repayIxs.length);
    console.log('Total instructions:', allInstructions.length);

    // Step 5: 获取 address lookup tables（去重）
    const addressLookupTableAccounts: any[] = [];
    const seenLookupTableKeys = new Set<string>();

    // Withdraw lookup tables
    if (withdrawResult.addressLookupTableAccounts) {
      for (const lut of withdrawResult.addressLookupTableAccounts) {
        const key = lut.key.toString();
        if (!seenLookupTableKeys.has(key)) {
          seenLookupTableKeys.add(key);
          addressLookupTableAccounts.push(lut);
        }
      }
    }

    // Swap lookup tables
    if (addressLookupTableAddresses.length > 0) {
      const swapLookupTables = await Promise.all(
        addressLookupTableAddresses.map(async (address) => {
          const result = await connection.getAddressLookupTable(new PublicKey(address));
          return result.value;
        })
      );

      for (const lut of swapLookupTables) {
        if (lut) {
          const key = lut.key.toString();
          if (!seenLookupTableKeys.has(key)) {
            seenLookupTableKeys.add(key);
            addressLookupTableAccounts.push(lut);
          }
        }
      }
    }

    // Repay lookup tables（可能和 Withdraw 重复）
    if (repayResult.addressLookupTableAccounts) {
      for (const lut of repayResult.addressLookupTableAccounts) {
        const key = lut.key.toString();
        if (!seenLookupTableKeys.has(key)) {
          seenLookupTableKeys.add(key);
          addressLookupTableAccounts.push(lut);
        }
      }
    }

    console.log('Total unique lookup tables:', addressLookupTableAccounts.length);

    // Step 6: 构建 versioned transaction
    const latestBlockhash = await connection.getLatestBlockhash('finalized');

    const messageV0 = new TransactionMessage({
      payerKey: userPublicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: allInstructions,
    }).compileToV0Message(addressLookupTableAccounts);

    const transaction = new VersionedTransaction(messageV0);

    // 检查交易大小
    let serializedTx;
    try {
      serializedTx = transaction.serialize();
      console.log('\n=== Transaction Size ===');
      console.log('Size:', serializedTx.length, 'bytes');
      console.log('Limit: 1232 bytes');
      console.log('Difference:', serializedTx.length - 1232, 'bytes');

      if (serializedTx.length > 1232) {
        console.warn(`⚠️  Transaction size (${serializedTx.length} bytes) exceeds limit by ${serializedTx.length - 1232} bytes`);

        // 打印详细信息帮助调试
        console.warn('\nTransaction breakdown:');
        console.warn('  Instructions:', allInstructions.length);
        console.warn('  Lookup tables:', addressLookupTableAccounts.length);
        console.warn('  Withdraw ixs:', withdrawIxs.length);
        console.warn('  Swap ixs:', swapInstructions.length);
        console.warn('  Repay ixs:', repayIxs.length);

        throw new Error(
          `Transaction too large: ${serializedTx.length} bytes (max 1232). ` +
          `Exceeds limit by ${serializedTx.length - 1232} bytes. ` +
          `This operation requires ${allInstructions.length} instructions which cannot fit in a single transaction.`
        );
      } else {
        console.log('✅ Transaction size is under the limit!');
      }
    } catch (error: any) {
      if (error.message?.includes('encoding overruns')) {
        console.error('\n❌ Transaction too large to serialize');
        console.error('Transaction breakdown:');
        console.error('  Instructions:', allInstructions.length);
        console.error('  Lookup tables:', addressLookupTableAccounts.length);
        console.error('  Withdraw ixs:', withdrawIxs.length);
        console.error('  Swap ixs:', swapInstructions.length);
        console.error('  Repay ixs:', repayIxs.length);

        const initCount = (withdrawIxs.length - 1) + (repayIxs.length - 1);

        throw new Error(
          `交易过大：需要 ${allInstructions.length} 条指令（${initCount} 条初始化 + ${allInstructions.length - initCount} 条主指令），` +
          `超过 Solana 1232 字节限制。\n\n` +
          `💡 解决方案：这个操作需要先初始化新的 Tick/Branch 账户。` +
          `由于 Solana 交易大小限制，无法在单个交易中完成所有操作。\n\n` +
          `建议：\n` +
          `1. 使用官方 Jupiter Lend 界面完成首次操作（会自动初始化账户）\n` +
          `2. 或者先执行一次小额 Withdraw 和 Repay 来初始化账户\n` +
          `3. 初始化后，后续操作将只需 3 条指令，能够顺利执行`
        );
      }
      throw error;
    }

    console.log('Optimized Deleverage + Swap transaction built successfully');

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
    console.error('Error building optimized deleverage + swap transaction:', error);
    throw error;
  }
}
