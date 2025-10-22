import { Connection, PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import { getFlashBorrowIx, getFlashPaybackIx } from '@jup-ag/lend/flashloan';
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
 * 使用 Flash Loan 构建 Deleverage + Swap 交易
 *
 * 流程（简化版，跳过显式 Repay）：
 * 1. Flash Borrow JLP from liquidity pool
 * 2. Swap JLP → USDS via Jupiter
 * 3. Flash Payback JLP to liquidity pool
 *
 * 注意：此版本跳过了显式的 Repay 指令，测试 Flash Payback 是否会自动处理还款
 */
export async function buildDeleverageSwapFlashloanTransaction(params: DeleverageSwapFlashloanParams) {
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

  console.log('Building flash loan deleverage + swap transaction...');
  console.log('VaultId:', vaultId);
  console.log('PositionId:', positionId);
  console.log('Withdraw Amount:', withdrawAmount, 'JLP');

  try {
    // 转换为链上数量
    const withdrawAmountRaw = Math.floor(withdrawAmount * 1e6);

    // Step 1: 获取闪电贷借款指令 (borrow JLP)
    console.log('Step 1: Getting flash borrow instruction...');
    const flashBorrowIx = await getFlashBorrowIx({
      amount: new BN(withdrawAmountRaw),
      asset: withdrawMint,
      signer: userPublicKey,
      connection,
    });

    console.log('Flash borrow instruction created');

    // Step 2: 获取 Jupiter Swap 报价和指令
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

    // Step 3: 获取闪电贷还款指令 (payback JLP)
    // 注意: 我们跳过了显式的 Repay 指令，测试 Flash Payback 是否会自动处理还款
    console.log('Step 3: Getting flash payback instruction (skipping explicit Repay)...');
    const flashPaybackIx = await getFlashPaybackIx({
      amount: new BN(withdrawAmountRaw),
      asset: withdrawMint,
      signer: userPublicKey,
      connection,
    });

    console.log('Flash payback instruction created');

    // Step 4: 组合所有指令 (不包含显式 Repay)
    const allInstructions: TransactionInstruction[] = [
      flashBorrowIx,         // 1. Flash borrow JLP
      ...swapInstructions,   // 2. Swap JLP → USDS
      flashPaybackIx,        // 3. Flash payback JLP (可能自动处理还款)
    ];

    console.log('Instruction breakdown:');
    console.log('  FlashBorrow: 1');
    console.log('  Swap:', swapInstructions.length);
    console.log('  FlashPayback: 1');
    console.log('Total instructions:', allInstructions.length);

    // Step 5: 获取 address lookup tables (只需要 swap 的)
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
    console.log('Difference:', serializedTx.length - 1232, 'bytes');

    if (serializedTx.length > 1232) {
      console.warn(`Transaction size (${serializedTx.length} bytes) exceeds recommended limit by ${serializedTx.length - 1232} bytes`);
      console.warn('Attempting to submit anyway - Solana may still accept it...');
    }

    console.log('Flash loan deleverage + swap transaction built successfully');

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
    console.error('Error building flash loan deleverage + swap transaction:', error);
    throw error;
  }
}
