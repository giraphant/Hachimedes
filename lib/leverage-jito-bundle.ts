import { Connection, PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import { getOperateIx } from '@jup-ag/lend/borrow';
import { createJupiterApiClient } from '@jup-ag/api';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import BN from 'bn.js';

export interface LeverageJitoBundleParams {
  collateralMint: PublicKey; // JLP
  debtMint: PublicKey;        // USDS
  borrowAmount: number;       // 要借的 USDS 数量
  userPublicKey: PublicKey;
  vaultId: number;
  positionId: number;
  connection: Connection;
  slippageBps?: number;
  preferredDexes?: string[];
  onlyDirectRoutes?: boolean;
}

/**
 * 构建 Leverage 三交易 Bundle（使用 Jito Bundle）
 *
 * 流程：
 * TX1: Borrow USDS（基于现有抵押品）
 * TX2: Swap USDS → JLP (via Jupiter)
 * TX3: Deposit JLP（增加抵押品）
 *
 * 优势：
 * - 每个交易都很小，不会超过大小限制
 * - Jito Bundle 保证原子性（全成功或全失败）
 * - 不需要 Flash Loan 费用
 */
export async function buildLeverageJitoBundle(params: LeverageJitoBundleParams) {
  const {
    collateralMint,
    debtMint,
    borrowAmount,
    userPublicKey,
    vaultId,
    positionId,
    connection,
    slippageBps = 10,
    preferredDexes,
    onlyDirectRoutes = false,
  } = params;

  console.log('\n════════════════════════════════════════');
  console.log('  Leverage with Jito Bundle (3 TXs)');
  console.log('════════════════════════════════════════');
  console.log('Borrow Amount:', borrowAmount, 'USDS');
  console.log('Vault ID:', vaultId);
  console.log('Position ID:', positionId);

  try {
    const borrowAmountRaw = Math.floor(borrowAmount * 1e6);

    // ============================================================
    // TX1: Borrow USDS
    // ============================================================
    console.log('\n[TX1] Building Borrow USDS transaction...');

    const borrowResult = await getOperateIx({
      vaultId,
      positionId,
      colAmount: new BN(0), // 不改变抵押品
      debtAmount: new BN(borrowAmountRaw), // 借出 USDS
      connection,
      signer: userPublicKey,
      recipient: userPublicKey,
      positionOwner: userPublicKey,
    });

    const borrowInstructions = borrowResult.ixs;
    console.log('✓ Borrow instructions:', borrowInstructions.length);

    // ============================================================
    // TX2: Swap USDS → JLP
    // ============================================================
    console.log('\n[TX2] Building Swap USDS → JLP transaction...');

    const userUsdsAta = getAssociatedTokenAddressSync(debtMint, userPublicKey);
    const userJlpAta = getAssociatedTokenAddressSync(collateralMint, userPublicKey);

    const jupiterApi = createJupiterApiClient();

    let quoteResponse;
    if (preferredDexes && preferredDexes.length > 0) {
      console.log('Using user-preferred DEXes:', preferredDexes.join(', '));
      quoteResponse = await jupiterApi.quoteGet({
        inputMint: debtMint.toString(),
        outputMint: collateralMint.toString(),
        amount: borrowAmountRaw,
        slippageBps,
        dexes: preferredDexes,
        onlyDirectRoutes,
      });
    } else {
      console.log('Using auto DEX selection...');
      quoteResponse = await jupiterApi.quoteGet({
        inputMint: debtMint.toString(),
        outputMint: collateralMint.toString(),
        amount: borrowAmountRaw,
        slippageBps,
        onlyDirectRoutes,
      });
    }

    console.log('Swap quote:');
    console.log('  Input:', parseInt(quoteResponse.inAmount) / 1e6, 'USDS');
    console.log('  Output:', parseInt(quoteResponse.outAmount) / 1e6, 'JLP');

    const swapResult = await jupiterApi.swapInstructionsPost({
      swapRequest: {
        quoteResponse,
        userPublicKey: userPublicKey.toString(),
        wrapAndUnwrapSol: false,
        useSharedAccounts: true,
        destinationTokenAccount: userJlpAta.toString(),
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
    // TX3: Deposit JLP
    // ============================================================
    console.log('\n[TX3] Building Deposit JLP transaction...');

    const depositAmountRaw = parseInt(quoteResponse.outAmount);

    const depositResult = await getOperateIx({
      vaultId,
      positionId,
      colAmount: new BN(depositAmountRaw), // 存入 JLP
      debtAmount: new BN(0), // 不改变债务
      connection,
      signer: userPublicKey,
      recipient: userPublicKey,
      positionOwner: userPublicKey,
    });

    const depositInstructions = depositResult.ixs;
    console.log('✓ Deposit instructions:', depositInstructions.length);

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

    // Add from borrow
    if (borrowResult.addressLookupTableAccounts) {
      for (const lut of borrowResult.addressLookupTableAccounts) {
        const key = lut.key.toString();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          addressLookupTableAccounts.push(lut);
        }
      }
    }

    // Add from deposit
    if (depositResult.addressLookupTableAccounts) {
      for (const lut of depositResult.addressLookupTableAccounts) {
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

    // Build TX1: Borrow
    const tx1Message = new TransactionMessage({
      payerKey: userPublicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: borrowInstructions,
    }).compileToV0Message(borrowResult.addressLookupTableAccounts || []);

    const tx1 = new VersionedTransaction(tx1Message);

    // Build TX2: Swap
    const tx2Message = new TransactionMessage({
      payerKey: userPublicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: swapInstructions,
    }).compileToV0Message(addressLookupTableAccounts);

    const tx2 = new VersionedTransaction(tx2Message);

    // Build TX3: Deposit
    const tx3Message = new TransactionMessage({
      payerKey: userPublicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: depositInstructions,
    }).compileToV0Message(depositResult.addressLookupTableAccounts || []);

    const tx3 = new VersionedTransaction(tx3Message);

    // Check sizes
    const tx1Size = tx1.serialize().length;
    const tx2Size = tx2.serialize().length;
    const tx3Size = tx3.serialize().length;

    console.log('\nTransaction sizes:');
    console.log('  TX1 (Borrow):', tx1Size, 'bytes');
    console.log('  TX2 (Swap):', tx2Size, 'bytes');
    console.log('  TX3 (Deposit):', tx3Size, 'bytes');
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
