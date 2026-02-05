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

const MAX_TX_SIZE = 1232; // Solana max transaction size

/**
 * Build rebalance transaction(s): withdraw from source vault, deposit into target vault.
 * Tries single TX first; if too large, returns 2 TXs for Jito Bundle.
 *
 * ⚠️ IMPORTANT: Source vault must have enough "free" collateral.
 * Free collateral = collateral - (debt / price / maxLtv)
 * If withdrawing would push LTV above max, the transaction will fail.
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
  console.log(`Amount: ${collateralAmount} (raw: ${amountRaw})  [scale: ${scale}, decimals: ${collateralDecimals}]`);

  // Step 1: Build withdraw instruction (source vault)
  console.log('\n[Step 1] Building withdraw instruction from source vault...');
  console.log(`  getOperateIx({ vaultId: ${sourceVaultId}, positionId: ${sourcePositionId}, colAmount: -${amountRaw}, debtAmount: 0 })`);
  let withdrawResult;
  try {
    withdrawResult = await getOperateIx({
      vaultId: sourceVaultId,
      positionId: sourcePositionId,
      colAmount: new BN(-amountRaw),  // negative = withdraw
      debtAmount: new BN(0),          // no debt change
      connection,
      signer: userPublicKey,
      recipient: userPublicKey,
      positionOwner: userPublicKey,
    });
    console.log(`  ✓ Withdraw IX built: ${withdrawResult.ixs.length} instructions`);
  } catch (err) {
    console.error(`  ✗ Failed to build withdraw IX:`, err);
    throw new Error(`Failed to build withdraw from source vault: ${err}`);
  }

  // Step 2: Build deposit instruction (target vault)
  console.log('\n[Step 2] Building deposit instruction to target vault...');
  console.log(`  getOperateIx({ vaultId: ${targetVaultId}, positionId: ${targetPositionId}, colAmount: ${amountRaw}, debtAmount: 0 })`);
  let depositResult;
  try {
    depositResult = await getOperateIx({
      vaultId: targetVaultId,
      positionId: targetPositionId,
      colAmount: new BN(amountRaw),   // positive = deposit
      debtAmount: new BN(0),          // no debt change
      connection,
      signer: userPublicKey,
      recipient: userPublicKey,
      positionOwner: userPublicKey,
    });
    console.log(`  ✓ Deposit IX built: ${depositResult.ixs.length} instructions`);
  } catch (err) {
    console.error(`  ✗ Failed to build deposit IX:`, err);
    throw new Error(`Failed to build deposit to target vault: ${err}`);
  }

  // Collect all address lookup tables (deduplicated)
  const seenKeys = new Set<string>();
  const allLuts: any[] = [];
  for (const lut of [...(withdrawResult.addressLookupTableAccounts ?? []), ...(depositResult.addressLookupTableAccounts ?? [])]) {
    const key = lut.key.toString();
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      allLuts.push(lut);
    }
  }

  const latestBlockhash = await connection.getLatestBlockhash('finalized');

  // Step 3: Try to build a single combined transaction
  console.log('\n[Step 3] Trying single atomic transaction (withdraw + deposit)...');
  const combinedIxs = [...withdrawResult.ixs, ...depositResult.ixs];

  const singleTxMessage = new TransactionMessage({
    payerKey: userPublicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: combinedIxs,
  }).compileToV0Message(allLuts);

  const singleTx = new VersionedTransaction(singleTxMessage);
  const singleTxSize = singleTx.serialize().length;

  console.log(`  Combined TX size: ${singleTxSize} bytes (max: ${MAX_TX_SIZE})`);

  if (singleTxSize <= MAX_TX_SIZE) {
    // Single TX fits! Simulate it
    console.log('\n[Step 4] Simulating single atomic transaction...');
    try {
      const simResult = await connection.simulateTransaction(singleTx, {
        sigVerify: false,
        replaceRecentBlockhash: true,
      });

      if (simResult.value.err) {
        console.error('Single TX simulation failed:', simResult.value.err);
        console.error('Logs:', simResult.value.logs);
        const logs = simResult.value.logs || [];
        const errorLog = logs.find(l => l.includes('Error:') || l.includes('failed:'));
        throw new Error(`Simulation failed: ${errorLog || JSON.stringify(simResult.value.err)}`);
      }
      console.log('  ✓ Single TX simulation passed');
      console.log(`\n✅ Returning single atomic transaction (${singleTxSize} bytes)`);
      return { transactions: [singleTx], mode: 'single' };
    } catch (simErr: any) {
      console.error('  ✗ Single TX simulation error:', simErr.message);
      // Fall through to try Jito bundle
    }
  } else {
    console.log(`  ✗ TX too large (${singleTxSize} > ${MAX_TX_SIZE}), will use Jito bundle`);
  }

  // Step 4: Build two separate transactions for Jito bundle
  console.log('\n[Step 4] Building Jito bundle (2 TXs)...');

  const tx1Message = new TransactionMessage({
    payerKey: userPublicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: withdrawResult.ixs,
  }).compileToV0Message(withdrawResult.addressLookupTableAccounts ?? []);

  const tx2Message = new TransactionMessage({
    payerKey: userPublicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: depositResult.ixs,
  }).compileToV0Message(depositResult.addressLookupTableAccounts ?? []);

  const tx1 = new VersionedTransaction(tx1Message);
  const tx2 = new VersionedTransaction(tx2Message);

  // Simulate withdraw transaction
  console.log('\n[Step 5] Simulating withdraw transaction...');
  try {
    const simResult = await connection.simulateTransaction(tx1, {
      sigVerify: false,
      replaceRecentBlockhash: true,
    });

    if (simResult.value.err) {
      console.error('Withdraw simulation failed:', simResult.value.err);
      console.error('Logs:', simResult.value.logs);
      const logs = simResult.value.logs || [];
      const errorLog = logs.find(l => l.includes('Error:') || l.includes('failed:'));
      throw new Error(`Withdraw simulation failed: ${errorLog || JSON.stringify(simResult.value.err)}`);
    }
    console.log('  ✓ Withdraw simulation passed');
  } catch (simErr: any) {
    if (simErr.message?.includes('simulation failed') || simErr.message?.includes('Withdraw simulation')) {
      throw simErr;
    }
    throw new Error(`Withdraw simulation error: ${simErr.message || simErr}`);
  }

  console.log(`\n✅ Returning Jito bundle (2 TXs)`);
  console.log(`  TX1 (withdraw): ${tx1.serialize().length} bytes`);
  console.log(`  TX2 (deposit): ${tx2.serialize().length} bytes`);

  return { transactions: [tx1, tx2], mode: 'jito-bundle' };
}
