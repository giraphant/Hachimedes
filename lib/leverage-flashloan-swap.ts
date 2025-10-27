import { Connection, PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import { getFlashBorrowIx, getFlashPaybackIx } from '@jup-ag/lend/flashloan';
import { getOperateIx } from '@jup-ag/lend/borrow';
import { createJupiterApiClient } from '@jup-ag/api';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import BN from 'bn.js';

export interface LeverageFlashLoanSwapParams {
  collateralMint: PublicKey; // JLP
  debtMint: PublicKey;        // USDS
  flashLoanAmount: number;    // 要借的 USDS 数量（用于 swap）
  userPublicKey: PublicKey;
  vaultId: number;
  positionId: number;
  connection: Connection;
  slippageBps?: number;       // 滑点容忍度（basis points），默认 10 (0.1%)
  preferredDexes?: string[];  // 偏好的 DEX 列表
}

/**
 * 构建 Leverage + Swap 交易（使用 Flash Loan）
 *
 * 流程：
 * 1. FlashBorrow - 从流动性池借出 USDS
 * 2. Swap - USDS → JLP (via Jupiter, 限制单个 DEX)
 * 3. Operate (Deposit + Borrow) - 存入 JLP 抵押品 + 借出 USDS 债务
 * 4. FlashPayback - 还回 USDS 到流动性池
 *
 * 关键优化：
 * - 🎯 安全金额取整：根据测试发现，某些金额不需要 tick 初始化
 *   - ≥8 USDS: 所有整数金额都安全（无需 init）
 *   - 3, 5 USDS: 也是安全金额
 *   - 1, 2, 4, 6, 7 USDS: 需要 init（增加 2 条指令）
 * - 通过向上取整到最近的安全金额，避免额外的 init 指令
 * - 不足的 USDS 从用户钱包补充
 *
 * 这是 Deleverage 的反向操作，优化后只需要 4-5 条指令！
 */
export async function buildLeverageFlashLoanSwap(params: LeverageFlashLoanSwapParams) {
  const {
    collateralMint,
    debtMint,
    flashLoanAmount,
    userPublicKey,
    vaultId,
    positionId,
    connection,
    slippageBps = 10, // 默认 0.1% 滑点
    preferredDexes,
  } = params;

  console.log('\n════════════════════════════════════════');
  console.log('  Leverage with Flash Loan + Swap');
  console.log('════════════════════════════════════════');
  console.log('Flash Loan Amount:', flashLoanAmount, 'USDS');
  console.log('Vault ID:', vaultId);
  console.log('Position ID:', positionId);

  try {
    const flashLoanAmountRaw = Math.floor(flashLoanAmount * 1e6);

    // Step 1: Flash Borrow USDS from liquidity pool
    console.log('\n[1/5] Building Flash Borrow instruction...');
    const flashBorrowIx = await getFlashBorrowIx({
      asset: debtMint, // 借 USDS
      amount: new BN(flashLoanAmountRaw),
      signer: userPublicKey,
      connection,
    });
    console.log('✓ Flash Borrow instruction ready');

    // Step 2: Swap USDS → JLP via Jupiter
    console.log('\n[2/5] Getting Jupiter swap quote...');

    // 手动计算用户的 token accounts（避免 RPC 调用和不必要的 setup instructions）
    const userJlpAta = getAssociatedTokenAddressSync(collateralMint, userPublicKey);
    const userUsdsAta = getAssociatedTokenAddressSync(debtMint, userPublicKey);

    console.log('User token accounts:');
    console.log('  JLP ATA:', userJlpAta.toString());
    console.log('  USDS ATA:', userUsdsAta.toString());

    const jupiterApi = createJupiterApiClient();

    let quoteResponse;

    // 如果用户指定了 DEX 偏好，使用用户选择
    if (preferredDexes && preferredDexes.length > 0) {
      console.log('Using user-preferred DEXes:', preferredDexes.join(', '));
      try {
        quoteResponse = await jupiterApi.quoteGet({
          inputMint: debtMint.toString(), // USDS
          outputMint: collateralMint.toString(), // JLP
          amount: flashLoanAmountRaw,
          slippageBps,
          dexes: preferredDexes,
        });
        console.log('✓ Got quote from preferred DEXes');
      } catch (e) {
        console.log('Preferred DEXes failed, falling back to auto selection...');
      }
    }

    // 如果没有指定 DEX 或失败，尝试获取最简路由（只用单个 DEX）
    if (!quoteResponse) {
      console.log('Attempting to get minimal route (single DEX)...');
      const singleDexOptions = ['Orca', 'Raydium', 'Whirlpool'];

      for (const dex of singleDexOptions) {
        try {
          console.log(`Trying ${dex} only...`);
          quoteResponse = await jupiterApi.quoteGet({
            inputMint: debtMint.toString(), // USDS
            outputMint: collateralMint.toString(), // JLP
            amount: flashLoanAmountRaw,
            slippageBps,
            dexes: [dex], // 只用单个 DEX
          });
          console.log(`✓ Got quote from ${dex}`);
          break; // 找到就用
        } catch (e) {
          console.log(`${dex} failed, trying next...`);
        }
      }
    }

    // 如果所有单 DEX 都失败，使用默认路由（无限制）
    if (!quoteResponse) {
      console.log('All single DEX failed, using default route...');
      quoteResponse = await jupiterApi.quoteGet({
        inputMint: debtMint.toString(),
        outputMint: collateralMint.toString(),
        amount: flashLoanAmountRaw,
        slippageBps,
      });
    }

    if (!quoteResponse) {
      throw new Error('Failed to get swap quote from Jupiter');
    }

    console.log('Swap quote:');
    console.log('  Input:', parseInt(quoteResponse.inAmount) / 1e6, 'USDS');
    console.log('  Expected output:', parseInt(quoteResponse.outAmount) / 1e6, 'JLP');
    console.log('  Minimum output:', parseInt(quoteResponse.otherAmountThreshold || quoteResponse.outAmount) / 1e6, 'JLP');
    console.log('  Price impact:', quoteResponse.priceImpactPct || 'N/A');

    const swapResult = await jupiterApi.swapInstructionsPost({
      swapRequest: {
        quoteResponse,
        userPublicKey: userPublicKey.toString(),
        wrapAndUnwrapSol: false,
        // 让 Jupiter 自动检测账户，不手动指定
        // destinationTokenAccount: userJlpAta.toString(),
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

    // 检查 setup instructions
    console.log('Swap result breakdown:');
    console.log('  Setup instructions:', setupInstructions.length);
    console.log('  Has cleanup instruction:', !!cleanupInstruction);

    // 包含 setup instructions
    const swapInstructions: TransactionInstruction[] = [
      ...setupInstructions.map(deserializeInstruction),
      deserializeInstruction(swapInstruction),
    ];

    if (setupInstructions.length > 0) {
      console.log(`✓ Including ${setupInstructions.length} setup instructions`);
    }

    if (cleanupInstruction) {
      console.log('→ Skipping cleanup instruction to reduce size');
    }

    console.log('✓ Swap instructions ready:', swapInstructions.length);

    // Step 3: Operate - 同时存入抵押品 + 借出债务（用于还 Flash Loan）
    console.log('\n[3/5] Building Operate instruction (deposit + borrow)...');

    // 🎯 OPTIMIZATION: Round up to safe amount to avoid init instructions
    // 对于 Leverage，我们需要借出的 USDS 要能还 Flash Loan
    const expectedSwapOutputJlp = parseInt(quoteResponse.outAmount) / 1e6;
    const minSwapOutputJlp = parseInt(quoteResponse.otherAmountThreshold || quoteResponse.outAmount) / 1e6;
    console.log(`Swap output (expected): ${expectedSwapOutputJlp.toFixed(4)} JLP`);
    console.log(`Swap output (minimum): ${minSwapOutputJlp.toFixed(4)} JLP`);

    // Leverage 的逻辑：我们要借出的 USDS 必须 ≥ flash loan amount
    // 但要向上取整到安全金额
    let safeBorrowAmountUsds: number;
    if (flashLoanAmount >= 8) {
      // 已经在安全区间，向上取整
      safeBorrowAmountUsds = Math.ceil(flashLoanAmount);
      console.log(`✅ Safe zone (≥8 USDS): Borrowing ${safeBorrowAmountUsds} USDS`);
    } else if (flashLoanAmount >= 5) {
      safeBorrowAmountUsds = 8; // 向上到下一个安全金额
      console.log(`✅ Rounding to safe amount: 8 USDS (extra: ${(8 - flashLoanAmount).toFixed(2)} USDS)`);
    } else if (flashLoanAmount >= 3) {
      safeBorrowAmountUsds = 5;
      console.log(`✅ Rounding to safe amount: 5 USDS (extra: ${(5 - flashLoanAmount).toFixed(2)} USDS)`);
    } else {
      safeBorrowAmountUsds = 3;
      console.log(`✅ Rounding to safe amount: 3 USDS (extra: ${(3 - flashLoanAmount).toFixed(2)} USDS)`);
    }

    const borrowAmountRaw = Math.floor(safeBorrowAmountUsds * 1e6);

    // 🎯 CRITICAL FIX: Use minimum output (accounting for slippage) instead of expected output
    // The actual swap might output slightly less due to slippage, causing "insufficient funds"
    const minOutputAmount = quoteResponse.otherAmountThreshold || quoteResponse.outAmount;
    const depositAmountRaw = parseInt(minOutputAmount); // 存入最小保证输出量

    // ⚠️ CRITICAL: 必须同时：
    // 1. 存入 JLP 抵押品 (colAmount > 0)
    // 2. 借出 USDS 债务 (debtAmount > 0) 用于还 Flash Loan
    const operateResult = await getOperateIx({
      vaultId,
      positionId,
      colAmount: new BN(depositAmountRaw),  // 存入 JLP
      debtAmount: new BN(borrowAmountRaw),  // 借出 USDS（用于还 Flash Loan）
      connection,
      signer: userPublicKey,
      recipient: userPublicKey,
      positionOwner: userPublicKey,
    });

    const needsInit = operateResult.ixs.length > 1;
    let operateInstructions: TransactionInstruction[] = [];

    if (needsInit) {
      console.log(`❌ UNEXPECTED: SDK still returned ${operateResult.ixs.length} instructions (needs init)`);
      console.log('   This should not happen with safe amount rounding!');
      console.log('   Including ALL instructions to proceed...');
      operateInstructions = operateResult.ixs;
    } else {
      console.log('✅ No initialization needed - safe amount worked!');
      operateInstructions = [operateResult.ixs[0]];
    }
    console.log('✓ Operate instruction ready');
    console.log('  Deposit amount:', depositAmountRaw / 1e6, 'JLP');
    console.log('  Borrow amount:', borrowAmountRaw / 1e6, 'USDS');
    console.log('  Flash loan amount:', flashLoanAmountRaw / 1e6, 'USDS');
    if (borrowAmountRaw > flashLoanAmountRaw) {
      const extra = (borrowAmountRaw - flashLoanAmountRaw) / 1e6;
      console.log(`  Extra USDS borrowed: ${extra.toFixed(6)} USDS (will remain in wallet)`);
    } else if (borrowAmountRaw < flashLoanAmountRaw) {
      const shortage = (flashLoanAmountRaw - borrowAmountRaw) / 1e6;
      console.log(`  ⚠️ Shortage: ${shortage.toFixed(6)} USDS (must be in wallet!)`);
    }

    // Step 4: Flash Payback USDS to liquidity pool
    console.log('\n[4/5] Building Flash Payback instruction...');
    const flashPaybackIx = await getFlashPaybackIx({
      asset: debtMint, // 还 USDS
      amount: new BN(flashLoanAmountRaw),
      signer: userPublicKey,
      connection,
    });
    console.log('✓ Flash Payback instruction ready');

    // Step 5: Combine all instructions
    console.log('\n[5/5] Combining all instructions...');
    const allInstructions: TransactionInstruction[] = [
      flashBorrowIx,
      ...swapInstructions,
      ...operateInstructions,
      flashPaybackIx,
    ];

    console.log('\n═══ Transaction Summary ═══');
    console.log('Total instructions:', allInstructions.length);
    console.log('  Flash Borrow: 1');
    console.log('  Swap (single DEX): ', swapInstructions.length);
    console.log('  Operate: ', operateInstructions.length, needsInit ? '❌ (includes init - UNEXPECTED!)' : '✅ (operate only)');
    console.log('  Flash Payback: 1');
    console.log('\n🎯 Optimization: Safe amount rounding to avoid tick initialization');
    console.log('   Result: ' + (needsInit ? '❌ Failed (still needs init)' : '✅ Success (no init needed)'));

    console.log('\n═══ Instruction Details ═══');
    allInstructions.forEach((ix, i) => {
      console.log(`${i + 1}. Program: ${ix.programId.toString().slice(0, 8)}..., Keys: ${ix.keys.length}, Data: ${ix.data.length} bytes`);
    });

    // Get address lookup tables
    const addressLookupTableAccounts: any[] = [];
    const seenKeys = new Set<string>();

    // Add operate result's lookup tables
    if (operateResult.addressLookupTableAccounts) {
      for (const lut of operateResult.addressLookupTableAccounts) {
        const key = lut.key.toString();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          addressLookupTableAccounts.push(lut);
        }
      }
    }

    // Add Jupiter swap lookup tables
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

    console.log('Address lookup tables:', addressLookupTableAccounts.length);

    // Build versioned transaction
    const latestBlockhash = await connection.getLatestBlockhash('finalized');

    const messageV0 = new TransactionMessage({
      payerKey: userPublicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: allInstructions,
    }).compileToV0Message(addressLookupTableAccounts);

    const transaction = new VersionedTransaction(messageV0);

    // Check transaction size
    let serializedTx;
    try {
      serializedTx = transaction.serialize();
    } catch (error) {
      console.error('\n❌ Transaction too large to serialize!');
      throw new Error(`Transaction exceeds maximum size. Instructions: ${allInstructions.length}`);
    }

    console.log('\n═══ Transaction Size ═══');
    console.log('Size:', serializedTx.length, 'bytes');
    console.log('Limit: 1232 bytes');

    if (serializedTx.length <= 1232) {
      console.log('✅ Transaction size is UNDER the limit!');
    } else {
      console.log('⚠️  Over by:', serializedTx.length - 1232, 'bytes');
    }

    console.log('\n✅ Leverage Flash Loan + Swap transaction built successfully!');
    console.log('════════════════════════════════════════\n');

    return {
      transaction,
      positionId,
      swapQuote: {
        inputAmount: quoteResponse.inAmount,
        outputAmount: quoteResponse.outAmount,
        priceImpactPct: quoteResponse.priceImpactPct || '0',
      },
    };
  } catch (error) {
    console.error('\n❌ Error building Leverage Flash Loan + Swap transaction:', error);
    throw error;
  }
}
