import { Connection, PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import { getOperateIx } from '@jup-ag/lend/borrow';
import { createJupiterApiClient } from '@jup-ag/api';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import BN from 'bn.js';
import { createJitoTipInstruction } from './jito-bundle';

export interface DeleverageJitoBundleParams {
  collateralMint: PublicKey; // JLP
  debtMint: PublicKey;        // USDS
  withdrawAmount: number;     // 要取出的 JLP 数量
  userPublicKey: PublicKey;
  vaultId: number;
  positionId: number;
  connection: Connection;
  slippageBps?: number;
  preferredDexes?: string[];
  onlyDirectRoutes?: boolean;
  maxAccounts?: number; // Jupiter maxAccounts 限制，默认 32
  debtDecimals?: number;      // Debt token decimals, default 6
  collateralDecimals?: number; // Collateral token decimals, default 6
}

/**
 * 构建 Deleverage 三交易 Bundle（使用 Jito Bundle）
 *
 * 流程：
 * TX1: Withdraw JLP（取出抵押品）
 * TX2: Swap JLP → USDS (via Jupiter)
 * TX3: Repay USDS（还债）
 *
 * 优势：
 * - 每个交易都很小，不会超过大小限制
 * - Jito Bundle 保证原子性（全成功或全失败）
 * - 不需要 Flash Loan 费用
 */
export async function buildDeleverageJitoBundle(params: DeleverageJitoBundleParams) {
  const {
    collateralMint,
    debtMint,
    withdrawAmount,
    userPublicKey,
    vaultId,
    positionId,
    connection,
    slippageBps = 10,
    preferredDexes,
    onlyDirectRoutes = false,
    maxAccounts = 32, // 默认 32 账户
    debtDecimals = 6,
    collateralDecimals = 6,
  } = params;

  const debtScale = Math.pow(10, debtDecimals);
  const collateralScale = Math.pow(10, collateralDecimals);

  console.log('\n════════════════════════════════════════');
  console.log('  Deleverage with Jito Bundle (3 TXs)');
  console.log('════════════════════════════════════════');
  console.log('Withdraw Amount:', withdrawAmount);
  console.log('Vault ID:', vaultId);
  console.log('Position ID:', positionId);

  try {
    const withdrawAmountRaw = Math.floor(withdrawAmount * collateralScale);

    // ============================================================
    // TX1: Withdraw JLP
    // ============================================================
    console.log('\n[TX1] Building Withdraw JLP transaction...');

    const withdrawResult = await getOperateIx({
      vaultId,
      positionId,
      colAmount: new BN(-withdrawAmountRaw), // 取出 JLP（负数）
      debtAmount: new BN(0), // 不改变债务
      connection,
      signer: userPublicKey,
      recipient: userPublicKey,
      positionOwner: userPublicKey,
    });

    const withdrawInstructions = withdrawResult.ixs;
    console.log('✓ Withdraw instructions:', withdrawInstructions.length);

    // ============================================================
    // TX2: Swap JLP → USDS
    // ============================================================
    console.log('\n[TX2] Building Swap JLP → USDS transaction...');

    const userJlpAta = getAssociatedTokenAddressSync(collateralMint, userPublicKey);
    const userUsdsAta = getAssociatedTokenAddressSync(debtMint, userPublicKey);

    const jupiterApi = createJupiterApiClient();

    let quoteResponse;
    if (preferredDexes && preferredDexes.length > 0) {
      console.log('Using user-preferred DEXes:', preferredDexes.join(', '));
      quoteResponse = await jupiterApi.quoteGet({
        inputMint: collateralMint.toString(),
        outputMint: debtMint.toString(),
        amount: withdrawAmountRaw,
        slippageBps,
        dexes: preferredDexes,
        onlyDirectRoutes,
        restrictIntermediateTokens: true,
        maxAccounts,
      });
    } else {
      console.log('Using auto DEX selection...');
      quoteResponse = await jupiterApi.quoteGet({
        inputMint: collateralMint.toString(),
        outputMint: debtMint.toString(),
        amount: withdrawAmountRaw,
        slippageBps,
        onlyDirectRoutes,
        restrictIntermediateTokens: true,
        maxAccounts,
      });
    }

    console.log('Swap quote:');
    console.log('  Input:', parseInt(quoteResponse.inAmount) / collateralScale);
    console.log('  Output:', parseInt(quoteResponse.outAmount) / debtScale);

    const swapResult = await jupiterApi.swapInstructionsPost({
      swapRequest: {
        quoteResponse,
        userPublicKey: userPublicKey.toString(),
        wrapAndUnwrapSol: false,
        useSharedAccounts: true,
        destinationTokenAccount: userUsdsAta.toString(),
      },
    });

    const { setupInstructions = [], swapInstruction, addressLookupTableAddresses = [] } = swapResult;

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

    console.log('✓ Swap instructions:', swapInstructions.length);

    // ============================================================
    // TX3: Repay USDS
    // ============================================================
    console.log('\n[TX3] Building Repay USDS transaction...');

    // Use safe amount rounding (same logic as flash loan version)
    const swapOutputDebt = parseInt(quoteResponse.outAmount) / debtScale;
    console.log(`Swap output: ${swapOutputDebt.toFixed(6)}`);

    let safeRepayAmount: number;
    if (debtScale === 1e6) {
      // 6-decimal stablecoins: use known safe amounts
      if (swapOutputDebt >= 8) {
        safeRepayAmount = Math.floor(swapOutputDebt);
      } else if (swapOutputDebt >= 5) {
        safeRepayAmount = 5;
      } else if (swapOutputDebt >= 3) {
        safeRepayAmount = 3;
      } else {
        safeRepayAmount = swapOutputDebt;
      }
    } else {
      safeRepayAmount = Math.floor(swapOutputDebt);
    }
    console.log(`Safe repay amount: ${safeRepayAmount}`);

    const repayAmountRaw = Math.floor(safeRepayAmount * debtScale);

    const repayResult = await getOperateIx({
      vaultId,
      positionId,
      colAmount: new BN(0), // 不改变抵押品
      debtAmount: new BN(-repayAmountRaw), // 还 USDS（负数）
      connection,
      signer: userPublicKey,
      recipient: userPublicKey,
      positionOwner: userPublicKey,
    });

    const repayInstructions = repayResult.ixs;
    console.log('✓ Repay instructions:', repayInstructions.length);

    // ============================================================
    // Build all 3 transactions
    // ============================================================
    console.log('\n════════════════════════════════════════');
    console.log('Building 3 transactions for Jito Bundle');
    console.log('════════════════════════════════════════');

    const latestBlockhash = await connection.getLatestBlockhash('finalized');

    // Collect all address lookup tables
    const addressLookupTableAccounts: any[] = [];
    const seenKeys = new Set<string>();

    // Add from withdraw
    if (withdrawResult.addressLookupTableAccounts) {
      for (const lut of withdrawResult.addressLookupTableAccounts) {
        const key = lut.key.toString();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          addressLookupTableAccounts.push(lut);
        }
      }
    }

    // Add from repay
    if (repayResult.addressLookupTableAccounts) {
      for (const lut of repayResult.addressLookupTableAccounts) {
        const key = lut.key.toString();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          addressLookupTableAccounts.push(lut);
        }
      }
    }

    // Add from Jupiter
    if (addressLookupTableAddresses.length > 0) {
      for (const address of addressLookupTableAddresses) {
        const result = await connection.getAddressLookupTable(new PublicKey(address));
        const lut = result.value;
        if (lut) {
          const key = lut.key.toString();
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            addressLookupTableAccounts.push(lut);
          }
        }
      }
    }

    // Build TX1: Withdraw
    const tx1Message = new TransactionMessage({
      payerKey: userPublicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: withdrawInstructions,
    }).compileToV0Message(withdrawResult.addressLookupTableAccounts || []);

    const tx1 = new VersionedTransaction(tx1Message);

    // Build TX2: Swap
    const tx2Message = new TransactionMessage({
      payerKey: userPublicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: swapInstructions,
    }).compileToV0Message(addressLookupTableAccounts);

    const tx2 = new VersionedTransaction(tx2Message);

    // Build TX3: Repay + Jito Tip
    const jitoTipInstruction = createJitoTipInstruction(userPublicKey, 10000); // 0.00001 SOL tip
    const tx3Message = new TransactionMessage({
      payerKey: userPublicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [...repayInstructions, jitoTipInstruction],
    }).compileToV0Message(repayResult.addressLookupTableAccounts || []);

    const tx3 = new VersionedTransaction(tx3Message);

    // Check sizes
    const tx1Size = tx1.serialize().length;
    const tx2Size = tx2.serialize().length;
    const tx3Size = tx3.serialize().length;

    console.log('\nTransaction sizes:');
    console.log('  TX1 (Withdraw):', tx1Size, 'bytes');
    console.log('  TX2 (Swap):', tx2Size, 'bytes');
    console.log('  TX3 (Repay):', tx3Size, 'bytes');
    console.log('  Total:', tx1Size + tx2Size + tx3Size, 'bytes');

    if (tx1Size > 1232 || tx2Size > 1232 || tx3Size > 1232) {
      console.warn('⚠️  One or more transactions exceed 1232 bytes!');
    } else {
      console.log('✅ All transactions are under the size limit!');
    }

    console.log('\n✅ Jito Bundle (3 TXs) built successfully!');
    console.log('════════════════════════════════════════\n');

    return {
      transactions: [tx1, tx2, tx3],
      positionId,
      swapQuote: {
        inputAmount: quoteResponse.inAmount,
        outputAmount: quoteResponse.outAmount,
        priceImpactPct: quoteResponse.priceImpactPct || '0',
      },
    };
  } catch (error) {
    console.error('\n❌ Error building Jito Bundle:', error);
    throw error;
  }
}
