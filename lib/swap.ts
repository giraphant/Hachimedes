import { Connection, PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import { createJupiterApiClient } from '@jup-ag/api';

export interface SwapParams {
  inputMint: PublicKey;
  inputAmount: number; // 原始值（带小数）
  outputMint: PublicKey;
  userPublicKey: PublicKey;
  connection: Connection;
  slippageBps?: number; // 滑点 (basis points, 默认 50 = 0.5%)
}

/**
 * 构建 Jupiter Swap 交易
 *
 * 使用 Jupiter API 获取最佳路由并构建 swap 交易
 */
export async function buildSwapTransaction(params: SwapParams) {
  const {
    inputMint,
    inputAmount,
    outputMint,
    userPublicKey,
    connection,
    slippageBps = 50, // 默认 0.5% 滑点
  } = params;

  console.log('Building swap transaction...');
  console.log('Input Amount:', inputAmount);
  console.log('Slippage:', slippageBps / 100, '%');

  try {
    const jupiterApi = createJupiterApiClient();

    // 获取报价
    console.log('Getting swap quote from Jupiter...');
    const quoteResponse = await jupiterApi.quoteGet({
      inputMint: inputMint.toString(),
      outputMint: outputMint.toString(),
      amount: inputAmount,
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
    console.log('Getting swap instructions...');
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

    // 将指令从 base64 解码为 TransactionInstruction
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

    const allInstructions: TransactionInstruction[] = [
      ...setupInstructions.map(deserializeInstruction),
      deserializeInstruction(swapInstruction),
    ];

    if (cleanupInstruction) {
      allInstructions.push(deserializeInstruction(cleanupInstruction));
    }

    console.log('Total swap instructions:', allInstructions.length);

    // 获取 address lookup tables
    const addressLookupTableAccounts = [];
    if (addressLookupTableAddresses.length > 0) {
      const lookupTables = await Promise.all(
        addressLookupTableAddresses.map(async (address) => {
          const result = await connection.getAddressLookupTable(new PublicKey(address));
          return result.value;
        })
      );
      addressLookupTableAccounts.push(
        ...lookupTables.filter((lut): lut is any => lut !== null)
      );
    }

    console.log('Lookup tables:', addressLookupTableAccounts.length);

    // 构建 versioned transaction
    const latestBlockhash = await connection.getLatestBlockhash('finalized');

    const messageV0 = new TransactionMessage({
      payerKey: userPublicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: allInstructions,
    }).compileToV0Message(addressLookupTableAccounts);

    const transaction = new VersionedTransaction(messageV0);

    console.log('Swap transaction built successfully');

    return {
      transaction,
      swapQuote: {
        inputAmount: quoteResponse.inAmount,
        outputAmount: quoteResponse.outAmount,
        priceImpactPct: quoteResponse.priceImpactPct,
      },
    };
  } catch (error) {
    console.error('Error building swap transaction:', error);
    throw error;
  }
}
