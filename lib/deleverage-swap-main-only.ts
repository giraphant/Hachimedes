import { Connection, PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import { getOperateIx } from '@jup-ag/lend/borrow';
import { createJupiterApiClient } from '@jup-ag/api';
import BN from 'bn.js';

export interface DeleverageSwapParams {
  withdrawMint: PublicKey;
  withdrawAmount: number;
  repayMint: PublicKey;
  userPublicKey: PublicKey;
  vaultId: number;
  positionId: number;
  connection: Connection;
  slippageBps?: number;
  // 可选：预获取的 withdraw 指令，避免重复 RPC 调用
  cachedWithdrawIxs?: any;
}

/**
 * 构建 Deleverage + Swap 主交易（只用主 Operate 指令）
 *
 * 注意：此函数假设所有账户已初始化
 * 如果账户未初始化，需要先调用 buildPreInitializeTransaction
 */
export async function buildDeleverageSwapMainTransaction(params: DeleverageSwapParams) {
  const {
    withdrawMint,
    withdrawAmount,
    repayMint,
    userPublicKey,
    vaultId,
    positionId,
    connection,
    slippageBps = 50,
    cachedWithdrawIxs,
  } = params;

  console.log('\n=== Building Main Transaction (Accounts Pre-initialized) ===');
  console.log('VaultId:', vaultId);
  console.log('PositionId:', positionId);
  console.log('Withdraw Amount:', withdrawAmount);

  try {
    const withdrawAmountRaw = Math.floor(withdrawAmount * 1e6);

    // 辅助函数：延迟
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Step 1: Withdraw - 使用缓存或重新获取
    let withdrawResult;
    if (cachedWithdrawIxs) {
      console.log('Step 1: Using cached withdraw instructions...');
      withdrawResult = cachedWithdrawIxs;
    } else {
      console.log('Step 1: Getting withdraw instruction...');
      withdrawResult = await getOperateIx({
        vaultId,
        positionId,
        colAmount: new BN(-withdrawAmountRaw),
        debtAmount: new BN(0),
        connection,
        signer: userPublicKey,
      });
      await sleep(800); // 只在重新获取时延迟
    }

    const withdrawMainIx = withdrawResult.ixs[withdrawResult.ixs.length - 1];
    console.log('Withdraw: using last instruction only (', withdrawResult.ixs.length - 1, 'init instructions skipped)');

    // Step 2: Jupiter Swap
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

    console.log('Quote:', {
      in: quoteResponse.inAmount,
      out: quoteResponse.outAmount,
      impact: quoteResponse.priceImpactPct,
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

    await sleep(800); // 延迟 800ms 避免 RPC rate limit

    // Step 3: Repay - 只用最后一条指令
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

    const repayMainIx = repayResult.ixs[repayResult.ixs.length - 1];
    console.log('Repay: using last instruction only (', repayResult.ixs.length - 1, 'init instructions skipped)');

    // Step 4: 组合指令（只用主指令）
    const allInstructions: TransactionInstruction[] = [
      withdrawMainIx,      // 1 条
      ...swapInstructions, // 1 条
      repayMainIx,         // 1 条
    ];

    console.log('\n=== Main Transaction Instructions ===');
    console.log('  Withdraw:', 1);
    console.log('  Swap:', swapInstructions.length);
    console.log('  Repay:', 1);
    console.log('  Total:', allInstructions.length);

    // Step 5: 获取 lookup tables（去重）
    const addressLookupTableAccounts: any[] = [];
    const seenLookupTableKeys = new Set<string>();

    if (withdrawResult.addressLookupTableAccounts) {
      for (const lut of withdrawResult.addressLookupTableAccounts) {
        const key = lut.key.toString();
        if (!seenLookupTableKeys.has(key)) {
          seenLookupTableKeys.add(key);
          addressLookupTableAccounts.push(lut);
        }
      }
    }

    if (addressLookupTableAddresses.length > 0) {
      // 顺序获取 lookup tables，避免 RPC rate limit
      for (const address of addressLookupTableAddresses) {
        const result = await connection.getAddressLookupTable(new PublicKey(address));
        const lut = result.value;

        if (lut) {
          const key = lut.key.toString();
          if (!seenLookupTableKeys.has(key)) {
            seenLookupTableKeys.add(key);
            addressLookupTableAccounts.push(lut);
          }
        }

        await sleep(500); // 每个 lookup table 之间延迟 500ms
      }
    }

    if (repayResult.addressLookupTableAccounts) {
      for (const lut of repayResult.addressLookupTableAccounts) {
        const key = lut.key.toString();
        if (!seenLookupTableKeys.has(key)) {
          seenLookupTableKeys.add(key);
          addressLookupTableAccounts.push(lut);
        }
      }
    }

    console.log('Unique lookup tables:', addressLookupTableAccounts.length);

    await sleep(800); // 延迟 800ms 避免 RPC rate limit

    // Step 6: 构建 versioned transaction
    const latestBlockhash = await connection.getLatestBlockhash('finalized');

    // 在序列化前打印详细信息
    console.log('\n=== Pre-Serialization Check ===');
    console.log('Total instructions:', allInstructions.length);
    console.log('Instruction breakdown:');
    allInstructions.forEach((ix, i) => {
      console.log(`  ${i + 1}. Program: ${ix.programId.toString().slice(0, 8)}..., Keys: ${ix.keys.length}, Data: ${ix.data.length} bytes`);
    });

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
    } catch (error) {
      console.error('\n❌ Transaction too large to serialize!');
      console.error('Error:', error);
      throw new Error(`Transaction exceeds maximum size. Instructions: ${allInstructions.length}, Lookup tables: ${addressLookupTableAccounts.length}`);
    }
    console.log('\n=== Transaction Size ===');
    console.log('Size:', serializedTx.length, 'bytes');
    console.log('Limit: 1232 bytes');

    if (serializedTx.length <= 1232) {
      console.log('✅ Transaction size is UNDER the limit!');
    } else {
      console.log('Difference:', serializedTx.length - 1232, 'bytes over');
    }

    console.log('\n✅ Main transaction built successfully');

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
    console.error('Error building main transaction:', error);
    throw error;
  }
}
