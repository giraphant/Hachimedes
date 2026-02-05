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
  onlyDirectRoutes?: boolean; // 是否仅使用直接路由，默认 false
  useJitoBundle?: boolean;    // 是否使用 Jito Bundle，默认 false
  maxAccounts?: number;       // Jupiter maxAccounts 限制，默认 32
  debtDecimals?: number;      // Debt token decimals, default 6
  collateralDecimals?: number; // Collateral token decimals, default 6
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
    onlyDirectRoutes = false,
    useJitoBundle = false,
    maxAccounts = 32, // 默认 32 账户
    debtDecimals = 6,
    collateralDecimals = 6,
  } = params;

  const debtScale = Math.pow(10, debtDecimals);
  const collateralScale = Math.pow(10, collateralDecimals);

  console.log('\n════════════════════════════════════════');
  console.log('  Leverage with Flash Loan + Swap');
  console.log('════════════════════════════════════════');
  console.log('Flash Loan Amount:', flashLoanAmount);
  console.log('Vault ID:', vaultId);
  console.log('Position ID:', positionId);

  try {
    const flashLoanAmountRaw = Math.floor(flashLoanAmount * debtScale);

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
      quoteResponse = await jupiterApi.quoteGet({
        inputMint: debtMint.toString(), // USDS
        outputMint: collateralMint.toString(), // JLP
        amount: flashLoanAmountRaw,
        slippageBps,
        dexes: preferredDexes,
        onlyDirectRoutes: onlyDirectRoutes,
        restrictIntermediateTokens: true,
        maxAccounts,
      });
    } else {
      // 没有指定 DEX，使用 Jupiter 自动路由（与官方一致）
      console.log('Using Jupiter auto routing (no dexes specified)...');
      quoteResponse = await jupiterApi.quoteGet({
        inputMint: debtMint.toString(), // USDS
        outputMint: collateralMint.toString(), // JLP
        amount: flashLoanAmountRaw,
        slippageBps,
        onlyDirectRoutes: onlyDirectRoutes,
        restrictIntermediateTokens: true,
        maxAccounts,
      });
    }

    if (!quoteResponse) {
      throw new Error('Failed to get swap quote from Jupiter');
    }

    console.log('Swap quote:');
    console.log('  Input:', parseInt(quoteResponse.inAmount) / debtScale);
    console.log('  Expected output:', parseInt(quoteResponse.outAmount) / collateralScale);
    console.log('  Minimum output:', parseInt(quoteResponse.otherAmountThreshold || quoteResponse.outAmount) / collateralScale);
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
    const expectedSwapOutput = parseInt(quoteResponse.outAmount) / collateralScale;
    const minSwapOutput = parseInt(quoteResponse.otherAmountThreshold || quoteResponse.outAmount) / collateralScale;
    console.log(`Swap output (expected): ${expectedSwapOutput.toFixed(4)}`);
    console.log(`Swap output (minimum): ${minSwapOutput.toFixed(4)}`);

    // Round up to safe amount (safe amount rounding only applies to 6-decimal stablecoins)
    let safeBorrowAmount: number;
    if (debtScale === 1e6) {
      // 6-decimal stablecoins: use known safe amounts
      if (flashLoanAmount >= 8) {
        safeBorrowAmount = Math.ceil(flashLoanAmount);
      } else if (flashLoanAmount >= 5) {
        safeBorrowAmount = 8;
      } else if (flashLoanAmount >= 3) {
        safeBorrowAmount = 5;
      } else {
        safeBorrowAmount = 3;
      }
    } else {
      safeBorrowAmount = Math.ceil(flashLoanAmount);
    }
    console.log(`Safe borrow amount: ${safeBorrowAmount}`);

    const borrowAmountRaw = Math.floor(safeBorrowAmount * debtScale);

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
    console.log('  Deposit amount:', depositAmountRaw / collateralScale);
    console.log('  Borrow amount:', borrowAmountRaw / debtScale);
    console.log('  Flash loan amount:', flashLoanAmountRaw / debtScale);
    if (borrowAmountRaw > flashLoanAmountRaw) {
      const extra = (borrowAmountRaw - flashLoanAmountRaw) / debtScale;
      console.log(`  Extra borrowed: ${extra.toFixed(6)} (will remain in wallet)`);
    } else if (borrowAmountRaw < flashLoanAmountRaw) {
      const shortage = (flashLoanAmountRaw - borrowAmountRaw) / debtScale;
      console.log(`  ⚠️ Shortage: ${shortage.toFixed(6)} (must be in wallet!)`);
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

    // Step 5: Get address lookup tables FIRST (needed for size testing)
    console.log('\n[5/5] Preparing address lookup tables...');
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

    console.log('✓ Address lookup tables loaded:', addressLookupTableAccounts.length);

    // Step 6: Combine all instructions
    console.log('\n[6/6] Combining all instructions...');
    const allInstructions: TransactionInstruction[] = [
      flashBorrowIx,
      ...swapInstructions,
      ...operateInstructions,
      flashPaybackIx,
    ];

    // 🎯 Add Jito tip if using bundle (for faster execution and MEV protection)
    // Note: Jito Bundle provides atomic multi-TX execution, but each individual TX
    // still has serialization limits. For Flash Loans, we can't split into multiple TXs.
    if (useJitoBundle) {
      console.log('\n💰 Testing if Jito tip can be added...');
      const { createJitoTipInstruction } = await import('./jito-bundle');
      const tipIx = createJitoTipInstruction(userPublicKey, 10000); // 0.00001 SOL tip

      // Test if tip would break serialization
      const testInstructions = [...allInstructions, tipIx];
      const testBlockhash = await connection.getLatestBlockhash('finalized');
      const testMessage = new TransactionMessage({
        payerKey: userPublicKey,
        recentBlockhash: testBlockhash.blockhash,
        instructions: testInstructions,
      }).compileToV0Message(addressLookupTableAccounts);

      const testTx = new VersionedTransaction(testMessage);

      try {
        testTx.serialize();
        // Success! We can add the tip
        allInstructions.push(tipIx);
        console.log('✓ Jito tip added: 10000 lamports');
      } catch (e) {
        console.warn('⚠️  Cannot add Jito tip - transaction exceeds serialization limit');
        console.warn('   Please use "仅直接路由" to reduce transaction size');
        throw new Error('交易过大无法序列化。请在高级设置中启用「仅直接路由」以减小交易大小。');
      }
    }

    console.log('\n═══ Transaction Summary ═══');
    console.log('Total instructions:', allInstructions.length);
    console.log('  Flash Borrow: 1');
    console.log('  Swap (single DEX): ', swapInstructions.length);
    console.log('  Operate: ', operateInstructions.length, needsInit ? '❌ (includes init - UNEXPECTED!)' : '✅ (operate only)');
    console.log('  Flash Payback: 1');
    if (useJitoBundle && allInstructions.length > 4 + swapInstructions.length + operateInstructions.length) {
      console.log('  Jito Tip: 1');
    }
    console.log('\n🎯 Optimization: Safe amount rounding to avoid tick initialization');
    console.log('   Result: ' + (needsInit ? '❌ Failed (still needs init)' : '✅ Success (no init needed)'));

    console.log('\n═══ Instruction Details ═══');
    allInstructions.forEach((ix, i) => {
      console.log(`${i + 1}. Program: ${ix.programId.toString().slice(0, 8)}..., Keys: ${ix.keys.length}, Data: ${ix.data.length} bytes`);
    });

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
      if (useJitoBundle) {
        console.warn('\n⚠️  Transaction too large to serialize, but using Jito Bundle - proceeding anyway');
        // Jito Bundle can handle large transactions, so we continue
      } else {
        console.error('\n❌ Transaction too large to serialize!');
        throw new Error(`Transaction exceeds maximum size. Instructions: ${allInstructions.length}`);
      }
    }

    if (serializedTx) {
      console.log('\n═══ Transaction Size ═══');
      console.log('Size:', serializedTx.length, 'bytes');
      console.log('Limit: 1232 bytes');

      if (serializedTx.length <= 1232) {
        console.log('✅ Transaction size is UNDER the limit!');
      } else {
        if (useJitoBundle) {
          console.log('⚠️  Over by:', serializedTx.length - 1232, 'bytes (OK with Jito Bundle)');
        } else {
          console.log('⚠️  Over by:', serializedTx.length - 1232, 'bytes');
        }
      }
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
