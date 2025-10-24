import { Connection, PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
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
  slippageBps?: number;
  priorityFeeLamports?: number; // 优先费用（lamports）
  preferredDexes?: string[];    // 偏好的 DEX 列表（如 ['Orca', 'Raydium']）
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
    slippageBps = 50,
    priorityFeeLamports = 0,
    preferredDexes,
  } = params;

  console.log('\n════════════════════════════════════════');
  console.log('  Deleverage with Flash Loan + Swap');
  console.log('════════════════════════════════════════');
  console.log('Flash Loan Amount:', flashLoanAmount, 'JLP');
  console.log('Vault ID:', vaultId);
  console.log('Position ID:', positionId);

  try {
    const flashLoanAmountRaw = Math.floor(flashLoanAmount * 1e6);

    // Step 0: Compute Budget - 设置计算单元限制和优先费用
    console.log('\n[0/6] Setting up Compute Budget...');
    const computeBudgetIxs: TransactionInstruction[] = [];

    // 设置计算单元限制（官方使用约 400k-600k，我们设置 600k 以确保足够）
    const computeUnitLimit = 600_000;
    computeBudgetIxs.push(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: computeUnitLimit,
      })
    );
    console.log(`→ Set compute unit limit: ${computeUnitLimit}`);

    // 如果用户指定了优先费用，设置计算单元价格
    if (priorityFeeLamports > 0) {
      console.log(`→ Adding priority fee: ${priorityFeeLamports} lamports`);
      // 设置计算单元价格（micro-lamports per compute unit）
      const computeUnitPrice = Math.floor((priorityFeeLamports * 1_000_000) / computeUnitLimit);
      computeBudgetIxs.push(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: computeUnitPrice,
        })
      );
    } else {
      console.log('→ No priority fee (using default)');
    }

    // Step 1: Flash Borrow JLP from liquidity pool
    console.log('\n[1/6] Building Flash Borrow instruction...');
    const flashBorrowIx = await getFlashBorrowIx({
      asset: collateralMint,
      amount: new BN(flashLoanAmountRaw),
      signer: userPublicKey,
      connection,
    });
    console.log('✓ Flash Borrow instruction ready');

    // Step 2: Swap JLP → USDS via Jupiter
    console.log('\n[2/6] Getting Jupiter swap quote...');

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
          inputMint: collateralMint.toString(),
          outputMint: debtMint.toString(),
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
            inputMint: collateralMint.toString(),
            outputMint: debtMint.toString(),
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

    // 如果所有单 DEX 都失败，使用默认
    if (!quoteResponse) {
      console.log('All single DEX failed, using default route...');
      quoteResponse = await jupiterApi.quoteGet({
        inputMint: collateralMint.toString(),
        outputMint: debtMint.toString(),
        amount: flashLoanAmountRaw,
        slippageBps,
      });
    }

    if (!quoteResponse) {
      throw new Error('Failed to get swap quote from Jupiter');
    }

    console.log('Swap quote:');
    console.log('  Input:', parseInt(quoteResponse.inAmount) / 1e6, 'JLP');
    console.log('  Output:', parseInt(quoteResponse.outAmount) / 1e6, 'USDS');
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
    console.log('\n[3/6] Building Operate instruction (repay + withdraw)...');

    // 🎯 OPTIMIZATION: Round down to safe amount to avoid init instructions
    // Based on testing: amounts ≥8 USDS never need init, and 3, 5 are also safe
    const swapOutputUsds = parseInt(quoteResponse.outAmount) / 1e6;
    console.log(`Swap output: ${swapOutputUsds.toFixed(2)} USDS`);

    let safeAmountUsds: number;
    if (swapOutputUsds >= 8) {
      // Safe zone: round down to nearest integer
      safeAmountUsds = Math.floor(swapOutputUsds);
      console.log(`✅ Safe zone (≥8 USDS): Using ${safeAmountUsds} USDS`);
    } else if (swapOutputUsds >= 5) {
      safeAmountUsds = 5;
      console.log(`✅ Rounding to safe amount: 5 USDS (dust: ${(swapOutputUsds - 5).toFixed(2)} USDS)`);
    } else if (swapOutputUsds >= 3) {
      safeAmountUsds = 3;
      console.log(`✅ Rounding to safe amount: 3 USDS (dust: ${(swapOutputUsds - 3).toFixed(2)} USDS)`);
    } else {
      // Too small, would need init - accept it
      safeAmountUsds = swapOutputUsds;
      console.log(`⚠️  Amount too small (<3 USDS), may need init`);
    }

    const repayAmountRaw = Math.floor(safeAmountUsds * 1e6);

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
    console.log('  Repay amount:', repayAmountRaw / 1e6, 'USDS');
    console.log('  Actual swap output:', parseInt(quoteResponse.outAmount) / 1e6, 'USDS');
    if (repayAmountRaw < parseInt(quoteResponse.outAmount)) {
      const dust = (parseInt(quoteResponse.outAmount) - repayAmountRaw) / 1e6;
      console.log(`  Dust remaining in wallet: ${dust.toFixed(6)} USDS`);
    }

    // Step 4: Flash Payback JLP to liquidity pool
    console.log('\n[4/6] Building Flash Payback instruction...');
    const flashPaybackIx = await getFlashPaybackIx({
      asset: collateralMint,
      amount: new BN(flashLoanAmountRaw),
      signer: userPublicKey,
      connection,
    });
    console.log('✓ Flash Payback instruction ready');

    // Step 5: Combine all instructions (with Compute Budget at the front)
    console.log('\n[5/6] Combining all instructions...');
    const allInstructions: TransactionInstruction[] = [
      ...computeBudgetIxs,     // 2 (Compute Unit Limit + Price)
      flashBorrowIx,           // 1
      ...swapInstructions,     // 1
      ...repayInstructions,    // 1-3 (might include init instructions)
      flashPaybackIx,          // 1
    ];

    console.log('\n═══ Transaction Summary ═══');
    console.log('Total instructions:', allInstructions.length);
    console.log('  Compute Budget:', computeBudgetIxs.length, priorityFeeLamports > 0 ? '(Limit + Price)' : '(Limit only)');
    console.log('  Flash Borrow: 1');
    console.log('  Swap (single DEX): ', swapInstructions.length);
    console.log('  Repay: ', repayInstructions.length, needsInit ? '❌ (includes init - UNEXPECTED!)' : '✅ (operate only)');
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

    console.log('Address lookup tables:', addressLookupTableAccounts.length);

    // Step 6: Build versioned transaction
    console.log('\n[6/6] Building final versioned transaction...');
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
