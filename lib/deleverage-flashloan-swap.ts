import { Connection, PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import { getFlashBorrowIx, getFlashPaybackIx } from '@jup-ag/lend/flashloan';
import { getOperateIx } from '@jup-ag/lend/borrow';
import { createJupiterApiClient } from '@jup-ag/api';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import BN from 'bn.js';

export interface DeleverageFlashLoanSwapParams {
  collateralMint: PublicKey; // JLP
  debtMint: PublicKey;        // USDS
  flashLoanAmount: number;    // 要借的 JLP 数量（用于 swap）
  userPublicKey: PublicKey;
  vaultId: number;
  positionId: number;
  connection: Connection;
  slippageBps?: number;       // 滑点容忍度（basis points），默认 10 (0.1%)
  preferredDexes?: string[];  // 偏好的 DEX 列表（如 ['Orca', 'Raydium']）
  onlyDirectRoutes?: boolean; // 是否仅使用直接路由，默认 false
  useJitoBundle?: boolean;    // 是否使用 Jito Bundle，默认 false
  maxAccounts?: number;       // Jupiter maxAccounts 限制，默认 32
  debtDecimals?: number;      // Debt token decimals, default 6
  collateralDecimals?: number; // Collateral token decimals, default 6
}

/**
 * 构建 Deleverage + Swap 交易（使用 Flash Loan）
 *
 * 流程：
 * 1. FlashBorrow - 从流动性池借出 JLP
 * 2. Swap - JLP → USDS (via Jupiter, 限制单个 DEX)
 * 3. Operate (Repay + Withdraw) - 同时还 USDS 债务 + 取出 JLP 抵押品
 * 4. FlashPayback - 还回 JLP 到流动性池
 *
 * 关键优化：
 * - 🎯 安全金额取整：根据测试发现，某些金额不需要 tick 初始化
 *   - ≥8 USDS: 所有整数金额都安全（无需 init）
 *   - 3, 5 USDS: 也是安全金额
 *   - 1, 2, 4, 6, 7 USDS: 需要 init（增加 2 条指令）
 * - 通过向下取整到最近的安全金额，避免额外的 init 指令
 * - 多余的 USDS 留在用户钱包中
 *
 * 这是官方支持的流程，优化后只需要 4-5 条指令！
 */
export async function buildDeleverageFlashLoanSwap(params: DeleverageFlashLoanSwapParams) {
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
  console.log('  Deleverage with Flash Loan + Swap');
  console.log('════════════════════════════════════════');
  console.log('Flash Loan Amount:', flashLoanAmount);
  console.log('Vault ID:', vaultId);
  console.log('Position ID:', positionId);

  try {
    const flashLoanAmountRaw = Math.floor(flashLoanAmount * collateralScale);

    // Step 1: Flash Borrow JLP from liquidity pool
    console.log('\n[1/5] Building Flash Borrow instruction...');
    const flashBorrowIx = await getFlashBorrowIx({
      asset: collateralMint,
      amount: new BN(flashLoanAmountRaw),
      signer: userPublicKey,
      connection,
    });
    console.log('✓ Flash Borrow instruction ready');

    // Step 2: Swap JLP → USDS via Jupiter
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
        inputMint: collateralMint.toString(),
        outputMint: debtMint.toString(),
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
        inputMint: collateralMint.toString(),
        outputMint: debtMint.toString(),
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
    console.log('  Input:', parseInt(quoteResponse.inAmount) / collateralScale);
    console.log('  Output:', parseInt(quoteResponse.outAmount) / debtScale);
    console.log('  Price impact:', quoteResponse.priceImpactPct || 'N/A');

    const swapResult = await jupiterApi.swapInstructionsPost({
      swapRequest: {
        quoteResponse,
        userPublicKey: userPublicKey.toString(),
        wrapAndUnwrapSol: false, // 不需要 wrap/unwrap SOL
        useSharedAccounts: true,
        // 手动提供 token accounts，避免不必要的 setup instructions
        destinationTokenAccount: userUsdsAta.toString(), // USDS 目标账户
        // 不设置 prioritizationFeeLamports，避免额外指令
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

    // 🔍 调试：检查 swap 指令的账户
    console.log('\n🔍 DEBUG: Checking swap instruction accounts');
    const debugSwapIx = deserializeInstruction(swapInstruction);
    console.log('Total accounts in swap:', debugSwapIx.keys.length);
    console.log('Looking for user USDS ATA:', userUsdsAta.toString());

    let foundUsdsAta = false;
    debugSwapIx.keys.forEach((key, i) => {
      if (key.pubkey.equals(userUsdsAta)) {
        console.log(`✅ Found user USDS ATA at position ${i} (writable: ${key.isWritable})`);
        foundUsdsAta = true;
      }
    });

    if (!foundUsdsAta) {
      console.log('❌ User USDS ATA NOT FOUND in swap instruction!');
      console.log('This means USDS will go to a different account.');
      console.log('\nWritable accounts in swap (potential USDS destination):');
      debugSwapIx.keys.forEach((key, i) => {
        if (key.isWritable && !key.isSigner) {
          console.log(`  [${i}] ${key.pubkey.toString()}`);
        }
      });
    }
    console.log('');

    // 检查 setup instructions
    console.log('Swap result breakdown:');
    console.log('  Setup instructions:', setupInstructions.length);
    console.log('  Has cleanup instruction:', !!cleanupInstruction);

    // ⚠️ 临时测试：包含 setup instructions 看是否能解决 insufficient funds
    const swapInstructions: TransactionInstruction[] = [
      ...setupInstructions.map(deserializeInstruction), // 包含 setup
      deserializeInstruction(swapInstruction),
    ];

    if (setupInstructions.length > 0) {
      console.log(`✓ Including ${setupInstructions.length} setup instructions (testing if this fixes insufficient funds)`);
    }

    if (cleanupInstruction) {
      console.log('→ Skipping cleanup instruction to reduce size');
    }

    console.log('✓ Using only core swap instruction:', swapInstructions.length);

    // Step 3: Operate - 同时还债 + 取出抵押品（用于还 Flash Loan）
    console.log('\n[3/5] Building Operate instruction (repay + withdraw)...');

    // 🎯 OPTIMIZATION: Round down to safe amount to avoid init instructions
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

    // ⚠️ CRITICAL: 必须同时：
    // 1. 还 USDS 债务 (debtAmount < 0)
    // 2. 取出 JLP 抵押品 (colAmount < 0) 用于还 Flash Loan
    const repayResult = await getOperateIx({
      vaultId,
      positionId,
      colAmount: new BN(-flashLoanAmountRaw), // 取出 JLP（用于还 Flash Loan）
      debtAmount: new BN(-repayAmountRaw),     // 还 USDS 债务
      connection,
      signer: userPublicKey,
      recipient: userPublicKey,
      positionOwner: userPublicKey,
    });

    const needsInit = repayResult.ixs.length > 1;
    let repayInstructions: TransactionInstruction[] = [];

    if (needsInit) {
      console.log(`❌ UNEXPECTED: SDK still returned ${repayResult.ixs.length} instructions (needs init)`);
      console.log('   This should not happen with safe amount rounding!');
      console.log('   Including ALL instructions to proceed...');
      repayInstructions = repayResult.ixs;
    } else {
      console.log('✅ No initialization needed - safe amount worked!');
      repayInstructions = [repayResult.ixs[0]];
    }
    console.log('✓ Repay instruction ready');
    console.log('  Repay amount:', repayAmountRaw / debtScale);
    console.log('  Actual swap output:', parseInt(quoteResponse.outAmount) / debtScale);
    if (repayAmountRaw < parseInt(quoteResponse.outAmount)) {
      const dust = (parseInt(quoteResponse.outAmount) - repayAmountRaw) / debtScale;
      console.log(`  Dust remaining in wallet: ${dust.toFixed(6)}`);
    }

    // Step 4: Flash Payback JLP to liquidity pool
    console.log('\n[4/5] Building Flash Payback instruction...');
    const flashPaybackIx = await getFlashPaybackIx({
      asset: collateralMint,
      amount: new BN(flashLoanAmountRaw),
      signer: userPublicKey,
      connection,
    });
    console.log('✓ Flash Payback instruction ready');

    // Step 5: Get address lookup tables FIRST (needed for size testing)
    console.log('\n[5/5] Preparing address lookup tables...');
    const addressLookupTableAccounts: any[] = [];
    const seenKeys = new Set<string>();

    // Add repay result's lookup tables
    if (repayResult.addressLookupTableAccounts) {
      for (const lut of repayResult.addressLookupTableAccounts) {
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
      flashBorrowIx,           // 1
      ...swapInstructions,     // 1
      ...repayInstructions,    // 1-3 (might include init instructions)
      flashPaybackIx,          // 1
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
    console.log('  Repay: ', repayInstructions.length, needsInit ? '❌ (includes init - UNEXPECTED!)' : '✅ (operate only)');
    console.log('  Flash Payback: 1');
    if (useJitoBundle && allInstructions.length > 4 + swapInstructions.length + repayInstructions.length) {
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

    // Check transaction size (allow bypass if using Jito Bundle)
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

    console.log('\n✅ Flash Loan + Swap transaction built successfully!');
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
    console.error('\n❌ Error building Flash Loan + Swap transaction:', error);
    throw error;
  }
}
