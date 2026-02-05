import { Connection, PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import { getOperateIx } from '@jup-ag/lend/borrow';
import BN from 'bn.js';

export interface RebalanceParams {
  sourceVaultId: number;
  sourcePositionId: number;
  targetVaultId: number;
  targetPositionId: number;
  collateralAmount: number;       // UI amount to move
  collateralDecimals: number;     // Token decimals (e.g. 6 for JLP)
  userPublicKey: PublicKey;
  connection: Connection;
}

export interface RebalanceResult {
  transactions: VersionedTransaction[];  // 1 or 2 TXs
  mode: 'single' | 'jito-bundle';
}

/**
 * Build rebalance transaction(s): withdraw from source vault, deposit into target vault.
 * Tries single TX first; if too large, returns 2 TXs for Jito Bundle.
 */
export async function buildRebalanceTransaction(params: RebalanceParams): Promise<RebalanceResult> {
  const {
    sourceVaultId, sourcePositionId,
    targetVaultId, targetPositionId,
    collateralAmount, collateralDecimals,
    userPublicKey, connection,
  } = params;

  const scale = Math.pow(10, collateralDecimals);
  const amountRaw = Math.floor(collateralAmount * scale);

  console.log('\n════════════════════════════════════════');
  console.log('  Cross-Vault Collateral Rebalance');
  console.log('════════════════════════════════════════');
  console.log(`Source: vault ${sourceVaultId}, position ${sourcePositionId}`);
  console.log(`Target: vault ${targetVaultId}, position ${targetPositionId}`);
  console.log(`Amount: ${collateralAmount} (raw: ${amountRaw})`);

  // Step 1: Build withdraw instruction (source vault)
  const withdrawResult = await getOperateIx({
    vaultId: sourceVaultId,
    positionId: sourcePositionId,
    colAmount: new BN(-amountRaw),  // negative = withdraw
    debtAmount: new BN(0),          // no debt change
    connection,
    signer: userPublicKey,
    recipient: userPublicKey,
    positionOwner: userPublicKey,
  });

  // Step 2: Build deposit instruction (target vault)
  const depositResult = await getOperateIx({
    vaultId: targetVaultId,
    positionId: targetPositionId,
    colAmount: new BN(amountRaw),   // positive = deposit
    debtAmount: new BN(0),          // no debt change
    connection,
    signer: userPublicKey,
    recipient: userPublicKey,
    positionOwner: userPublicKey,
  });

  // Collect all address lookup tables
  const seenKeys = new Set<string>();
  const allLuts: any[] = [];
  for (const lut of [...(withdrawResult.addressLookupTableAccounts ?? []), ...(depositResult.addressLookupTableAccounts ?? [])]) {
    const key = lut.key.toString();
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      allLuts.push(lut);
    }
  }

  // Try single transaction
  const allInstructions: TransactionInstruction[] = [
    ...withdrawResult.ixs,
    ...depositResult.ixs,
  ];

  const latestBlockhash = await connection.getLatestBlockhash('finalized');

  try {
    const message = new TransactionMessage({
      payerKey: userPublicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: allInstructions,
    }).compileToV0Message(allLuts);

    const tx = new VersionedTransaction(message);
    const serialized = tx.serialize();

    if (serialized.length <= 1232) {
      console.log(`Single transaction: ${serialized.length} bytes`);
      return { transactions: [tx], mode: 'single' };
    }
    console.log(`Single TX too large: ${serialized.length} bytes, falling back to Jito Bundle`);
  } catch {
    console.log('Single TX failed to serialize, falling back to Jito Bundle');
  }

  // Fallback: two transactions for Jito Bundle
  const { createJitoTipInstruction } = await import('./jito-bundle');
  const tipIx = createJitoTipInstruction(userPublicKey, 10000);

  const tx1Message = new TransactionMessage({
    payerKey: userPublicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: withdrawResult.ixs,
  }).compileToV0Message(withdrawResult.addressLookupTableAccounts ?? []);

  const tx2Message = new TransactionMessage({
    payerKey: userPublicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [...depositResult.ixs, tipIx],
  }).compileToV0Message(depositResult.addressLookupTableAccounts ?? []);

  const tx1 = new VersionedTransaction(tx1Message);
  const tx2 = new VersionedTransaction(tx2Message);

  console.log('Jito Bundle: 2 transactions built');
  return { transactions: [tx1, tx2], mode: 'jito-bundle' };
}
