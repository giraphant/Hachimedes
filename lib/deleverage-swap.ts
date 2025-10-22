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
  slippageBps?: number; // Swap 滑点 (basis points, 默认 50 = 0.5%)
}

/**
 * 构建完整的 Deleverage + Swap 交易
 *
 * 步骤：
 * 1. 从 Jupiter Lend 取出抵押品 (JLP)
 * 2. 通过 Jupiter Swap 将 JLP 换成 USDS
 * 3. 用 USDS 还款给 Jupiter Lend
 *
 * 所有操作在一个交易中原子执行
 */
export async function buildDeleverageSwapTransaction(params: DeleverageSwapParams) {
  const {
    withdrawMint,
    withdrawAmount,
    repayMint,
    userPublicKey,
    vaultId,
    positionId,
    connection,
    slippageBps = 50, // 默认 0.5% 滑点
  } = params;

  console.log('Building deleverage + swap transaction...');
  console.log('VaultId:', vaultId);
  console.log('PositionId:', positionId);
  console.log('Withdraw Amount:', withdrawAmount, 'JLP');
  console.log('Slippage:', slippageBps / 100, '%');

  try {
    // Step 1: 获取取款指令（取出 JLP）
    console.log('Step 1: Getting withdraw instruction...');

    // 转换为链上数量（假设 JLP 是 6 位小数）
    const withdrawAmountRaw = Math.floor(withdrawAmount * 1e6);

    const withdrawResult = await getOperateIx({
      vaultId,
      positionId,
      colAmount: new BN(-withdrawAmountRaw), // 负数 = 取款
      debtAmount: new BN(0), // 不操作借款
      connection,
      signer: userPublicKey,
    });

    console.log('Withdraw instructions:', withdrawResult.ixs.length);

    // Step 2: 获取 Jupiter Swap 指令（JLP -> USDS）
    console.log('Step 2: Getting swap quote...');

    const jupiterApi = createJupiterApiClient();

    // 获取报价
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

    // 获取 swap 指令
    const swapResult = await jupiterApi.swapInstructionsPost({
      swapRequest: {
        quoteResponse,
        userPublicKey: userPublicKey.toString(),
        wrapAndUnwrapSol: true,
      },
    });

    console.log('Swap instructions received');

    // 解析 swap 指令
    const {
      setupInstructions = [],
      swapInstruction,
      cleanupInstruction,
      addressLookupTableAddresses = [],
    } = swapResult;

    if (!swapInstruction) {
      throw new Error('No swap instruction returned from Jupiter');
    }

    // 将 swap 指令从 base64 解码为 TransactionInstruction
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

    console.log('Setup instructions:', setupInstructions.length);
    console.log('Swap instruction: 1');
    console.log('Cleanup instruction:', cleanupInstruction ? 1 : 0);
    console.log('Total swap instructions:', swapInstructions.length);

    // Step 3: 获取还款指令（还 USDS）
    console.log('Step 3: Getting repay instruction...');

    // 使用 swap 的输出金额作为还款金额
    const repayAmountRaw = parseInt(quoteResponse.outAmount);

    const repayResult = await getOperateIx({
      vaultId,
      positionId,
      colAmount: new BN(0), // 不操作抵押
      debtAmount: new BN(-repayAmountRaw), // 负数 = 还款
      connection,
      signer: userPublicKey,
    });

    console.log('Repay instructions:', repayResult.ixs.length);

    // Step 4: 组合所有指令
    const allInstructions: TransactionInstruction[] = [
      ...withdrawResult.ixs, // 1. 取出 JLP
      ...swapInstructions,   // 2. Swap JLP -> USDS
      ...repayResult.ixs,    // 3. 还款 USDS
    ];

    console.log('Instruction breakdown:');
    console.log('  Withdraw:', withdrawResult.ixs.length);
    console.log('  Swap:', swapInstructions.length);
    console.log('  Repay:', repayResult.ixs.length);
    console.log('Total instructions:', allInstructions.length);

    // Step 5: 获取 address lookup tables
    const addressLookupTableAccounts = await Promise.all(
      [
        ...withdrawResult.addressLookupTableAccounts,
        ...repayResult.addressLookupTableAccounts,
      ].map(async (lut) => lut)
    );

    // 如果 Jupiter Swap 也返回了 lookup tables，需要获取它们
    if (addressLookupTableAddresses.length > 0) {
      const swapLookupTables = await Promise.all(
        addressLookupTableAddresses.map(async (address) => {
          const result = await connection.getAddressLookupTable(new PublicKey(address));
          return result.value;
        })
      );

      addressLookupTableAccounts.push(
        ...swapLookupTables.filter((lut): lut is any => lut !== null)
      );
    }

    console.log('Total lookup tables:', addressLookupTableAccounts.length);

    // Step 6: 构建 versioned transaction
    const latestBlockhash = await connection.getLatestBlockhash('finalized');

    const messageV0 = new TransactionMessage({
      payerKey: userPublicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: allInstructions,
    }).compileToV0Message(addressLookupTableAccounts);

    const transaction = new VersionedTransaction(messageV0);

    // 检查交易大小
    const serializedTx = transaction.serialize();
    console.log('Transaction size:', serializedTx.length, 'bytes');
    console.log('Max size: 1232 bytes');

    if (serializedTx.length > 1232) {
      throw new Error(`Transaction too large: ${serializedTx.length} bytes (max 1232). This operation requires too many instructions to fit in a single transaction. Consider using separate transactions.`);
    }

    console.log('Deleverage + Swap transaction built successfully');

    return {
      transaction,
      positionId: repayResult.nftId,
      swapQuote: {
        inputAmount: quoteResponse.inAmount,
        outputAmount: quoteResponse.outAmount,
        priceImpactPct: quoteResponse.priceImpactPct,
      },
    };
  } catch (error) {
    console.error('Error building deleverage + swap transaction:', error);
    throw error;
  }
}
