import { Connection, PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import { getFlashBorrowIx, getFlashPaybackIx } from '@jup-ag/lend/flashloan';
import { getVaultsProgram, getOperateContext } from '@jup-ag/lend/borrow';
import { createJupiterApiClient } from '@jup-ag/api';
import BN from 'bn.js';

export interface DeleverageDirectOperateParams {
  collateralMint: PublicKey;
  debtMint: PublicKey;
  flashLoanAmount: number;
  userPublicKey: PublicKey;
  vaultId: number;
  positionId: number;
  connection: Connection;
  slippageBps?: number;
}

/**
 * 使用 Anchor 直接调用 operate 指令（不使用 SDK 的 getOperateIx）
 *
 * operate 指令内部会自动通过 CPI 调用：
 * - Oracle (获取价格)
 * - PreOperate (预处理)
 * - Token Transfer (转账)
 *
 * 这样就不会有额外的初始化指令！
 */
export async function buildDeleverageDirectOperate(params: DeleverageDirectOperateParams) {
  const {
    collateralMint,
    debtMint,
    flashLoanAmount,
    userPublicKey,
    vaultId,
    positionId,
    connection,
    slippageBps = 50,
  } = params;

  console.log('\n════════════════════════════════════════');
  console.log('  Direct Operate (No Init Instructions)');
  console.log('════════════════════════════════════════');

  try {
    const flashLoanAmountRaw = Math.floor(flashLoanAmount * 1e6);

    // Step 1: Flash Borrow
    console.log('\n[1/4] Building Flash Borrow...');
    const flashBorrowIx = await getFlashBorrowIx({
      asset: collateralMint,
      amount: new BN(flashLoanAmountRaw),
      signer: userPublicKey,
      connection,
    });

    // Step 2: Jupiter Swap
    console.log('\n[2/4] Getting Jupiter swap quote...');
    const jupiterApi = createJupiterApiClient();

    const quoteResponse = await jupiterApi.quoteGet({
      inputMint: collateralMint.toString(),
      outputMint: debtMint.toString(),
      amount: flashLoanAmountRaw,
      slippageBps,
    });

    if (!quoteResponse) {
      throw new Error('Failed to get swap quote');
    }

    console.log('Swap:', parseInt(quoteResponse.inAmount) / 1e6, 'JLP →', parseInt(quoteResponse.outAmount) / 1e6, 'USDS');

    const swapResult = await jupiterApi.swapInstructionsPost({
      swapRequest: {
        quoteResponse,
        userPublicKey: userPublicKey.toString(),
        wrapAndUnwrapSol: true,
        useSharedAccounts: true,
      },
    });

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
      ...(swapResult.setupInstructions || []).map(deserializeInstruction),
      deserializeInstruction(swapResult.swapInstruction),
    ];

    if (swapResult.cleanupInstruction) {
      swapInstructions.push(deserializeInstruction(swapResult.cleanupInstruction));
    }

    // Step 3: 直接构建 Operate 指令（使用 Anchor Program）
    console.log('\n[3/4] Building Operate instruction (direct Anchor call)...');

    const program = getVaultsProgram({ connection, signer: userPublicKey });
    const repayAmountRaw = parseInt(quoteResponse.outAmount);

    // 获取 operate 所需的所有账户
    const operateContext = await getOperateContext({
      vaultId,
      positionId,
      program,
      connection,
      signer: userPublicKey,
      colAmount: new BN(0),
      debtAmount: new BN(-repayAmountRaw),
      recipient: undefined,
      positionOwner: undefined,
    });

    console.log('Operate context obtained');
    console.log('Remaining accounts indices:', operateContext.remainingAccountsIndices);

    // 使用 Anchor 直接构建 operate 指令
    const operateIx = await program.methods
      .operate(
        new BN(0), // newCol: 不改变抵押品
        new BN(-repayAmountRaw), // newDebt: 还款（负数）
        null, // transferType
        Buffer.from(operateContext.remainingAccountsIndices) // remaining accounts
      )
      .accounts({
        signer: operateContext.accounts.signer,
        signerSupplyTokenAccount: operateContext.accounts.signerSupplyTokenAccount,
        signerBorrowTokenAccount: operateContext.accounts.signerBorrowTokenAccount,
        recipient: operateContext.accounts.recipient,
        recipientBorrowTokenAccount: operateContext.accounts.recipientBorrowTokenAccount,
        recipientSupplyTokenAccount: operateContext.accounts.recipientSupplyTokenAccount,
        vaultConfig: operateContext.accounts.vaultConfig,
        vaultState: operateContext.accounts.vaultState,
        supplyToken: operateContext.accounts.supplyToken,
        borrowToken: operateContext.accounts.borrowToken,
        supplyTokenReservesLiquidity: operateContext.accounts.supplyTokenReservesLiquidity,
        borrowTokenReservesLiquidity: operateContext.accounts.borrowTokenReservesLiquidity,
        vaultSupplyPositionOnLiquidity: operateContext.accounts.vaultSupplyPositionOnLiquidity,
        vaultBorrowPositionOnLiquidity: operateContext.accounts.vaultBorrowPositionOnLiquidity,
        supplyRateModel: operateContext.accounts.supplyRateModel,
        borrowRateModel: operateContext.accounts.borrowRateModel,
        liquidity: operateContext.accounts.liquidity,
        liquidityProgram: operateContext.accounts.liquidityProgram,
        vaultSupplyTokenAccount: operateContext.accounts.vaultSupplyTokenAccount,
        vaultBorrowTokenAccount: operateContext.accounts.vaultBorrowTokenAccount,
        oracle: operateContext.accounts.oracle,
        oracleProgram: operateContext.accounts.oracleProgram,
        position: operateContext.accounts.position,
        positionTokenAccount: operateContext.accounts.positionTokenAccount,
        currentPositionTick: operateContext.accounts.currentPositionTick,
        finalPositionTick: operateContext.accounts.finalPositionTick,
        currentPositionTickId: operateContext.accounts.currentPositionTickId,
        finalPositionTickId: operateContext.accounts.finalPositionTickId,
        newBranch: operateContext.accounts.newBranch,
        supplyTokenProgram: operateContext.accounts.supplyTokenProgram,
        borrowTokenProgram: operateContext.accounts.borrowTokenProgram,
        systemProgram: operateContext.accounts.systemProgram,
      })
      .remainingAccounts(operateContext.remainingAccounts)
      .instruction();

    console.log('✓ Operate instruction built (single instruction, CPI handled internally)');

    // Step 4: Flash Payback
    console.log('\n[4/4] Building Flash Payback...');
    const flashPaybackIx = await getFlashPaybackIx({
      asset: collateralMint,
      amount: new BN(flashLoanAmountRaw),
      signer: userPublicKey,
      connection,
    });

    // 组合所有指令
    const allInstructions: TransactionInstruction[] = [
      flashBorrowIx,
      ...swapInstructions,
      operateIx, // 单条 operate 指令！
      flashPaybackIx,
    ];

    console.log('\n═══ Transaction Summary ═══');
    console.log('Total instructions:', allInstructions.length);
    allInstructions.forEach((ix, i) => {
      console.log(`  ${i + 1}. Program: ${ix.programId.toString().slice(0, 8)}..., Keys: ${ix.keys.length}, Data: ${ix.data.length} bytes`);
    });

    // 获取 address lookup tables
    const addressLookupTableAccounts: any[] = [];
    const seenKeys = new Set<string>();

    if (operateContext.addressLookupTableAccounts) {
      for (const lut of operateContext.addressLookupTableAccounts) {
        const key = lut.key.toString();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          addressLookupTableAccounts.push(lut);
        }
      }
    }

    if (swapResult.addressLookupTableAddresses) {
      for (const address of swapResult.addressLookupTableAddresses) {
        const result = await connection.getAddressLookupTable(new PublicKey(address));
        if (result.value) {
          const key = result.value.key.toString();
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            addressLookupTableAccounts.push(result.value);
          }
        }
      }
    }

    console.log('Lookup tables:', addressLookupTableAccounts.length);

    // 构建交易
    const latestBlockhash = await connection.getLatestBlockhash('finalized');

    const messageV0 = new TransactionMessage({
      payerKey: userPublicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: allInstructions,
    }).compileToV0Message(addressLookupTableAccounts);

    const transaction = new VersionedTransaction(messageV0);

    // 检查大小
    let serializedTx;
    try {
      serializedTx = transaction.serialize();
      console.log('\n═══ Transaction Size ═══');
      console.log('Size:', serializedTx.length, 'bytes');
      console.log('Limit: 1232 bytes');

      if (serializedTx.length <= 1232) {
        console.log('✅ Under limit!');
      } else {
        console.log('❌ Over by:', serializedTx.length - 1232, 'bytes');
      }
    } catch (error) {
      console.error('❌ Transaction too large to serialize');
      throw new Error(`Transaction exceeds maximum size. Instructions: ${allInstructions.length}`);
    }

    console.log('\n✅ Transaction built successfully!');
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
    console.error('\n❌ Error:', error);
    throw error;
  }
}
